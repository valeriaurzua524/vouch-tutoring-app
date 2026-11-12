import type { Express } from 'express';
import request from 'supertest';
import { config } from '../src/config.js';
import { signToken } from '../src/http.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db/index.js';
import { openTestDb } from './helpers.js';
import { DEMO_PASSWORD, seedDemo } from '../src/db/seed.js';

/**
 * End-to-end suite over HTTP (backlog J2). Follows the demo the handout names:
 * book, complete, review, then attempt to alter the review and fail.
 */
let db: Db;
let app: Express;
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

const api = (who: string | null, method: 'get' | 'post' | 'put' | 'patch', path: string, body?: unknown) => {
  const req = request(app)[method](`/api${path}`);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body as object);
};

beforeAll(async () => {
  db = await openTestDb();
  await seedDemo(db);
  app = createApp(db);
  for (const [who, email] of Object.entries({
    admin: 'admin@cpp.edu',
    maya: 'maya.chen@cpp.edu',
    diego: 'diego.ramirez@cpp.edu',
    priya: 'priya.nair@cpp.edu',
    alex: 'alex.kim@cpp.edu',
    jordan: 'jordan.lee@cpp.edu',
  })) {
    const res = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    tokens[who] = res.body.token;
    ids[who] = res.body.user.id;
  }
});

afterAll(() => db.close());

describe('accounts', () => {
  it('registers a campus account and rejects other domains, duplicates and weak passwords', async () => {
    const ok = await api(null, 'post', '/auth/register', { email: 'New.Tutor@cpp.edu', password: 'long-enough-1', name: 'New Tutor', role: 'tutor' });
    expect(ok.status).toBe(201);
    expect(ok.body.user).toMatchObject({ email: 'new.tutor@cpp.edu', role: 'tutor' });
    expect(ok.body.user.password_hash).toBeUndefined();

    expect((await api(null, 'post', '/auth/register', { email: 'x@gmail.com', password: 'long-enough-1', name: 'X', role: 'student' })).status).toBe(400);
    expect((await api(null, 'post', '/auth/register', { email: 'new.tutor@cpp.edu', password: 'long-enough-1', name: 'Dup', role: 'tutor' })).status).toBe(409);
    expect((await api(null, 'post', '/auth/register', { email: 'y@cpp.edu', password: 'short', name: 'Y', role: 'student' })).status).toBe(400);
    expect((await api(null, 'post', '/auth/register', { email: 'z@cpp.edu', password: 'long-enough-1', name: 'Z', role: 'admin' })).status).toBe(400);
  });

  it('rejects bad credentials and missing tokens', async () => {
    expect((await api(null, 'post', '/auth/login', { email: 'alex.kim@cpp.edu', password: 'wrong' })).status).toBe(401);
    expect((await api(null, 'get', '/me')).status).toBe(401);
    expect((await api('alex', 'get', '/admin/users')).status).toBe(403);
  });

  it('a tutor edits profile, coursework and availability', async () => {
    const res = await api('maya', 'patch', '/me', { bio: 'Updated bio' });
    expect(res.body.bio).toBe('Updated bio');
    expect((await api('maya', 'patch', '/me', { tags: ['not-a-tag'] })).status).toBe(400);
    expect((await api('maya', 'put', '/me/availability', { blocks: [{ day_of_week: 2, start_min: 600, end_min: 500 }] })).status).toBe(400);
    expect((await api('maya', 'get', '/me/availability')).body.blocks).toHaveLength(3);
    expect((await api(null, 'get', '/courses')).body).toHaveLength(10);
  });
});

describe('the demo path', () => {
  it('intake turns free text into fields', async () => {
    const res = await api('alex', 'post', '/intake', { text: 'lost on dynamic programming, midterm Thursday' });
    expect(res.body).toMatchObject({ course_code: 'CS 3310', tags: ['dynamic-programming'], exam: 'midterm', source: 'rules', cached: false });
    expect((await api('alex', 'post', '/intake', { text: 'lost on dynamic programming, midterm Thursday' })).body.cached).toBe(true);
  });

  it('a student posts a request and gets ranked, explained matches', async () => {
    const created = await api('alex', 'post', '/requests', {
      course_code: 'CS 3310',
      professor: 'Prof. Alvarez',
      tags: ['dynamic-programming', 'recurrences'],
      windows: [{ day_of_week: 2, start_min: 840, end_min: 960 }], // Tue 14:00-16:00
      description: 'Midterm Thursday, lost on DP.',
    });
    expect(created.status).toBe(201);
    ids.request = created.body.id;

    const res = await api('alex', 'get', `/requests/${ids.request}/matches`);
    expect(res.status).toBe(200);
    const names = res.body.matches.map((m: any) => m.name);
    // Maya: exact course, same professor, free the whole window, both tags.
    //   0.40*1 + 0.30*1 + 0.20*1 + 0.10*0.5 - 0 = 0.95
    // Diego: exact course, not free on Tuesday, one of two tags.
    //   0.40*1 + 0.30*0 + 0.20*0.5 + 0.10*0.5 - 0 = 0.55
    expect(names.slice(0, 2)).toEqual(['Maya Chen', 'Diego Ramirez']);
    expect(res.body.matches[0].breakdown.score).toBe(0.95);
    expect(res.body.matches[0].breakdown.same_professor).toBe(true);
    expect(res.body.matches[1].breakdown.score).toBe(0.55);
    // Priya has no CS coursework, so she is filtered out, not ranked last.
    expect(names).not.toContain('Priya Nair');
    // Someone else's request is private.
    expect((await api('jordan', 'get', `/requests/${ids.request}/matches`)).status).toBe(403);
  });

  it('booking follows the state machine and refuses shortcuts', async () => {
    const notAMatch = await api('alex', 'post', '/bookings', { request_id: ids.request, tutor_id: ids.priya, start_at: '2026-11-17T22:00:00Z' });
    expect(notAMatch.status).toBe(400);

    const created = await api('alex', 'post', '/bookings', { request_id: ids.request, tutor_id: ids.maya, start_at: '2026-11-17T22:00:00Z', duration_min: 90 });
    expect(created.status).toBe(201);
    expect(created.body.state).toBe('requested');
    expect(created.body.score_snapshot.score).toBe(0.95);
    ids.booking = created.body.id;

    // The request is off the market while this booking is live.
    expect((await api('alex', 'post', '/bookings', { request_id: ids.request, tutor_id: ids.diego, start_at: '2026-11-17T22:00:00Z' })).status).toBe(409);

    expect((await api('alex', 'post', `/bookings/${ids.booking}/accept`)).status).toBe(403); // student cannot accept
    expect((await api('diego', 'post', `/bookings/${ids.booking}/accept`)).status).toBe(403); // not a party
    expect((await api('alex', 'post', `/bookings/${ids.booking}/confirm`)).status).toBe(409); // not accepted yet
    expect((await api('maya', 'post', `/bookings/${ids.booking}/attest`)).status).toBe(409); // not scheduled yet

    expect((await api('maya', 'post', `/bookings/${ids.booking}/accept`)).body.state).toBe('accepted');
    expect((await api('alex', 'post', `/bookings/${ids.booking}/confirm`)).body.state).toBe('scheduled');
  });

  it('a review is impossible until both parties attest', async () => {
    const early = await api('alex', 'post', `/bookings/${ids.booking}/review`, { rating: 5 });
    expect(early.status).toBe(409);

    const first = await api('alex', 'post', `/bookings/${ids.booking}/attest`);
    expect(first.body).toMatchObject({ state: 'scheduled', waiting_on: 'tutor', ledger_entry: null });
    expect((await api('alex', 'post', `/bookings/${ids.booking}/review`, { rating: 5 })).status).toBe(409); // one attestation is not enough
    expect((await api('alex', 'post', `/bookings/${ids.booking}/attest`)).body.waiting_on).toBe('tutor'); // repeating changes nothing

    const second = await api('maya', 'post', `/bookings/${ids.booking}/attest`);
    expect(second.body.state).toBe('completed');
    expect(second.body.ledger_entry).toMatchObject({ seq: 1, entry_type: 'ATTESTATION' });
  });

  it('the review is written to the ledger once, by the student only', async () => {
    expect((await api('maya', 'post', `/bookings/${ids.booking}/review`, { rating: 5 })).status).toBe(403);
    expect((await api('alex', 'post', `/bookings/${ids.booking}/review`, { rating: 6 })).status).toBe(400);

    const res = await api('alex', 'post', `/bookings/${ids.booking}/review`, { rating: 2, comment: 'Showed up late.' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ seq: 2, entry_type: 'REVIEW' });
    expect(res.body.payload).toMatchObject({ rating: 2, attestation_seq: 1, tutor_id: ids.maya });
    ids.reviewSeq = res.body.seq;

    expect((await api('alex', 'post', `/bookings/${ids.booking}/review`, { rating: 5 })).status).toBe(409);

    const tutor = await api('alex', 'get', `/tutors/${ids.maya}`);
    expect(tutor.body.reputation).toEqual({ rating_avg: 2, rating_count: 1 });
    expect(tutor.body.reviews[0]).toMatchObject({ seq: 2, rating: 2, retracted: false });
    expect((await api(null, 'get', '/ledger/verify')).body).toMatchObject({ valid: true, total_entries: 2 });
  });

  it('altering the review: the database blocks it, and a bypass is caught by verification', async () => {
    const head = (await api(null, 'get', '/ledger/head')).body;

    const blocked = await api('admin', 'post', '/admin/tamper', { seq: ids.reviewSeq, mode: 'blocked', rating: 5 });
    expect(blocked.body).toMatchObject({ changed: false, verification: { valid: true } });
    expect(blocked.body.database_error).toMatch(/append-only/);

    expect((await api('maya', 'post', '/admin/tamper', { seq: ids.reviewSeq, mode: 'bypass', rating: 5 })).status).toBe(403);

    const bypass = await api('admin', 'post', '/admin/tamper', { seq: ids.reviewSeq, mode: 'bypass', rating: 5, comment: 'Best tutor ever.' });
    expect(bypass.body.after.rating).toBe(5);
    expect(bypass.body.verification).toMatchObject({ valid: false, broken_at_seq: ids.reviewSeq, reason: 'HASH_MISMATCH', verified_entries: 1 });
    expect((await api(null, 'get', '/ledger/verify')).body.valid).toBe(false);

    const restored = await api('admin', 'post', '/admin/tamper/restore');
    expect(restored.body).toMatchObject({ restored_seqs: [ids.reviewSeq], verification: { valid: true } });
    const anchored = await api(null, 'get', `/ledger/verify?anchor_seq=${head.seq}&anchor_hash=${head.hash}`);
    expect(anchored.body).toMatchObject({ valid: true, anchored: true });
    expect((await api('alex', 'get', `/tutors/${ids.maya}`)).body.reviews[0].rating).toBe(2);
  });
});

describe('after the session', () => {
  it('a summary records gaps that come back as suggestions', async () => {
    expect((await api('alex', 'post', `/bookings/${ids.booking}/summary`, { notes: 'x' })).status).toBe(403);
    const res = await api('maya', 'post', `/bookings/${ids.booking}/summary`, {
      notes: 'Worked through dynamic programming with knapsack. Still shaky on recurrences.',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ gaps: ['recurrences'], source: 'rules' });
    expect((await api('alex', 'get', '/me')).body.gaps).toEqual([{ course_code: 'CS 3310', tag: 'recurrences' }]);
    const intake = await api('alex', 'post', '/intake', { text: 'need help with greedy in CS 3310' });
    expect(intake.body.suggested_tags_from_past_sessions).toEqual(['recurrences']);
    // The summary never touched the ledger.
    expect((await api(null, 'get', '/ledger/verify')).body.total_entries).toBe(2);
  });

  it('an upheld dispute retracts the review without deleting it', async () => {
    expect((await api('diego', 'post', '/disputes', { booking_id: ids.booking, target: 'review', reason: 'I was not in this session.' })).status).toBe(403);
    const filed = await api('maya', 'post', '/disputes', { booking_id: ids.booking, target: 'review', reason: 'I was on time; the room was locked.' });
    expect(filed.status).toBe(201);
    expect(filed.body.ledger_seq).toBe(3);
    expect((await api('maya', 'post', '/disputes', { booking_id: ids.booking, target: 'review', reason: 'Filing the same thing again.' })).status).toBe(409);
    expect((await api('maya', 'post', `/disputes/${filed.body.id}/resolve`, { outcome: 'upheld', note: 'x' })).status).toBe(403);

    const resolved = await api('admin', 'post', `/disputes/${filed.body.id}/resolve`, { outcome: 'upheld', note: 'Facilities confirmed the room was locked.' });
    expect(resolved.body).toMatchObject({ status: 'resolved', outcome: 'upheld', ledger_seq: 4 });
    expect((await api('admin', 'post', `/disputes/${filed.body.id}/resolve`, { outcome: 'rejected', note: 'again' })).status).toBe(409);

    const tutor = await api('alex', 'get', `/tutors/${ids.maya}`);
    expect(tutor.body.reputation).toEqual({ rating_avg: null, rating_count: 0 });
    expect(tutor.body.reviews[0]).toMatchObject({ rating: 2, retracted: true }); // still on the record
    expect((await api(null, 'get', '/ledger/verify')).body).toMatchObject({ valid: true, total_entries: 4 });
  });
});

describe('other paths', () => {
  it('a decline reopens the request; an admin can then assign by hand', async () => {
    const req = await api('jordan', 'post', '/requests', {
      course_code: 'MAT 1150',
      tags: ['series'],
      windows: [{ day_of_week: 1, start_min: 1020, end_min: 1140 }],
      modality: 'online',
    });
    const matches = await api('jordan', 'get', `/requests/${req.body.id}/matches`);
    expect(matches.body.matches[0].name).toBe('Priya Nair');

    const booking = await api('jordan', 'post', '/bookings', { request_id: req.body.id, tutor_id: ids.priya, start_at: '2026-11-16T01:00:00Z' });
    expect((await api('priya', 'post', `/bookings/${booking.body.id}/decline`)).body.state).toBe('declined');
    expect((await api('jordan', 'get', `/requests/${req.body.id}`)).body.status).toBe('open');

    expect((await api('jordan', 'post', '/admin/assign', { request_id: req.body.id, tutor_id: ids.priya, start_at: '2026-11-16T01:00:00Z' })).status).toBe(403);
    const assigned = await api('admin', 'post', '/admin/assign', { request_id: req.body.id, tutor_id: ids.priya, start_at: '2026-11-16T01:00:00Z' });
    expect(assigned.status).toBe(201);
    expect(assigned.body).toMatchObject({ state: 'requested', assigned_by: ids.admin });

    // Priya now has one active booking, so her load penalty shows up for the next student.
    expect((await api('priya', 'post', `/bookings/${assigned.body.id}/cancel`)).body.state).toBe('cancelled');
  });

  it('admin stats report rates with their numerators and denominators', async () => {
    const res = await api('admin', 'get', '/admin/stats');
    expect(res.body.acceptance).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(res.body.completion).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    expect(res.body.ledger_entries).toEqual({ ATTESTATION: 1, REVIEW: 1, DISPUTE_FILED: 1, DISPUTE_RESOLVED: 1 });
  });

  it('unknown routes and malformed bodies get clean errors', async () => {
    expect((await api(null, 'get', '/nope')).status).toBe(404);
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400);
  });

  it('an oversized body is a 413, not a server error', async () => {
    const res = await api('alex', 'post', '/intake', { text: 'x'.repeat(300_000) });
    expect(res.status).toBe(413);
  });

  it('a token for an account that no longer exists is told to sign in again', async () => {
    tokens.ghost = signToken({ id: 999_999, role: 'student' });
    const res = await api('ghost', 'post', '/requests', { course_code: 'CS 3310', windows: [{ day_of_week: 2, start_min: 840, end_min: 960 }] });
    expect(res.status).toBe(401);
    expect((await api('ghost', 'get', '/me')).status).toBe(404);
  });
});

describe('with a hosted model configured', () => {
  const reply = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
  const withModel = async (fake: () => Promise<Response>, run: () => Promise<void>) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fake as any);
    config.llmKey = 'test-key';
    try {
      await run();
      expect(spy).toHaveBeenCalled();
    } finally {
      config.llmKey = null;
      spy.mockRestore();
    }
  };

  it('uses a valid answer, dropping tags outside the catalog', async () => {
    await withModel(
      async () => reply('Here you go: {"course_code":"CS 2400","tags":["trees","invented-tag"],"exam":"final","deadline_day":5,"urgency":"high"}'),
      async () => {
        const res = await api('jordan', 'post', '/intake', { text: 'my BST keeps breaking and the final is friday' });
        expect(res.body).toMatchObject({ course_code: 'CS 2400', tags: ['trees'], exam: 'final', deadline_day: 5, source: 'llm' });
      },
    );
  });

  it('falls back to the rule-based parser on a wrong course, non-JSON, an HTTP error, or a network failure', async () => {
    const failures: Array<() => Promise<Response>> = [
      async () => reply('{"course_code":"CS 9999","tags":[],"exam":null,"deadline_day":null,"urgency":"normal"}'),
      async () => reply('I am not sure which course that is.'),
      async () => new Response('overloaded', { status: 529 }),
      async () => {
        throw new Error('network down');
      },
    ];
    for (const [i, fake] of failures.entries()) {
      await withModel(fake, async () => {
        const res = await api('jordan', 'post', '/intake', { text: `stuck on hash tables in cs 2400, attempt ${i}` });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ course_code: 'CS 2400', tags: ['hash-tables'], source: 'rules' });
      });
    }
  });
});
