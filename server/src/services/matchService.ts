import type { Queryable } from '../db/index.js';
import { ACTIVE_STATES } from '../lib/bookingMachine.js';
import {
  compareRanked,
  modalityCompatible,
  scoreTutor,
  type ScoreBreakdown,
  type TimeBlock,
  type TutorCourse,
} from '../lib/matching.js';
import { reputationByTutor } from './reputation.js';

export interface HelpRequestRow {
  id: number;
  student_id: number;
  course_code: string;
  professor: string | null;
  tags: string[];
  windows: TimeBlock[];
  description: string;
  modality: 'in_person' | 'online' | 'either';
  status: string;
}

export interface RankedTutor {
  rank: number;
  tutor_id: number;
  name: string;
  major: string;
  bio: string;
  modality: 'in_person' | 'online' | 'both';
  rating_avg: number | null;
  rating_count: number;
  breakdown: ScoreBreakdown;
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

/**
 * Ranks every eligible tutor for a request. Eligibility is a filter, applied
 * before scoring and separate from it:
 *   - not the requester,
 *   - compatible modality,
 *   - course_match > 0 (completed the course, or one near it in the subject).
 */
export async function rankTutors(q: Queryable, request: HelpRequestRow): Promise<RankedTutor[]> {
  const tutors = (await q.query(
    `SELECT id, name, major, bio, modality, tags FROM users WHERE role = 'tutor' AND id <> $1`,
    [request.student_id],
  )).rows;
  const courses = groupBy(
    (await q.query<TutorCourse & { user_id: number }>(
      `SELECT user_id, course_code, grade, professor FROM user_courses WHERE kind = 'completed'`,
    )).rows,
    (r) => r.user_id,
  );
  const blocks = groupBy(
    (await q.query<TimeBlock & { user_id: number }>(
      'SELECT user_id, day_of_week, start_min, end_min FROM availability_blocks',
    )).rows,
    (r) => r.user_id,
  );
  const loads = new Map<number, number>(
    (await q.query<{ tutor_id: number; n: number }>(
      `SELECT tutor_id, count(*)::int AS n FROM bookings
        WHERE state IN (${ACTIVE_STATES.map((s) => `'${s}'`).join(',')}) GROUP BY tutor_id`,
    )).rows.map((r) => [r.tutor_id, r.n]),
  );
  const reputation = await reputationByTutor(q);

  return tutors
    .filter((t) => modalityCompatible(request.modality, t.modality))
    .map((t) => {
      const rep = reputation.get(t.id) ?? { rating_avg: null, rating_count: 0 };
      return {
        tutor_id: t.id as number,
        name: t.name as string,
        major: t.major as string,
        bio: t.bio as string,
        modality: t.modality,
        ...rep,
        breakdown: scoreTutor(request, {
          courses: courses.get(t.id) ?? [],
          tags: t.tags ?? [],
          blocks: blocks.get(t.id) ?? [],
          rating_avg: rep.rating_avg,
          rating_count: rep.rating_count,
          active_bookings: loads.get(t.id) ?? 0,
        }),
      };
    })
    .filter((t) => t.breakdown.terms.course_match.value > 0)
    .sort(compareRanked)
    .map((t, i) => ({ rank: i + 1, ...t }));
}
