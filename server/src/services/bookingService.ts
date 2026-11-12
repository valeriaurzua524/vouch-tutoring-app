import type { Queryable } from '../db/index.js';
import { conflict, notFound } from '../http.js';
import { ACTIVE_STATES } from '../lib/bookingMachine.js';
import type { HelpRequestRow } from './matchService.js';

export interface BookingRow {
  id: number;
  request_id: number;
  student_id: number;
  tutor_id: number;
  state: 'requested' | 'accepted' | 'scheduled' | 'completed' | 'declined' | 'cancelled';
  start_at: Date;
  duration_min: number;
  assigned_by: number | null;
  score_snapshot: unknown;
  created_at: Date;
  updated_at: Date;
}

export async function getRequest(q: Queryable, id: number): Promise<HelpRequestRow> {
  const row = (await q.query<HelpRequestRow>('SELECT * FROM help_requests WHERE id = $1', [id])).rows[0];
  if (!row) throw notFound('Help request');
  return row;
}

export async function getBooking(q: Queryable, id: number): Promise<BookingRow> {
  const row = (await q.query<BookingRow>('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];
  if (!row) throw notFound('Booking');
  return row;
}

/**
 * Creates a booking in the "requested" state and takes the help request off the
 * market. Used by the student flow (from a ranked match) and by manual admin
 * assignment. Run inside a transaction.
 */
export async function createBooking(
  q: Queryable,
  args: {
    request: HelpRequestRow;
    tutorId: number;
    startAt: string;
    durationMin: number;
    actorId: number;
    assignedBy?: number;
    scoreSnapshot?: unknown;
  },
): Promise<BookingRow> {
  // Row lock so two bookings cannot claim the same open request.
  const fresh = (await q.query<{ status: string }>(
    'SELECT status FROM help_requests WHERE id = $1 FOR UPDATE',
    [args.request.id],
  )).rows[0];
  if (fresh.status !== 'open') throw conflict(`This help request is ${fresh.status}, not open`);

  const booking = (await q.query<BookingRow>(
    `INSERT INTO bookings (request_id, student_id, tutor_id, start_at, duration_min, assigned_by, score_snapshot)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7::jsonb) RETURNING *`,
    [
      args.request.id,
      args.request.student_id,
      args.tutorId,
      args.startAt,
      args.durationMin,
      args.assignedBy ?? null,
      args.scoreSnapshot ? JSON.stringify(args.scoreSnapshot) : null,
    ],
  )).rows[0];

  await q.query(`UPDATE help_requests SET status = 'booked' WHERE id = $1`, [args.request.id]);
  await q.query(
    `INSERT INTO booking_events (booking_id, actor_id, action, from_state, to_state) VALUES ($1, $2, $3, NULL, 'requested')`,
    [booking.id, args.actorId, args.assignedBy ? 'admin_assign' : 'request'],
  );
  return booking;
}

export const activeStatesSql = ACTIVE_STATES.map((s) => `'${s}'`).join(',');
