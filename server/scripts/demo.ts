/**
 * npm run demo
 *
 * Walks the graded demo path against a throwaway in-memory database and prints
 * each step: request -> ranked matches -> book -> attest -> review -> try to
 * alter the review -> verification fails -> restore. Nothing is installed or
 * left behind.
 */
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db/index.js';
import { DEMO_PASSWORD, seedDemo } from '../src/db/seed.js';

const db = await openDb({ memory: true });
await seedDemo(db);
const server = createApp(db).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ...(await res.json()) };
}
const login = async (email: string) => (await call(null, 'POST', '/auth/login', { email, password: DEMO_PASSWORD })).token as string;
const step = (n: number, title: string) => console.log(`\n${n}. ${title}\n${'-'.repeat(title.length + 3)}`);
const short = (hash: string) => `${hash.slice(0, 12)}...`;

const alex = await login('alex.kim@cpp.edu');
const maya = await login('maya.chen@cpp.edu');
const admin = await login('admin@cpp.edu');

step(1, 'Alex types a request in plain words');
const text = 'lost on dynamic programming, midterm Thursday';
const intake = await call(alex, 'POST', '/intake', { text });
console.log(`   "${text}"`);
console.log(`   -> course ${intake.course_code}, topics [${intake.tags}], ${intake.exam}, urgency ${intake.urgency}  (source: ${intake.source})`);

step(2, 'Alex posts the structured request (free Tuesday 2:00-4:00 pm)');
const request = await call(alex, 'POST', '/requests', {
  course_code: intake.course_code,
  professor: 'Prof. Alvarez',
  tags: [...intake.tags, 'recurrences'],
  windows: [{ day_of_week: 2, start_min: 14 * 60, end_min: 16 * 60 }],
  raw_text: text,
});
console.log(`   request #${request.id} is ${request.status}`);

step(3, 'The engine ranks tutors; every term of the score is shown');
const { matches } = await call(alex, 'GET', `/requests/${request.id}/matches`);
for (const m of matches) {
  const t = m.breakdown.terms;
  console.log(`   #${m.rank} ${m.name.padEnd(14)} score ${m.breakdown.score.toFixed(3)}`);
  console.log(
    `        = 0.40*${t.course_match.value} + 0.30*${t.availability_overlap.value} + 0.20*${t.tag_overlap.value} + 0.10*${t.normalized_tutor_rating.value} - 0.10*${t.current_load_penalty.value}`,
  );
  console.log(`        ${m.breakdown.explanation}`);
}

step(4, 'Booking lifecycle: requested -> accepted -> scheduled');
const top = matches[0];
const booking = await call(alex, 'POST', '/bookings', { request_id: request.id, tutor_id: top.tutor_id, start_at: '2026-11-17T22:00:00Z' });
console.log(`   Alex books ${top.name}: ${booking.state}`);
console.log(`   Maya accepts:        ${(await call(maya, 'POST', `/bookings/${booking.id}/accept`)).state}`);
console.log(`   Alex confirms:       ${(await call(alex, 'POST', `/bookings/${booking.id}/confirm`)).state}`);

step(5, 'A review before the session is attested is refused');
const early = await call(alex, 'POST', `/bookings/${booking.id}/review`, { rating: 5 });
console.log(`   HTTP ${early.status}: ${early.error.message}`);

step(6, 'Both parties attest the session took place');
const a1 = await call(alex, 'POST', `/bookings/${booking.id}/attest`);
console.log(`   Alex attests: ${a1.state}, waiting on ${a1.waiting_on}`);
const a2 = await call(maya, 'POST', `/bookings/${booking.id}/attest`);
console.log(`   Maya attests: ${a2.state}; ledger entry #${a2.ledger_entry.seq} ${a2.ledger_entry.entry_type} ${short(a2.ledger_entry.hash)}`);

step(7, 'Alex leaves a 2-star review, written to the ledger');
const review = await call(alex, 'POST', `/bookings/${booking.id}/review`, { rating: 2, comment: 'Showed up late.' });
console.log(`   ledger entry #${review.seq} ${review.entry_type}`);
console.log(`     prev_hash ${short(review.prev_hash)}  (the attestation's hash)`);
console.log(`     hash      ${short(review.hash)}`);
const ok = await call(null, 'GET', '/ledger/verify');
console.log(`   verify: valid=${ok.valid}, ${ok.verified_entries}/${ok.total_entries} entries intact`);

step(8, 'Attempt 1: edit the review with a plain UPDATE');
const blocked = await call(admin, 'POST', '/admin/tamper', { seq: review.seq, mode: 'blocked', rating: 5 });
console.log(`   changed=${blocked.changed}; database said: "${blocked.database_error}"`);

step(9, 'Attempt 2: get past the database rule and change 2 stars to 5');
const forged = await call(admin, 'POST', '/admin/tamper', { seq: review.seq, mode: 'bypass', rating: 5, comment: 'Best tutor ever.' });
console.log(`   stored rating is now ${forged.after.rating}; stored hash was left as ${short(forged.stored_hash_unchanged)}`);
const bad = await call(null, 'GET', '/ledger/verify');
console.log(`   verify: valid=${bad.valid}, broken at entry #${bad.broken_at_seq} (${bad.reason})`);
console.log(`           ${bad.detail}`);

step(10, 'Restore for the next rehearsal');
const restored = await call(admin, 'POST', '/admin/tamper/restore');
console.log(`   restored entries [${restored.restored_seqs}]; verify: valid=${restored.verification.valid}`);

console.log('');
server.close();
await db.close();
