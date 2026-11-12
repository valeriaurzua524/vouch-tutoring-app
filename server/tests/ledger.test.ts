import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/index.js';
import { openTestDb } from './helpers.js';
import { seedDemo } from '../src/db/seed.js';
import {
  appendEntry,
  canonicalize,
  computeHash,
  GENESIS_HASH,
  loadEntries,
  verifyChain,
  verifyEntries,
} from '../src/lib/ledger.js';

/**
 * Ledger integrity suite (backlog J1). Works on the database directly, below
 * the HTTP layer, because this is the property the whole product rests on.
 */
let db: Db;
let bookingIds: number[] = [];

/** Runs fn with the append-only trigger switched off, as an attacker past the database rule would. */
const bypassing = (fn: (q: Parameters<Parameters<Db['tx']>[0]>[0]) => Promise<void>) =>
  db.tx(async (q) => {
    await q.query(`SET LOCAL vouch.allow_tamper = 'on'`);
    await fn(q);
  });

beforeAll(async () => {
  db = await openTestDb();
  await seedDemo(db);
  const student = (await db.query(`SELECT id FROM users WHERE email = 'alex.kim@cpp.edu'`)).rows[0].id;
  const tutor = (await db.query(`SELECT id FROM users WHERE email = 'maya.chen@cpp.edu'`)).rows[0].id;
  for (let i = 0; i < 5; i++) {
    const request = (await db.query(
      `INSERT INTO help_requests (student_id, course_code, windows) VALUES ($1, 'CS 3310', '[]'::jsonb) RETURNING id`,
      [student],
    )).rows[0].id;
    const booking = (await db.query(
      `INSERT INTO bookings (request_id, student_id, tutor_id, state, start_at, duration_min)
       VALUES ($1, $2, $3, 'completed', now(), 60) RETURNING id`,
      [request, student, tutor],
    )).rows[0].id;
    bookingIds.push(booking);
    await db.tx((q) => appendEntry(q, 'ATTESTATION', booking, { booking_id: booking, n: i }));
  }
  await db.tx((q) => appendEntry(q, 'REVIEW', bookingIds[0], { booking_id: bookingIds[0], rating: 2, comment: 'Late and unprepared.' }));
});

afterAll(() => db.close());

describe('hashing', () => {
  it('canonical JSON ignores key order and nests deterministically', () => {
    expect(canonicalize({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}');
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it('every field feeds the hash', () => {
    const base = { seq: 1, entry_type: 'REVIEW' as const, booking_id: 7, payload: '{"rating":2}', created_at: '2026-11-11T00:00:00.000Z', prev_hash: GENESIS_HASH };
    const h = computeHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeHash({ ...base })).toBe(h);
    expect(computeHash({ ...base, seq: 2 })).not.toBe(h);
    expect(computeHash({ ...base, entry_type: 'ATTESTATION' })).not.toBe(h);
    expect(computeHash({ ...base, booking_id: 8 })).not.toBe(h);
    expect(computeHash({ ...base, payload: '{"rating":5}' })).not.toBe(h);
    expect(computeHash({ ...base, created_at: '2026-11-11T00:00:00.001Z' })).not.toBe(h);
    expect(computeHash({ ...base, prev_hash: 'f'.repeat(64) })).not.toBe(h);
  });
});

describe('an untouched chain', () => {
  it('links every entry to the one before it and verifies', async () => {
    const entries = await loadEntries(db);
    expect(entries).toHaveLength(6);
    expect(entries[0].prev_hash).toBe(GENESIS_HASH);
    for (let i = 1; i < entries.length; i++) expect(entries[i].prev_hash).toBe(entries[i - 1].hash);
    expect(await verifyChain(db)).toMatchObject({ valid: true, total_entries: 6, verified_entries: 6, broken_at_seq: null });
  });

  it('an empty ledger is valid', () => {
    expect(verifyEntries([])).toMatchObject({ valid: true, total_entries: 0, head_hash: null });
  });
});

describe('the database refuses changes', () => {
  it('rejects UPDATE', async () => {
    await expect(db.query(`UPDATE ledger_entries SET payload = '{"rating":5}' WHERE seq = 6`)).rejects.toThrow(/append-only/);
  });
  it('rejects DELETE', async () => {
    await expect(db.query('DELETE FROM ledger_entries WHERE seq = 6')).rejects.toThrow(/append-only/);
  });
  it('rejects TRUNCATE', async () => {
    await expect(db.query('TRUNCATE ledger_entries')).rejects.toThrow(/append-only/);
  });
  it('rejects a second review for the same booking', async () => {
    await expect(db.tx((q) => appendEntry(q, 'REVIEW', bookingIds[0], { rating: 5 }))).rejects.toThrow();
    expect((await loadEntries(db)).length).toBe(6); // the failed append left nothing behind
  });
  it('still verifies after all of those attempts', async () => {
    expect((await verifyChain(db)).valid).toBe(true);
  });
});

describe('tampering past the database rule is detected', () => {
  it('altered contents: reports the exact entry', async () => {
    const original = (await loadEntries(db))[5].payload;
    await bypassing((q) => q.query(`UPDATE ledger_entries SET payload = $1 WHERE seq = 6`, [original.replace('"rating":2', '"rating":5')]).then(() => {}));
    expect(await verifyChain(db)).toMatchObject({ valid: false, broken_at_seq: 6, reason: 'HASH_MISMATCH', verified_entries: 5 });
    await bypassing((q) => q.query('UPDATE ledger_entries SET payload = $1 WHERE seq = 6', [original]).then(() => {}));
    expect((await verifyChain(db)).valid).toBe(true);
  });

  it('altered and re-hashed: the next entry no longer links', async () => {
    const entries = await loadEntries(db);
    const victim = entries[2];
    const forged = { ...victim, payload: '{"booking_id":0,"n":99}' };
    await bypassing((q) => q.query('UPDATE ledger_entries SET payload = $1, hash = $2 WHERE seq = 3', [forged.payload, computeHash(forged)]).then(() => {}));
    expect(await verifyChain(db)).toMatchObject({ valid: false, broken_at_seq: 4, reason: 'PREV_HASH_MISMATCH', verified_entries: 3 });
    await bypassing((q) => q.query('UPDATE ledger_entries SET payload = $1, hash = $2 WHERE seq = 3', [victim.payload, victim.hash]).then(() => {}));
    expect((await verifyChain(db)).valid).toBe(true);
  });

  it('a removed entry leaves a gap', () => {
    return loadEntries(db).then((entries) => {
      const without4 = entries.filter((e) => e.seq !== 4);
      expect(verifyEntries(without4)).toMatchObject({ valid: false, broken_at_seq: 4, reason: 'SEQ_GAP', verified_entries: 3 });
    });
  });

  it('a full rewrite with every hash recomputed passes on its own, and fails against an anchor', async () => {
    const honest = await loadEntries(db);
    const anchor = { seq: 6, hash: honest[5].hash };

    // Rebuild the whole chain from entry 6's forged contents onward.
    const forged = honest.map((e) => ({ ...e }));
    forged[5].payload = forged[5].payload.replace('"rating":2', '"rating":5');
    forged[5].hash = computeHash(forged[5]);

    expect(verifyEntries(forged).valid).toBe(true); // the limit of a hash chain by itself
    expect(verifyEntries(forged, anchor)).toMatchObject({ valid: false, broken_at_seq: 6, reason: 'ANCHOR_MISMATCH' });
    expect(verifyEntries(honest, anchor).valid).toBe(true);
    // Dropping the tail is also invisible without an anchor, and visible with one.
    expect(verifyEntries(honest.slice(0, 5)).valid).toBe(true);
    expect(verifyEntries(honest.slice(0, 5), anchor)).toMatchObject({ valid: false, reason: 'ANCHOR_MISMATCH' });
  });
});

describe('concurrent appends', () => {
  it('do not fork the chain', async () => {
    const before = (await loadEntries(db)).length;
    const extra = bookingIds.slice(1, 4);
    await Promise.all(extra.map((b) => db.tx((q) => appendEntry(q, 'DISPUTE_FILED', b, { booking_id: b, reason: 'concurrency check' }))));
    const result = await verifyChain(db);
    expect(result).toMatchObject({ valid: true, total_entries: before + extra.length });
  });
});
