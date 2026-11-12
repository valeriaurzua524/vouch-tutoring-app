import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ALL_TAGS, COURSE_BY_CODE } from '../db/catalog.js';
import type { Db } from '../db/index.js';
import { auth, conflict, forbidden, idParam, parse } from '../http.js';
import { structureRequest } from '../lib/intake.js';
import { getRequest } from '../services/bookingService.js';
import { rankTutors } from '../services/matchService.js';
import { Blocks } from './accounts.js';

const NewRequest = z.object({
  course_code: z.string().refine((c) => COURSE_BY_CODE.has(c), { message: 'Unknown course code' }),
  professor: z.string().trim().max(100).nullish(),
  tags: z.array(z.string().refine((t) => ALL_TAGS.has(t), { message: 'Unknown topic tag' })).max(10).default([]),
  // When the student is free. At least one window, or availability_overlap has nothing to measure.
  windows: Blocks.min(1, 'Add at least one time window'),
  description: z.string().trim().max(2000).default(''),
  raw_text: z.string().max(2000).nullish(),
  modality: z.enum(['in_person', 'online', 'either']).default('either'),
});

export function requestRoutes(db: Db): Router {
  const r = Router();

  /**
   * Free text -> structured fields (D3). Nothing is saved as a request here: the
   * client shows the result for the student to correct, then posts /requests.
   * Results are cached by text so a rehearsed demo never waits on a live call.
   */
  r.post('/intake', auth(), async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(3).max(2000) }), req.body);
    const key = createHash('sha256').update(text.toLowerCase()).digest('hex');

    const cached = (await db.query('SELECT result FROM intake_cache WHERE text_hash = $1', [key])).rows[0];
    const result = cached?.result ?? (await structureRequest(text));
    if (!cached) {
      await db.query(
        'INSERT INTO intake_cache (text_hash, result) VALUES ($1, $2::jsonb) ON CONFLICT (text_hash) DO NOTHING',
        [key, JSON.stringify(result)],
      );
    }

    // Gaps recorded after earlier sessions (D7) come back as suggestions.
    const gaps = result.course_code
      ? (await db.query<{ tag: string }>(
          'SELECT tag FROM student_gaps WHERE student_id = $1 AND course_code = $2 ORDER BY tag',
          [req.user!.id, result.course_code],
        )).rows.map((g) => g.tag)
      : [];

    res.json({
      ...result,
      cached: !!cached,
      suggested_tags_from_past_sessions: gaps.filter((g) => !result.tags.includes(g)),
      // What the form still has to ask for before the request can be posted.
      missing: [...(result.course_code ? [] : ['course_code']), 'windows'],
    });
  });

  // Tutors are students too, so either role may ask for help.
  r.post('/requests', auth('student', 'tutor'), async (req, res) => {
    const body = parse(NewRequest, req.body);
    const row = (await db.query(
      `INSERT INTO help_requests (student_id, course_code, professor, tags, windows, description, raw_text, modality)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8) RETURNING *`,
      [
        req.user!.id,
        body.course_code,
        body.professor || null,
        JSON.stringify([...new Set(body.tags)]),
        JSON.stringify(body.windows),
        body.description,
        body.raw_text ?? null,
        body.modality,
      ],
    )).rows[0];
    res.status(201).json(row);
  });

  r.get('/requests', auth(), async (req, res) => {
    const rows =
      req.user!.role === 'admin'
        ? (await db.query(
            `SELECT h.*, u.name AS student_name FROM help_requests h JOIN users u ON u.id = h.student_id ORDER BY h.id DESC`,
          )).rows
        : (await db.query('SELECT * FROM help_requests WHERE student_id = $1 ORDER BY id DESC', [req.user!.id])).rows;
    res.json(rows);
  });

  r.get('/requests/:id', auth(), async (req, res) => {
    const row = await getRequest(db, idParam(req));
    if (req.user!.role !== 'admin' && row.student_id !== req.user!.id) throw forbidden();
    res.json(row);
  });

  /** Ranked tutors with the full score breakdown and a plain-language explanation (D4, D5, D6). */
  r.get('/requests/:id/matches', auth(), async (req, res) => {
    const request = await getRequest(db, idParam(req));
    if (req.user!.role !== 'admin' && request.student_id !== req.user!.id) throw forbidden();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const ranked = await rankTutors(db, request);
    res.json({ request_id: request.id, total_eligible: ranked.length, matches: ranked.slice(0, limit) });
  });

  r.post('/requests/:id/cancel', auth(), async (req, res) => {
    const request = await getRequest(db, idParam(req));
    if (request.student_id !== req.user!.id) throw forbidden();
    const updated = (await db.query(
      `UPDATE help_requests SET status = 'cancelled' WHERE id = $1 AND status = 'open' RETURNING *`,
      [request.id],
    )).rows[0];
    if (!updated) throw conflict(`Only an open request can be cancelled (this one is ${request.status}). Cancel its booking first.`);
    res.json(updated);
  });

  return r;
}
