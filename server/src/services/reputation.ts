import type { Queryable } from '../db/index.js';
import { readPayload, type LedgerEntry } from '../lib/ledger.js';

/**
 * Reputation is read from the ledger and nowhere else. There is no separate
 * "reviews" table that could drift from, or be edited independently of, the
 * hash chain.
 *
 * A review cannot be deleted. If an administrator upholds a dispute against it,
 * a DISPUTE_RESOLVED entry is appended and the review is marked retracted: it
 * stays visible in the record but stops counting toward the average.
 */
export interface Review {
  seq: number;
  hash: string;
  prev_hash: string;
  booking_id: number;
  tutor_id: number;
  reviewer_id: number;
  course_code: string;
  rating: number;
  comment: string;
  created_at: string;
  retracted: boolean;
}

export interface Reputation {
  rating_avg: number | null;
  rating_count: number;
}

export async function loadReviews(q: Queryable): Promise<Review[]> {
  const rows = (await q.query<LedgerEntry>(
    `SELECT seq, entry_type, booking_id, payload, created_at, prev_hash, hash
       FROM ledger_entries
      WHERE entry_type IN ('REVIEW', 'DISPUTE_RESOLVED')
      ORDER BY seq ASC`,
  )).rows;

  const retracted = new Set<number>();
  for (const r of rows) {
    if (r.entry_type !== 'DISPUTE_RESOLVED') continue;
    const p = readPayload(r);
    if (p.target === 'review' && p.outcome === 'upheld') retracted.add(r.booking_id);
  }

  return rows
    .filter((r) => r.entry_type === 'REVIEW')
    .map((r) => {
      const p = readPayload(r);
      return {
        seq: r.seq,
        hash: r.hash,
        prev_hash: r.prev_hash,
        booking_id: r.booking_id,
        tutor_id: Number(p.tutor_id),
        reviewer_id: Number(p.reviewer_id),
        course_code: String(p.course_code ?? ''),
        rating: Number(p.rating),
        comment: String(p.comment ?? ''),
        created_at: r.created_at,
        retracted: retracted.has(r.booking_id),
      };
    });
}

export function summarize(reviews: Review[]): Reputation {
  const counted = reviews.filter((r) => !r.retracted && Number.isFinite(r.rating));
  if (counted.length === 0) return { rating_avg: null, rating_count: 0 };
  const sum = counted.reduce((s, r) => s + r.rating, 0);
  return { rating_avg: Math.round((sum / counted.length) * 100) / 100, rating_count: counted.length };
}

export async function reputationByTutor(q: Queryable): Promise<Map<number, Reputation>> {
  const grouped = new Map<number, Review[]>();
  for (const r of await loadReviews(q)) {
    grouped.set(r.tutor_id, [...(grouped.get(r.tutor_id) ?? []), r]);
  }
  return new Map([...grouped].map(([id, list]) => [id, summarize(list)]));
}
