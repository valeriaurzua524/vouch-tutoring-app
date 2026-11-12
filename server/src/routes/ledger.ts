import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { auth, badRequest, conflict, forbidden, idParam, notFound, parse } from '../http.js';
import { appendEntry, loadEntries, readPayload, verifyChain, type Anchor } from '../lib/ledger.js';
import { getBooking } from '../services/bookingService.js';

const NewDispute = z.object({
  booking_id: z.number().int().positive(),
  target: z.enum(['review', 'session']),
  reason: z.string().trim().min(10, 'Explain the problem in at least 10 characters').max(2000),
});

const Resolution = z.object({
  outcome: z.enum(['upheld', 'rejected']),
  note: z.string().trim().min(1).max(2000),
});

export function ledgerRoutes(db: Db): Router {
  const r = Router();

  /**
   * Chain verification (F3). Public on purpose: the pitch is a record anyone
   * can audit. Returns the first broken link and why.
   *
   * Optional anchor_seq + anchor_hash: a head recorded earlier from
   * /ledger/head. With an anchor, verification also catches history that was
   * rewritten and fully re-hashed, and truncation of the tail.
   */
  r.get('/ledger/verify', async (req, res) => {
    let anchor: Anchor | undefined;
    if (req.query.anchor_seq !== undefined || req.query.anchor_hash !== undefined) {
      const seq = Number(req.query.anchor_seq);
      const hash = String(req.query.anchor_hash ?? '');
      if (!Number.isInteger(seq) || seq < 1 || !/^[0-9a-f]{64}$/.test(hash)) {
        throw badRequest('anchor_seq must be a positive integer and anchor_hash a 64-character hex SHA-256');
      }
      anchor = { seq, hash };
    }
    res.json({ ...(await verifyChain(db, anchor)), anchored: !!anchor, verified_at: new Date().toISOString() });
  });

  /** Current head. Record it somewhere the database owner cannot edit, then pass it back to /ledger/verify. */
  r.get('/ledger/head', async (_req, res) => {
    const head = (await db.query('SELECT seq, hash, created_at FROM ledger_entries ORDER BY seq DESC LIMIT 1')).rows[0];
    res.json(head ?? { seq: 0, hash: null, created_at: null });
  });

  r.get('/ledger', auth(), async (_req, res) => {
    res.json((await loadEntries(db)).map((e) => ({ ...e, payload: readPayload(e) })));
  });

  r.get('/ledger/:seq', auth(), async (req, res) => {
    const seq = idParam(req, 'seq');
    const entry = (await loadEntries(db)).find((e) => e.seq === seq);
    if (!entry) throw notFound('Ledger entry');
    res.json({ ...entry, payload: readPayload(entry) });
  });

  /**
   * Disputes (G1). Text records; filing and resolution are both written to the
   * ledger, so the history of a challenged review is as tamper-evident as the
   * review itself.
   */
  r.post('/disputes', auth(), async (req, res) => {
    const body = parse(NewDispute, req.body);
    const booking = await getBooking(db, body.booking_id);
    if (booking.student_id !== req.user!.id && booking.tutor_id !== req.user!.id) throw forbidden();
    if (!['scheduled', 'completed'].includes(booking.state)) {
      throw conflict(`A dispute needs a scheduled or completed session (this booking is ${booking.state})`);
    }

    const dispute = await db.tx(async (q) => {
      if (body.target === 'review') {
        const review = (await q.query(`SELECT 1 FROM ledger_entries WHERE booking_id = $1 AND entry_type = 'REVIEW'`, [booking.id])).rows[0];
        if (!review) throw conflict('This session has no review to dispute');
      }
      const open = (await q.query(
        `SELECT 1 FROM disputes WHERE booking_id = $1 AND target = $2 AND status = 'open'`,
        [booking.id, body.target],
      )).rows[0];
      if (open) throw conflict('There is already an open dispute of this kind for this session');

      const row = (await q.query(
        'INSERT INTO disputes (booking_id, filed_by, target, reason) VALUES ($1, $2, $3, $4) RETURNING *',
        [booking.id, req.user!.id, body.target, body.reason],
      )).rows[0];
      const entry = await appendEntry(q, 'DISPUTE_FILED', booking.id, {
        dispute_id: row.id,
        booking_id: booking.id,
        filed_by: req.user!.id,
        target: body.target,
        reason: body.reason,
      });
      return { ...row, ledger_seq: entry.seq, ledger_hash: entry.hash };
    });
    res.status(201).json(dispute);
  });

  r.get('/disputes', auth(), async (req, res) => {
    const rows =
      req.user!.role === 'admin'
        ? (await db.query('SELECT * FROM disputes ORDER BY id DESC')).rows
        : (await db.query(
            `SELECT d.* FROM disputes d JOIN bookings b ON b.id = d.booking_id
              WHERE b.student_id = $1 OR b.tutor_id = $1 ORDER BY d.id DESC`,
            [req.user!.id],
          )).rows;
    res.json(rows);
  });

  /** Upholding a dispute against a review retracts it from the average. The review entry itself stays. */
  r.post('/disputes/:id/resolve', auth('admin'), async (req, res) => {
    const body = parse(Resolution, req.body);
    const id = idParam(req);
    const out = await db.tx(async (q) => {
      const row = (await q.query(
        `UPDATE disputes SET status = 'resolved', outcome = $2, resolution_note = $3, resolved_by = $4, resolved_at = now()
          WHERE id = $1 AND status = 'open' RETURNING *`,
        [id, body.outcome, body.note, req.user!.id],
      )).rows[0];
      if (!row) {
        const exists = (await q.query('SELECT 1 FROM disputes WHERE id = $1', [id])).rows[0];
        throw exists ? conflict('This dispute is already resolved') : notFound('Dispute');
      }
      const entry = await appendEntry(q, 'DISPUTE_RESOLVED', row.booking_id, {
        dispute_id: row.id,
        booking_id: row.booking_id,
        target: row.target,
        outcome: body.outcome,
        note: body.note,
        resolved_by: req.user!.id,
      });
      return { ...row, ledger_seq: entry.seq, ledger_hash: entry.hash };
    });
    res.json(out);
  });

  return r;
}
