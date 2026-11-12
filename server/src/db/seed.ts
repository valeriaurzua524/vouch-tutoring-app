import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { openDb, type Db } from './index.js';

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

// Run directly: npm run seed
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const db = await openDb();
  await seedDemo(db);
  console.log(`Seeded ${USERS.length} demo accounts. Password for all of them: ${DEMO_PASSWORD}`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)}${u.email}`);
  await db.close();
}
