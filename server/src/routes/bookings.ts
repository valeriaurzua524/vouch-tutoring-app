import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import type { Db, Queryable } from '../db/index.js';
import { auth, badRequest, conflict, forbidden, idParam, notFound, parse } from '../http.js';
import { checkTransition, type Actor, type BookingAction } from '../lib/bookingMachine.js';
import { summarizeSession } from '../lib/intake.js';
import { appendEntry, readPayload, type LedgerEntry } from '../lib/ledger.js';
import { createBooking, getBooking, getRequest, type BookingRow } from '../services/bookingService.js';
import { rankTutors } from '../services/matchService.js';

const NewBooking = z.object({
  request_id: z.number().int().positive(),
  tutor_id: z.number().int().positive(),
  start_at: z.iso.datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(240).default(60),
});

const NewReview = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(''),
});

const NewSummary = z.object({
  notes: z.string().trim().min(1).max(4000),
  // Optional overrides. When omitted they are derived from the notes.
  concepts: z.array(z.string()).max(20).optional(),
  gaps: z.array(z.string()).max(20).optional(),
});

/** The caller's relationship to a booking decides what they may do, not their account role. */
function actorOf(booking: BookingRow, userId: number): Actor | null {
  if (booking.student_id === userId) return 'student';
  if (booking.tutor_id === userId) return 'tutor';
  return null;
}

const LIST_SQL = `
  SELECT b.*, s.name AS student_name, t.name AS tutor_name, h.course_code, h.tags AS request_tags
    FROM bookings b
    JOIN users s ON s.id = b.student_id
    JOIN users t ON t.id = b.tutor_id
    JOIN help_requests h ON h.id = b.request_id`;

async function ledgerFor(q: Queryable, bookingId: number): Promise<LedgerEntry[]> {
  return (await q.query<LedgerEntry>(
    'SELECT seq, entry_type, booking_id, payload, created_at, prev_hash, hash FROM ledger_entries WHERE booking_id = $1 ORDER BY seq',
    [bookingId],
  )).rows;
}

export function bookingRoutes(db: Db): Router {
  const r = Router();

  /** A student books a tutor from their ranked matches. Starts in "requested". */
  r.post('/bookings', auth(), async (req, res) => {
    const body = parse(NewBooking, req.body);
    const request = await getRequest(db, body.request_id);
    if (request.student_id !== req.user!.id) throw forbidden('You can only book for your own help request');

    // Students reach tutors through the match flow only, so the tutor must be an eligible match.
    const match = (await rankTutors(db, request)).find((m) => m.tutor_id === body.tutor_id);
    if (!match) throw badRequest('That tutor is not an eligible match for this request');

    const booking = await db.tx((q) =>
      createBooking(q, {
        request,
        tutorId: body.tutor_id,
        startAt: body.start_at,
        durationMin: body.duration_min,
        actorId: req.user!.id,
        scoreSnapshot: { rank: match.rank, ...match.breakdown },
      }),
    );
    res.status(201).json(booking);
  });

  r.get('/bookings', auth(), async (req, res) => {
    const rows =
      req.user!.role === 'admin'
        ? (await db.query(`${LIST_SQL} ORDER BY b.id DESC`)).rows
        : (await db.query(`${LIST_SQL} WHERE b.student_id = $1 OR b.tutor_id = $1 ORDER BY b.id DESC`, [req.user!.id])).rows;
    res.json(rows);
  });

  r.get('/bookings/:id', auth(), async (req, res) => {
    const id = idParam(req);
    const booking = (await db.query(`${LIST_SQL} WHERE b.id = $1`, [id])).rows[0];
    if (!booking) throw notFound('Booking');
    if (req.user!.role !== 'admin' && !actorOf(booking, req.user!.id)) throw forbidden();

    const [events, attestations, summary, ledger] = await Promise.all([
      db.query('SELECT actor_id, action, from_state, to_state, at FROM booking_events WHERE booking_id = $1 ORDER BY id', [id]),
      db.query('SELECT user_id, attested_at FROM attestations WHERE booking_id = $1 ORDER BY attested_at', [id]),
      db.query('SELECT notes, concepts, gaps, source, created_at FROM session_summaries WHERE booking_id = $1', [id]),
      ledgerFor(db, id),
    ]);
    const review = ledger.find((e) => e.entry_type === 'REVIEW');
    res.json({
      ...booking,
      events: events.rows,
      attestations: attestations.rows,
      can_review: booking.state === 'completed' && !review,
      review: review ? { seq: review.seq, hash: review.hash, ...readPayload(review) } : null,
      summary: summary.rows[0] ?? null,
      ledger: ledger.map((e) => ({ ...e, payload: readPayload(e) })),
    });
  });

  /** accept / decline (tutor), confirm (student), cancel (either). */
  async function transition(req: Request, action: BookingAction) {
    const booking = await getBooking(db, idParam(req));
    const actor = actorOf(booking, req.user!.id);
    if (!actor) throw forbidden();
    const check = checkTransition(booking.state, action, actor);
    if (!check.ok) {
      throw check.reason === 'WRONG_ACTOR'
        ? forbidden(`Only the ${action === 'confirm' ? 'student' : 'tutor'} can ${action} this booking`)
        : conflict(`Cannot ${action} a booking that is ${booking.state}`);
    }
    return db.tx(async (q) => {
      // The state guard in WHERE makes the transition safe against a concurrent one.
      const updated = (await q.query<BookingRow>(
        'UPDATE bookings SET state = $1, updated_at = now() WHERE id = $2 AND state = $3 RETURNING *',
        [check.to, booking.id, booking.state],
      )).rows[0];
      if (!updated) throw conflict('This booking was changed by someone else. Reload and try again.');
      await q.query(
        'INSERT INTO booking_events (booking_id, actor_id, action, from_state, to_state) VALUES ($1, $2, $3, $4, $5)',
        [booking.id, req.user!.id, action, booking.state, check.to],
      );
      if (check.to === 'declined' || check.to === 'cancelled') {
        // The request goes back on the market so the student can pick another tutor.
        await q.query(`UPDATE help_requests SET status = 'open' WHERE id = $1`, [booking.request_id]);
      }
      return updated;
    });
  }

  for (const action of ['accept', 'decline', 'confirm', 'cancel'] as const) {
    r.post(`/bookings/:id/${action}`, auth(), async (req, res) => {
      res.json(await transition(req, action));
    });
  }

  /**
   * Dual-party attestation (E3). Each party confirms the session took place.
   * The second confirmation completes the booking and writes one ATTESTATION
   * entry to the ledger. That entry is what a review must point at.
   */
  r.post('/bookings/:id/attest', auth(), async (req, res) => {
    const booking = await getBooking(db, idParam(req));
    const actor = actorOf(booking, req.user!.id);
    if (!actor) throw forbidden();
    if (booking.state === 'completed') throw conflict('This session is already attested by both parties');
    if (booking.state !== 'scheduled') throw conflict(`Only a scheduled session can be attested (this booking is ${booking.state})`);
    if (config.enforceSessionTime && new Date(booking.start_at).getTime() > Date.now()) {
      throw conflict('This session has not started yet');
    }

    const out = await db.tx(async (q) => {
      await q.query(
        'INSERT INTO attestations (booking_id, user_id, attested_at) VALUES ($1, $2, $3) ON CONFLICT (booking_id, user_id) DO NOTHING',
        [booking.id, req.user!.id, new Date().toISOString()],
      );
      const rows = (await q.query<{ user_id: number; attested_at: string }>(
        'SELECT user_id, attested_at FROM attestations WHERE booking_id = $1',
        [booking.id],
      )).rows;
      const student = rows.find((a) => a.user_id === booking.student_id);
      const tutor = rows.find((a) => a.user_id === booking.tutor_id);
      if (!student || !tutor) {
        return { state: booking.state, attested_by: rows.map((a) => a.user_id), waiting_on: student ? 'tutor' : 'student', ledger_entry: null };
      }

      const updated = (await q.query(
        `UPDATE bookings SET state = 'completed', updated_at = now() WHERE id = $1 AND state = 'scheduled' RETURNING id`,
        [booking.id],
      )).rows[0];
      if (!updated) throw conflict('This booking was changed by someone else. Reload and try again.');
      await q.query(
        `INSERT INTO booking_events (booking_id, actor_id, action, from_state, to_state) VALUES ($1, NULL, 'complete', 'scheduled', 'completed')`,
        [booking.id],
      );
      await q.query(`UPDATE help_requests SET status = 'fulfilled' WHERE id = $1`, [booking.request_id]);
      const request = await getRequest(q, booking.request_id);
      const entry = await appendEntry(q, 'ATTESTATION', booking.id, {
        booking_id: booking.id,
        student_id: booking.student_id,
        tutor_id: booking.tutor_id,
        course_code: request.course_code,
        session_start: new Date(booking.start_at).toISOString(),
        duration_min: booking.duration_min,
        student_attested_at: student.attested_at,
        tutor_attested_at: tutor.attested_at,
      });
      return { state: 'completed', attested_by: rows.map((a) => a.user_id), waiting_on: null, ledger_entry: entry };
    });
    res.json(out);
  });

  /**
   * Review capture (F4). Three conditions, all checked against the ledger:
   *   1. the caller is the student of this booking,
   *   2. an ATTESTATION entry exists for it (both parties confirmed),
   *   3. no REVIEW entry exists for it yet (also a unique index in the database).
   */
  r.post('/bookings/:id/review', auth(), async (req, res) => {
    const body = parse(NewReview, req.body);
    const booking = await getBooking(db, idParam(req));
    if (booking.student_id !== req.user!.id) throw forbidden('Only the student of this session can review it');

    const entry = await db.tx(async (q) => {
      const existing = await ledgerFor(q, booking.id);
      const attestation = existing.find((e) => e.entry_type === 'ATTESTATION');
      if (!attestation) throw conflict('A review needs an attested session: both parties must confirm it took place first');
      if (existing.some((e) => e.entry_type === 'REVIEW')) throw conflict('This session already has a review. Reviews cannot be edited or replaced.');
      const request = await getRequest(q, booking.request_id);
      return appendEntry(q, 'REVIEW', booking.id, {
        booking_id: booking.id,
        attestation_seq: attestation.seq,
        attestation_hash: attestation.hash,
        reviewer_id: booking.student_id,
        tutor_id: booking.tutor_id,
        course_code: request.course_code,
        rating: body.rating,
        comment: body.comment,
      });
    });
    res.status(201).json({ ...entry, payload: readPayload(entry) });
  });

  /**
   * Session summary (D7). Advisory content, stored outside the ledger. Gaps are
   * added to the student's profile and offered as topic suggestions next time.
   */
  r.post('/bookings/:id/summary', auth(), async (req, res) => {
    const body = parse(NewSummary, req.body);
    const booking = await getBooking(db, idParam(req));
    if (booking.tutor_id !== req.user!.id) throw forbidden('Only the tutor of this session can write its summary');
    if (booking.state !== 'completed') throw conflict('A summary can be written once the session is completed');

    const request = await getRequest(db, booking.request_id);
    const course = (await db.query<{ topics: Array<{ tag: string }> }>('SELECT topics FROM courses WHERE code = $1', [request.course_code])).rows[0];
    const allowed = new Set(course.topics.map((t) => t.tag));
    const derived = await summarizeSession(request.course_code, body.notes);
    const clean = (list: string[]) => [...new Set(list.filter((t) => allowed.has(t)))];
    const concepts = clean(body.concepts ?? derived.concepts);
    const gaps = clean(body.gaps ?? derived.gaps);
    const source = body.concepts || body.gaps ? 'tutor' : derived.source;

    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO session_summaries (booking_id, author_id, notes, concepts, gaps, source)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
         ON CONFLICT (booking_id) DO UPDATE
           SET notes = EXCLUDED.notes, concepts = EXCLUDED.concepts, gaps = EXCLUDED.gaps, source = EXCLUDED.source`,
        [booking.id, req.user!.id, body.notes, JSON.stringify(concepts), JSON.stringify(gaps), source],
      );
      for (const tag of gaps) {
        await q.query(
          `INSERT INTO student_gaps (student_id, course_code, tag, booking_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (student_id, course_code, tag) DO NOTHING`,
          [booking.student_id, request.course_code, tag, booking.id],
        );
      }
    });
    res.status(201).json({ booking_id: booking.id, notes: body.notes, concepts, gaps, source });
  });

  return r;
}
