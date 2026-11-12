import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { auth, badRequest, forbidden, notFound, parse } from '../http.js';
import { canonicalize, readPayload, verifyChain, type LedgerEntry } from '../lib/ledger.js';
import { createBooking, getRequest } from '../services/bookingService.js';

const Assign = z.object({
  request_id: z.number().int().positive(),
  tutor_id: z.number().int().positive(),
  start_at: z.iso.datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(240).default(60),
});

const Tamper = z.object({
  seq: z.number().int().positive(),
  /**
   * blocked: a plain UPDATE, exactly what someone with database access would
   *          try. The append-only trigger rejects it.
   * bypass:  switches the trigger off for one transaction and rewrites the
   *          entry without touching its hash, standing in for an attacker who
   *          got past the database rule. Verification then fails at this entry.
   */
  mode: z.enum(['blocked', 'bypass']),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});

const ratio = (num: number, den: number) => ({ numerator: num, denominator: den, rate: den === 0 ? null : Math.round((num / den) * 1000) / 1000 });

export function adminRoutes(db: Db): Router {
  const r = Router();
  r.use('/admin', auth('admin'));

  r.get('/admin/users', async (_req, res) => {
    res.json((await db.query('SELECT id, email, role, name, major, modality, created_at FROM users ORDER BY id')).rows);
  });

  /** Manual matching (D1): an administrator assigns a tutor to an open request. */
  r.post('/admin/assign', async (req, res) => {
    const body = parse(Assign, req.body);
    const request = await getRequest(db, body.request_id);
    const tutor = (await db.query(`SELECT id FROM users WHERE id = $1 AND role = 'tutor'`, [body.tutor_id])).rows[0];
    if (!tutor) throw notFound('Tutor');
    if (tutor.id === request.student_id) throw badRequest('A student cannot be assigned as their own tutor');
    const booking = await db.tx((q) =>
      createBooking(q, {
        request,
        tutorId: body.tutor_id,
        startAt: body.start_at,
        durationMin: body.duration_min,
        actorId: req.user!.id,
        assignedBy: req.user!.id,
      }),
    );
    res.status(201).json(booking);
  });

  /** Raw counts for the admin view. Each rate is returned with its numerator and denominator. */
  r.get('/admin/stats', async (_req, res) => {
    const count = async (sql: string) => Object.fromEntries((await db.query<{ k: string; n: number }>(sql)).rows.map((x) => [x.k, x.n]));
    const [users, requests, bookings, events, ledger] = await Promise.all([
      count('SELECT role AS k, count(*)::int AS n FROM users GROUP BY role'),
      count('SELECT status AS k, count(*)::int AS n FROM help_requests GROUP BY status'),
      count('SELECT state AS k, count(*)::int AS n FROM bookings GROUP BY state'),
      count('SELECT action AS k, count(*)::int AS n FROM booking_events GROUP BY action'),
      count('SELECT entry_type AS k, count(*)::int AS n FROM ledger_entries GROUP BY entry_type'),
    ]);
    const openDisputes = (await db.query(`SELECT count(*)::int AS n FROM disputes WHERE status = 'open'`)).rows[0].n;
    const accepted = events.accept ?? 0;
    const declined = events.decline ?? 0;
    res.json({
      users,
      requests,
      bookings,
      ledger_entries: ledger,
      open_disputes: openDisputes,
      // accepted / (accepted + declined): of the bookings tutors answered, how many they took.
      acceptance: ratio(accepted, accepted + declined),
      // completed / confirmed: of the sessions that were scheduled, how many both parties attested.
      completion: ratio(events.complete ?? 0, events.confirm ?? 0),
    });
  });

  /** Tamper demonstration (H1). See the Tamper schema above for the two modes. */
  r.post('/admin/tamper', async (req, res) => {
    const body = parse(Tamper, req.body);
    const entry = (await db.query<LedgerEntry>('SELECT * FROM ledger_entries WHERE seq = $1', [body.seq])).rows[0];
    if (!entry) throw notFound('Ledger entry');

    const original = readPayload(entry);
    const forged = canonicalize({
      ...original,
      ...(body.rating !== undefined ? { rating: body.rating } : {}),
      ...(body.comment !== undefined ? { comment: body.comment } : {}),
      ...(body.rating === undefined && body.comment === undefined ? { tampered: true } : {}),
    });

    if (body.mode === 'blocked') {
      try {
        await db.query('UPDATE ledger_entries SET payload = $1 WHERE seq = $2', [forged, body.seq]);
      } catch (err: any) {
        res.json({ mode: 'blocked', changed: false, database_error: String(err?.message ?? err), verification: await verifyChain(db) });
        return;
      }
      // Reaching here means the trigger is missing, which is itself the finding.
      res.status(500).json({ mode: 'blocked', changed: true, database_error: null, verification: await verifyChain(db) });
      return;
    }

    if (!config.allowTamperDemo) throw forbidden('The bypass tamper action is disabled (ALLOW_TAMPER_DEMO=false)');
    await db.tx(async (q) => {
      await q.query(
        'INSERT INTO tamper_backup (seq, original_payload) VALUES ($1, $2) ON CONFLICT (seq) DO NOTHING',
        [entry.seq, entry.payload],
      );
      await q.query(`SET LOCAL vouch.allow_tamper = 'on'`);
      await q.query('UPDATE ledger_entries SET payload = $1 WHERE seq = $2', [forged, body.seq]);
      await q.query(`SET LOCAL vouch.allow_tamper = 'off'`);
    });
    res.json({
      mode: 'bypass',
      changed: true,
      seq: entry.seq,
      before: original,
      after: JSON.parse(forged),
      stored_hash_unchanged: entry.hash,
      verification: await verifyChain(db),
    });
  });

  /** Puts every tampered entry back so the demo can be rehearsed again. */
  r.post('/admin/tamper/restore', async (_req, res) => {
    if (!config.allowTamperDemo) throw forbidden('The bypass tamper action is disabled (ALLOW_TAMPER_DEMO=false)');
    const restored = await db.tx(async (q) => {
      const backups = (await q.query<{ seq: number; original_payload: string }>('SELECT seq, original_payload FROM tamper_backup ORDER BY seq')).rows;
      await q.query(`SET LOCAL vouch.allow_tamper = 'on'`);
      for (const b of backups) {
        await q.query('UPDATE ledger_entries SET payload = $1 WHERE seq = $2', [b.original_payload, b.seq]);
      }
      await q.query(`SET LOCAL vouch.allow_tamper = 'off'`);
      await q.query('DELETE FROM tamper_backup');
      return backups.map((b) => b.seq);
    });
    res.json({ restored_seqs: restored, verification: await verifyChain(db) });
  });

  return r;
}
