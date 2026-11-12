/**
 * Deterministic matching score (backlog D4). Pure functions, no I/O.
 *
 *   score = 0.40 * course_match
 *         + 0.30 * availability_overlap
 *         + 0.20 * tag_overlap
 *         + 0.10 * normalized_tutor_rating
 *         - 0.10 * current_load_penalty
 *
 * The four positive weights sum to 1.0, so a tutor with no load scores between
 * 0 and 1 and the number reads as a percentage fit. No model is involved.
 */

export const WEIGHTS = {
  course_match: 0.4,
  availability_overlap: 0.3,
  tag_overlap: 0.2,
  normalized_tutor_rating: 0.1,
  current_load_penalty: -0.1,
} as const;

/** Active bookings at which the load penalty saturates at 1.0. */
export const LOAD_CAP = 4;
/** Rating term for a tutor with no verified reviews: the midpoint, equal to a 3.0 average. */
export const UNRATED_RATING = 0.5;

export interface TimeBlock {
  day_of_week: number; // 0 = Sunday ... 6 = Saturday, campus local time
  start_min: number; // minutes after midnight
  end_min: number;
}

export interface TutorCourse {
  course_code: string;
  grade: string | null;
  professor: string | null;
}

export interface MatchRequest {
  course_code: string;
  professor: string | null;
  tags: string[];
  windows: TimeBlock[];
}

export interface TutorFacts {
  courses: TutorCourse[];
  tags: string[];
  blocks: TimeBlock[];
  rating_avg: number | null; // 1..5 over verified reviews, null when none
  rating_count: number;
  active_bookings: number;
}

export interface Term {
  value: number;
  weight: number;
  contribution: number;
  detail: string;
}

export interface ScoreBreakdown {
  score: number;
  terms: Record<keyof typeof WEIGHTS, Term>;
  same_professor: boolean;
  matched_course: TutorCourse | null;
  explanation: string;
}

const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places;

export function parseCourseCode(code: string): { subject: string; level: number } | null {
  const m = /^([A-Z]{2,4}) (\d{4})$/.exec(code);
  return m ? { subject: m[1], level: Math.floor(Number(m[2]) / 1000) } : null;
}

/**
 * 1.0 if the tutor completed the exact course; 0.6 if they completed a course in
 * the same subject at the same or a neighbouring level (first digit differs by
 * at most 1); otherwise 0.
 */
export function courseMatch(requestCode: string, courses: TutorCourse[]): { value: number; via: TutorCourse | null } {
  const exact = courses.find((c) => c.course_code === requestCode);
  if (exact) return { value: 1, via: exact };
  const want = parseCourseCode(requestCode);
  if (!want) return { value: 0, via: null };
  const near = courses.find((c) => {
    const have = parseCourseCode(c.course_code);
    return have !== null && have.subject === want.subject && Math.abs(have.level - want.level) <= 1;
  });
  return near ? { value: 0.6, via: near } : { value: 0, via: null };
}

/** Merges overlapping or touching intervals so shared minutes are counted once. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Fraction of the requested minutes that fall inside the tutor's free blocks. */
export function availabilityOverlap(
  windows: TimeBlock[],
  blocks: TimeBlock[],
): { value: number; covered_min: number; requested_min: number } {
  let requested = 0;
  let covered = 0;
  for (let day = 0; day < 7; day++) {
    const want = mergeIntervals(windows.filter((w) => w.day_of_week === day).map((w) => [w.start_min, w.end_min]));
    const free = mergeIntervals(blocks.filter((b) => b.day_of_week === day).map((b) => [b.start_min, b.end_min]));
    for (const [ws, we] of want) {
      requested += we - ws;
      for (const [fs, fe] of free) covered += Math.max(0, Math.min(we, fe) - Math.max(ws, fs));
    }
  }
  return { value: requested === 0 ? 0 : covered / requested, covered_min: covered, requested_min: requested };
}

/** Fraction of the request's topic tags the tutor declares. A request with no tags scores 0. */
export function tagOverlap(requestTags: string[], tutorTags: string[]): { value: number; matched: string[] } {
  const want = [...new Set(requestTags)];
  if (want.length === 0) return { value: 0, matched: [] };
  const have = new Set(tutorTags);
  const matched = want.filter((t) => have.has(t));
  return { value: matched.length / want.length, matched };
}

/** Maps a 1..5 average onto 0..1: (avg - 1) / 4. */
export function normalizedRating(avg: number | null): number {
  return avg === null ? UNRATED_RATING : Math.min(1, Math.max(0, (avg - 1) / 4));
}

export function loadPenalty(activeBookings: number): number {
  return Math.min(activeBookings / LOAD_CAP, 1);
}

const sameProfessor = (a: string | null, b: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function scoreTutor(req: MatchRequest, tutor: TutorFacts): ScoreBreakdown {
  const course = courseMatch(req.course_code, tutor.courses);
  const avail = availabilityOverlap(req.windows, tutor.blocks);
  const tags = tagOverlap(req.tags, tutor.tags);
  const rating = normalizedRating(tutor.rating_avg);
  const load = loadPenalty(tutor.active_bookings);
  const sameProf = course.value === 1 && sameProfessor(req.professor, course.via?.professor ?? null);

  const term = (key: keyof typeof WEIGHTS, value: number, detail: string): Term => ({
    value: round(value),
    weight: WEIGHTS[key],
    contribution: round(value * WEIGHTS[key]),
    detail,
  });

  const terms = {
    course_match: term(
      'course_match',
      course.value,
      course.value === 1
        ? `Completed ${req.course_code}${course.via?.grade ? ` (grade ${course.via.grade})` : ''}`
        : course.value > 0
          ? `Completed ${course.via!.course_code}, same subject at a nearby level`
          : `No completed course near ${req.course_code}`,
    ),
    availability_overlap: term(
      'availability_overlap',
      avail.value,
      `Free for ${avail.covered_min} of the ${avail.requested_min} requested minutes`,
    ),
    tag_overlap: term(
      'tag_overlap',
      tags.value,
      req.tags.length
        ? `Covers ${tags.matched.length} of ${new Set(req.tags).size} requested topics${tags.matched.length ? `: ${tags.matched.join(', ')}` : ''}`
        : 'Request listed no topics',
    ),
    normalized_tutor_rating: term(
      'normalized_tutor_rating',
      rating,
      tutor.rating_avg === null
        ? 'No verified reviews yet (neutral 0.5)'
        : `${round(tutor.rating_avg, 2)} average over ${tutor.rating_count} verified review${tutor.rating_count === 1 ? '' : 's'}`,
    ),
    current_load_penalty: term(
      'current_load_penalty',
      load,
      `${tutor.active_bookings} active booking${tutor.active_bookings === 1 ? '' : 's'} (penalty saturates at ${LOAD_CAP})`,
    ),
  };

  const score = round(Object.values(terms).reduce((sum, t) => sum + t.value * t.weight, 0));

  const explanation =
    [
      terms.course_match.detail + (sameProf ? ` with ${course.via!.professor}, the same professor` : ''),
      terms.availability_overlap.detail.toLowerCase(),
      terms.tag_overlap.detail.toLowerCase(),
      terms.normalized_tutor_rating.detail.toLowerCase(),
      terms.current_load_penalty.detail.toLowerCase(),
    ].join('; ') + '.';

  return { score, terms, same_professor: sameProf, matched_course: course.via, explanation };
}

/** Request and tutor modalities are compatible unless one is online-only and the other in-person-only. */
export function modalityCompatible(request: 'in_person' | 'online' | 'either', tutor: 'in_person' | 'online' | 'both'): boolean {
  return request === 'either' || tutor === 'both' || request === tutor;
}

/** Highest score first; same professor breaks ties; then lower id, so ordering is reproducible. */
export function compareRanked(
  a: { tutor_id: number; breakdown: ScoreBreakdown },
  b: { tutor_id: number; breakdown: ScoreBreakdown },
): number {
  return (
    b.breakdown.score - a.breakdown.score ||
    Number(b.breakdown.same_professor) - Number(a.breakdown.same_professor) ||
    a.tutor_id - b.tutor_id
  );
}
