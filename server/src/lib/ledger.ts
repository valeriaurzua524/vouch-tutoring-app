import { createHash } from 'node:crypto';
import type { Queryable } from '../db/index.js';

/**
 * Tamper-evident reputation ledger (backlog F1-F3).
 *
 *   hash_n = SHA-256( canonical({ seq, entry_type, booking_id, payload, created_at, prev_hash }) )
 *   prev_hash_n = hash_(n-1)          prev_hash_1 = 64 zeros
 *
 * Changing any stored field of entry n changes what hash_n should be, so the
 * stored hash_n no longer matches. Recomputing hash_n to hide that breaks
 * entry n+1, whose prev_hash still holds the old value. Deleting an entry
 * leaves a gap in seq.
 *
 * What the chain does NOT prove on its own: someone who can bypass the
 * database triggers could rewrite an entry and recompute every hash after it,
 * or drop entries off the end, and the result would be internally consistent.
 * Detecting that needs a head hash held somewhere else. GET /api/ledger/head
 * exposes one to record, and verifyChain accepts it back as an anchor.
 */

export const GENESIS_HASH = '0'.repeat(64);

export type EntryType = 'ATTESTATION' | 'REVIEW' | 'DISPUTE_FILED' | 'DISPUTE_RESOLVED';

export interface LedgerEntry {
  seq: number;
  entry_type: EntryType;
  booking_id: number;
  payload: string;
  created_at: string;
  prev_hash: string;
  hash: string;
}

/** JSON with object keys sorted at every level, so equal data gives equal bytes. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

export function computeHash(e: Omit<LedgerEntry, 'hash'>): string {
  const material = canonicalize({
    seq: e.seq,
    entry_type: e.entry_type,
    booking_id: e.booking_id,
    payload: e.payload,
    created_at: e.created_at,
    prev_hash: e.prev_hash,
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/**
 * Appends one entry. MUST be called inside a transaction (pass the tx handle):
 * the table lock serialises writers so two appends cannot read the same head
 * and fork the chain. The lock is released when the transaction ends.
 */
export async function appendEntry(
  q: Queryable,
  entryType: EntryType,
  bookingId: number,
  payload: Record<string, unknown>,
): Promise<LedgerEntry> {
  await q.query('LOCK TABLE ledger_entries IN EXCLUSIVE MODE');
  const head = (await q.query<{ seq: number; hash: string }>(
    'SELECT seq, hash FROM ledger_entries ORDER BY seq DESC LIMIT 1',
  )).rows[0];

  const draft = {
    seq: head ? head.seq + 1 : 1,
    entry_type: entryType,
    booking_id: bookingId,
    payload: canonicalize(payload),
    created_at: new Date().toISOString(),
    prev_hash: head ? head.hash : GENESIS_HASH,
  };
  const entry: LedgerEntry = { ...draft, hash: computeHash(draft) };

  await q.query(
    `INSERT INTO ledger_entries (seq, entry_type, booking_id, payload, created_at, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entry.seq, entry.entry_type, entry.booking_id, entry.payload, entry.created_at, entry.prev_hash, entry.hash],
  );
  return entry;
}

export type BreakReason = 'SEQ_GAP' | 'HASH_MISMATCH' | 'PREV_HASH_MISMATCH' | 'ANCHOR_MISMATCH';

export interface VerifyResult {
  valid: boolean;
  total_entries: number;
  /** Entries confirmed intact before the first break (all of them when valid). */
  verified_entries: number;
  head_seq: number | null;
  head_hash: string | null;
  broken_at_seq: number | null;
  reason: BreakReason | null;
  detail: string | null;
}

export interface Anchor {
  seq: number;
  hash: string;
}

/** Pure check over rows already loaded, ordered by seq. Reports the first break. */
export function verifyEntries(entries: LedgerEntry[], anchor?: Anchor): VerifyResult {
  const head = entries.at(-1) ?? null;
  const result = (
    verified: number,
    brokenAt: number | null,
    reason: BreakReason | null,
    detail: string | null,
  ): VerifyResult => ({
    valid: reason === null,
    total_entries: entries.length,
    verified_entries: verified,
    head_seq: head?.seq ?? null,
    head_hash: head?.hash ?? null,
    broken_at_seq: brokenAt,
    reason,
    detail,
  });

  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expectedSeq = i + 1;
    if (e.seq !== expectedSeq) {
      return result(i, expectedSeq, 'SEQ_GAP', `Expected entry ${expectedSeq} but found ${e.seq}: an entry was removed.`);
    }
    if (computeHash(e) !== e.hash) {
      return result(i, e.seq, 'HASH_MISMATCH', `Entry ${e.seq} no longer matches its recorded hash: its contents were altered.`);
    }
    if (e.prev_hash !== expectedPrev) {
      return result(i, e.seq, 'PREV_HASH_MISMATCH', `Entry ${e.seq} does not link to entry ${e.seq - 1}: an earlier entry was rewritten or replaced.`);
    }
    expectedPrev = e.hash;
  }

  if (anchor) {
    const at = entries[anchor.seq - 1];
    if (!at) {
      return result(entries.length, anchor.seq, 'ANCHOR_MISMATCH', `Anchored entry ${anchor.seq} is missing: the ledger was truncated.`);
    }
    if (at.hash !== anchor.hash) {
      return result(anchor.seq - 1, anchor.seq, 'ANCHOR_MISMATCH', `Entry ${anchor.seq} does not match the externally recorded hash: history was rewritten and re-hashed.`);
    }
  }
  return result(entries.length, null, null, null);
}

export async function loadEntries(q: Queryable): Promise<LedgerEntry[]> {
  return (await q.query<LedgerEntry>(
    'SELECT seq, entry_type, booking_id, payload, created_at, prev_hash, hash FROM ledger_entries ORDER BY seq ASC',
  )).rows;
}

export async function verifyChain(q: Queryable, anchor?: Anchor): Promise<VerifyResult> {
  return verifyEntries(await loadEntries(q), anchor);
}

/** Parses a stored payload for display. Never used for hashing. */
export function readPayload(entry: Pick<LedgerEntry, 'payload'>): Record<string, any> {
  try {
    return JSON.parse(entry.payload);
  } catch {
    return { unreadable: true };
  }
}
