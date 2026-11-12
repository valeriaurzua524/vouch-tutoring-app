import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ALL_TAGS, COURSE_BY_CODE } from '../db/catalog.js';
import type { Db, Queryable } from '../db/index.js';
import { auth, badRequest, conflict, HttpError, idParam, notFound, parse, signToken } from '../http.js';
import { loadReviews, summarize } from '../services/reputation.js';

const Register = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().trim().min(1).max(100),
  // Admins are never self-registered; they are created by the seed script.
  role: z.enum(['student', 'tutor']),
});

const Login = z.object({ email: z.string().trim().toLowerCase(), password: z.string() });

const knownTag = z.string().refine((t) => ALL_TAGS.has(t), { message: 'Unknown topic tag' });
const knownCourse = z.string().refine((c) => COURSE_BY_CODE.has(c), { message: 'Unknown course code' });

const ProfilePatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    major: z.string().trim().max(100),
    bio: z.string().trim().max(1000),
    modality: z.enum(['in_person', 'online', 'both']),
    tags: z.array(knownTag).max(40),
  })
  .partial();

const CourseList = z.object({
  courses: z
    .array(
      z.object({
        course_code: knownCourse,
        kind: z.enum(['completed', 'enrolled']),
        grade: z.string().trim().max(3).nullish(),
        professor: z.string().trim().max(100).nullish(),
      }),
    )
    .max(40),
});

const Block = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    start_min: z.number().int().min(0).max(1439),
    end_min: z.number().int().min(1).max(1440),
  })
  .refine((b) => b.start_min < b.end_min, { message: 'start_min must be before end_min' });
export const Blocks = z.array(Block).max(60);

async function fullProfile(q: Queryable, userId: number) {
  const user = (await q.query(
    'SELECT id, email, role, name, major, bio, modality, tags, created_at FROM users WHERE id = $1',
    [userId],
  )).rows[0];
  if (!user) throw notFound('User');
  const courses = (await q.query(
    'SELECT course_code, kind, grade, professor FROM user_courses WHERE user_id = $1 ORDER BY course_code',
    [userId],
  )).rows;
  const gaps = (await q.query(
    'SELECT course_code, tag FROM student_gaps WHERE student_id = $1 ORDER BY course_code, tag',
    [userId],
  )).rows;
  return { ...user, courses, gaps };
}

export function accountRoutes(db: Db): Router {
  const r = Router();

  r.post('/auth/register', async (req, res) => {
    const body = parse(Register, req.body);
    if (config.campusDomain && !body.email.endsWith(`@${config.campusDomain}`)) {
      throw badRequest(`Vouch is campus-scoped: use your @${config.campusDomain} email`);
    }
    const hash = await bcrypt.hash(body.password, config.bcryptRounds);
    let user;
    try {
      user = (await db.query(
        'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id, role',
        [body.email, hash, body.role, body.name],
      )).rows[0];
    } catch (err: any) {
      if (err?.code === '23505') throw conflict('An account with this email already exists');
      throw err;
    }
    res.status(201).json({ token: signToken(user), user: await fullProfile(db, user.id) });
  });

  r.post('/auth/login', async (req, res) => {
    const body = parse(Login, req.body);
    const user = (await db.query('SELECT id, role, password_hash FROM users WHERE email = $1', [body.email])).rows[0];
    // Same response whether the email or the password is wrong.
    const ok = user ? await bcrypt.compare(body.password, user.password_hash) : false;
    if (!ok) throw new HttpError(401, 'UNAUTHENTICATED', 'Incorrect email or password');
    res.json({ token: signToken(user), user: await fullProfile(db, user.id) });
  });

  r.get('/me', auth(), async (req, res) => {
    res.json(await fullProfile(db, req.user!.id));
  });

  r.patch('/me', auth(), async (req, res) => {
    const body = parse(ProfilePatch, req.body);
    await db.query(
      `UPDATE users SET
         name     = COALESCE($2, name),
         major    = COALESCE($3, major),
         bio      = COALESCE($4, bio),
         modality = COALESCE($5, modality),
         tags     = COALESCE($6::jsonb, tags)
       WHERE id = $1`,
      [
        req.user!.id,
        body.name ?? null,
        body.major ?? null,
        body.bio ?? null,
        body.modality ?? null,
        body.tags ? JSON.stringify([...new Set(body.tags)]) : null,
      ],
    );
    res.json(await fullProfile(db, req.user!.id));
  });

  /** Replaces the caller's coursework list (completed for tutors, enrolled for students). */
  r.put('/me/courses', auth(), async (req, res) => {
    const { courses } = parse(CourseList, req.body);
    await db.tx(async (q) => {
      await q.query('DELETE FROM user_courses WHERE user_id = $1', [req.user!.id]);
      for (const c of courses) {
        await q.query(
          `INSERT INTO user_courses (user_id, course_code, kind, grade, professor)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, course_code, kind) DO NOTHING`,
          [req.user!.id, c.course_code, c.kind, c.grade || null, c.professor || null],
        );
      }
    });
    res.json(await fullProfile(db, req.user!.id));
  });

  r.get('/me/availability', auth(), async (req, res) => {
    const blocks = (await db.query(
      'SELECT day_of_week, start_min, end_min FROM availability_blocks WHERE user_id = $1 ORDER BY day_of_week, start_min',
      [req.user!.id],
    )).rows;
    res.json({ timezone: 'America/Los_Angeles', blocks });
  });

  /** Replaces the caller's recurring weekly availability. Times are campus local. */
  r.put('/me/availability', auth(), async (req, res) => {
    const blocks = parse(z.object({ blocks: Blocks }), req.body).blocks;
    await db.tx(async (q) => {
      await q.query('DELETE FROM availability_blocks WHERE user_id = $1', [req.user!.id]);
      for (const b of blocks) {
        await q.query(
          'INSERT INTO availability_blocks (user_id, day_of_week, start_min, end_min) VALUES ($1, $2, $3, $4)',
          [req.user!.id, b.day_of_week, b.start_min, b.end_min],
        );
      }
    });
    res.json({ timezone: 'America/Los_Angeles', blocks });
  });

  r.get('/courses', async (_req, res) => {
    res.json((await db.query('SELECT code, subject, number, title, topics FROM courses ORDER BY code')).rows);
  });

  /** Public tutor profile with reputation. Every review carries its ledger position and hash. */
  r.get('/tutors/:id', auth(), async (req, res) => {
    const id = idParam(req);
    const tutor = (await db.query(
      `SELECT id, name, major, bio, modality, tags FROM users WHERE id = $1 AND role = 'tutor'`,
      [id],
    )).rows[0];
    if (!tutor) throw notFound('Tutor');
    const courses = (await db.query(
      `SELECT course_code, grade, professor FROM user_courses WHERE user_id = $1 AND kind = 'completed' ORDER BY course_code`,
      [id],
    )).rows;
    const blocks = (await db.query(
      'SELECT day_of_week, start_min, end_min FROM availability_blocks WHERE user_id = $1 ORDER BY day_of_week, start_min',
      [id],
    )).rows;
    const reviews = (await loadReviews(db)).filter((rv) => rv.tutor_id === id);
    res.json({ ...tutor, courses, availability: blocks, reputation: summarize(reviews), reviews });
  });

  return r;
}
