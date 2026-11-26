import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { openDb, type Db } from './index.js';
import { appendEntry } from '../lib/ledger.js';

/**
 * Demo accounts: one admin, four tutors, two students. All fictional.
 * Every account uses the password below. Safe to run more than once.
 */
export const DEMO_PASSWORD = 'vouch-demo-1';

const HOUR = 60;
const block = (day: number, startHour: number, endHour: number) => ({ day, start: startHour * HOUR, end: endHour * HOUR });

const USERS = [
  { email: 'admin@cpp.edu', role: 'admin', name: 'Vouch Admin', major: '', bio: '', modality: 'both', tags: [], courses: [], blocks: [] },
  {
    email: 'maya.chen@cpp.edu', role: 'tutor', name: 'Maya Chen', major: 'Computer Science',
    bio: 'Senior. I draw every recursion as a tree until it clicks.', modality: 'both',
    tags: ['dynamic-programming', 'recurrences', 'graph-algorithms', 'trees', 'recursion', 'big-o'],
    courses: [['CS 3310', 'A', 'Prof. Alvarez'], ['CS 2400', 'A', 'Prof. Singh'], ['CS 1400', 'A', null]],
    blocks: [block(2, 14, 18), block(3, 14, 18), block(4, 10, 12)],
  },
  {
    email: 'diego.ramirez@cpp.edu', role: 'tutor', name: 'Diego Ramirez', major: 'Computer Science',
    bio: 'Transfer student. Patient with proofs and pointer bugs.', modality: 'in_person',
    tags: ['greedy', 'divide-and-conquer', 'dynamic-programming', 'linked-lists', 'hash-tables', 'induction', 'proofs'],
    courses: [['CS 3310', 'B+', 'Prof. Okoye'], ['CS 2400', 'A-', 'Prof. Singh'], ['CS 1300', 'A', null]],
    blocks: [block(1, 9, 12), block(3, 16, 19), block(5, 9, 12)],
  },
  {
    email: 'priya.nair@cpp.edu', role: 'tutor', name: 'Priya Nair', major: 'Applied Mathematics',
    bio: 'Calculus sequence and statistics. I bring worked examples.', modality: 'online',
    tags: ['integration-techniques', 'series', 'taylor-series', 'derivatives', 'chain-rule', 'hypothesis-testing', 'distributions', 'partial-derivatives'],
    courses: [['MAT 1140', 'A', null], ['MAT 1150', 'A', 'Prof. Tran'], ['MAT 2140', 'A-', null], ['STA 2260', 'A', null]],
    blocks: [block(1, 17, 21), block(2, 17, 21), block(4, 17, 21)],
  },
  {
    email: 'sam.okafor@cpp.edu', role: 'tutor', name: 'Sam Okafor', major: 'Mechanical Engineering',
    bio: 'Physics and chemistry for engineers. Free body diagrams first.', modality: 'both',
    tags: ['kinematics', 'newtons-laws', 'energy', 'rotation', 'stoichiometry', 'gas-laws', 'related-rates'],
    courses: [['PHY 1510', 'A', 'Prof. Lindqvist'], ['CHM 1210', 'B+', null], ['MAT 1140', 'A-', null]],
    blocks: [block(2, 9, 13), block(4, 9, 13), block(6, 10, 14)],
  },
  { email: 'alex.kim@cpp.edu', role: 'student', name: 'Alex Kim', major: 'Computer Science', bio: '', modality: 'both', tags: [], courses: [['CS 3310', null, 'Prof. Alvarez']], blocks: [] },
  { email: 'jordan.lee@cpp.edu', role: 'student', name: 'Jordan Lee', major: 'Civil Engineering', bio: '', modality: 'both', tags: [], courses: [['MAT 1150', null, 'Prof. Tran'], ['PHY 1510', null, null]], blocks: [] },
] as const;

export async function seedDemo(db: Db): Promise<void> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds);
  for (const u of USERS) {
    const existing = (await db.query('SELECT id FROM users WHERE email = $1', [u.email])).rows[0];
    if (existing) continue;
    await db.tx(async (q) => {
      const { id } = (await q.query(
        `INSERT INTO users (email, password_hash, role, name, major, bio, modality, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
        [u.email, hash, u.role, u.name, u.major, u.bio, u.modality, JSON.stringify(u.tags)],
      )).rows[0];
      for (const [code, grade, professor] of u.courses) {
        await q.query(
          'INSERT INTO user_courses (user_id, course_code, kind, grade, professor) VALUES ($1, $2, $3, $4, $5)',
          [id, code, u.role === 'tutor' ? 'completed' : 'enrolled', grade, professor],
        );
      }
      for (const b of u.blocks) {
        await q.query(
          'INSERT INTO availability_blocks (user_id, day_of_week, start_min, end_min) VALUES ($1, $2, $3, $4)',
          [id, b.day, b.start, b.end],
        );
      }
    });
  }
}

/**
 * Past sessions with reviews, so tutor profiles and the ledger are not empty
 * during a live demo. Each one goes through the same steps the API takes:
 * a completed booking, both attestations, an ATTESTATION ledger entry, then a
 * REVIEW entry that points at it. The hash chain stays valid.
 *
 * Only the dev server calls this (src/server.ts). The tests and `npm run demo`
 * call seedDemo alone, because they expect an empty ledger.
 * Runs once: it does nothing if the ledger already has entries.
 */
const HISTORY = [
  { student: 'alex.kim@cpp.edu', tutor: 'maya.chen@cpp.edu', course: 'CS 3310', tags: ['dynamic-programming'], daysAgo: 21, rating: 5,
    comment: 'Drew the recursion tree for knapsack until it finally clicked. Best hour I spent before the quiz.' },
  { student: 'alex.kim@cpp.edu', tutor: 'diego.ramirez@cpp.edu', course: 'CS 2400', tags: ['linked-lists'], daysAgo: 16, rating: 4,
    comment: 'Found the pointer bug in my linked list lab with me instead of for me. Very patient.' },
  { student: 'jordan.lee@cpp.edu', tutor: 'priya.nair@cpp.edu', course: 'MAT 1150', tags: ['series'], daysAgo: 14, rating: 5,
    comment: 'Worked three series convergence problems step by step. Her worked examples are great.' },
  { student: 'jordan.lee@cpp.edu', tutor: 'sam.okafor@cpp.edu', course: 'PHY 1510', tags: ['newtons-laws'], daysAgo: 10, rating: 5,
    comment: 'Free body diagrams first was exactly the advice I needed for the midterm.' },
  { student: 'alex.kim@cpp.edu', tutor: 'maya.chen@cpp.edu', course: 'CS 3310', tags: ['graph-algorithms'], daysAgo: 7, rating: 5,
    comment: 'Clear walkthrough of Dijkstra vs BFS. Left with a list of practice problems.' },
  { student: 'jordan.lee@cpp.edu', tutor: 'priya.nair@cpp.edu', course: 'MAT 1150', tags: ['taylor-series'], daysAgo: 3, rating: 4,
    comment: 'Good session on Taylor series. We ran a little short on time at the end.' },
] as const;

export async function seedHistory(db: Db): Promise<number> {
  const count = Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM ledger_entries')).rows[0].n);
  if (count > 0) return 0;

  const idOf = async (email: string) =>
    (await db.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email])).rows[0].id;

  for (const h of HISTORY) {
    const studentId = await idOf(h.student);
    const tutorId = await idOf(h.tutor);
    const start = new Date(Date.now() - h.daysAgo * 24 * 60 * 60 * 1000);
    start.setUTCHours(22, 0, 0, 0); // 2 pm campus time
    const startIso = start.toISOString();
    const attestedAt = new Date(start.getTime() + 70 * 60 * 1000).toISOString();
    const day = start.getUTCDay();

    await db.tx(async (q) => {
      const req = (await q.query<{ id: number }>(
        `INSERT INTO help_requests (student_id, course_code, tags, windows, description, status)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'fulfilled') RETURNING id`,
        [studentId, h.course, JSON.stringify(h.tags),
         JSON.stringify([{ day_of_week: day, start_min: 14 * 60, end_min: 16 * 60 }]),
         `Help with ${h.tags.join(', ')}`],
      )).rows[0];

      const booking = (await q.query<{ id: number }>(
        `INSERT INTO bookings (request_id, student_id, tutor_id, state, start_at, duration_min)
         VALUES ($1, $2, $3, 'completed', $4::timestamptz, 60) RETURNING id`,
        [req.id, studentId, tutorId, startIso],
      )).rows[0];

      await q.query(
        `INSERT INTO booking_events (booking_id, actor_id, action, from_state, to_state)
         VALUES ($1, $2, 'request', NULL, 'requested'), ($1, $3, 'accept', 'requested', 'accepted'),
                ($1, $2, 'confirm', 'accepted', 'scheduled'), ($1, NULL, 'complete', 'scheduled', 'completed')`,
        [booking.id, studentId, tutorId],
      );
      await q.query(
        'INSERT INTO attestations (booking_id, user_id, attested_at) VALUES ($1, $2, $4), ($1, $3, $4)',
        [booking.id, studentId, tutorId, attestedAt],
      );

      // Same payloads as POST /bookings/:id/attest and POST /bookings/:id/review.
      const attestation = await appendEntry(q, 'ATTESTATION', booking.id, {
        booking_id: booking.id,
        student_id: studentId,
        tutor_id: tutorId,
        course_code: h.course,
        session_start: startIso,
        duration_min: 60,
        student_attested_at: attestedAt,
        tutor_attested_at: attestedAt,
      });
      await appendEntry(q, 'REVIEW', booking.id, {
        booking_id: booking.id,
        attestation_seq: attestation.seq,
        attestation_hash: attestation.hash,
        reviewer_id: studentId,
        tutor_id: tutorId,
        course_code: h.course,
        rating: h.rating,
        comment: h.comment,
      });
    });
  }
  return HISTORY.length;
}

// Run directly: npm run seed
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const db = await openDb();
  await seedDemo(db);
  console.log(`Seeded ${USERS.length} demo accounts. Password for all of them: ${DEMO_PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)}${u.email}`);
  await db.close();
}
