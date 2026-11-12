// Display-side copy of the deterministic matching score (M3, task D4) so the
// ranked-results UI can show a score breakdown. The Data & Matching owner's
// backend implementation is the source of truth; keep the weights in sync.
//
// score = 0.40·course_match + 0.30·availability_overlap + 0.20·tag_overlap
//       + 0.10·normalized_rating − 0.10·load_penalty
import type { HelpRequest, User } from '../types';
import { courseByCode, DAY_NAMES } from '../data/seed';
import { fmtRange } from './format';

export const WEIGHTS = { course: 0.4, availability: 0.3, tags: 0.2, rating: 0.1, load: 0.1 };

export interface MatchResult {
  tutor: User;
  score: number;
  parts: { course: number; availability: number; tags: number; rating: number; load: number };
  coveredHours: number[];
  matchedTags: string[];
  explanation: string;
}

function courseMatch(req: HelpRequest, tutor: User): number {
  const taken = tutor.coursework?.map(c => c.course) ?? [];
  if (taken.includes(req.course)) return 1;
  const target = courseByCode(req.course);
  if (!target) return 0;
  const adjacent = taken.some(code => {
    const c = courseByCode(code);
    return c && c.subject === target.subject && Math.abs(c.level - target.level) <= 1;
  });
  return adjacent ? 0.6 : 0;
}

export function rankTutors(req: HelpRequest, tutors: User[], ratings: Record<string, { avg: number; count: number }>): MatchResult[] {
  const wanted = Array.from({ length: Math.max(1, req.end - req.start) }, (_, i) => req.start + i);
  return tutors
    .map(tutor => {
      const course = courseMatch(req, tutor);
      const coveredHours = wanted.filter(h => tutor.availability?.includes(`${req.day}-${h}`));
      const availability = coveredHours.length / wanted.length;
      const matchedTags = req.tags.filter(t => tutor.topics?.includes(t));
      const tags = req.tags.length ? matchedTags.length / req.tags.length : 0;
      const rating = (ratings[tutor.id]?.avg ?? 0) / 5;
      const load = Math.min((tutor.activeLoad ?? 0) / 5, 1);
      const score = Math.max(0, Math.min(1,
        WEIGHTS.course * course + WEIGHTS.availability * availability + WEIGHTS.tags * tags + WEIGHTS.rating * rating - WEIGHTS.load * load));
      return { tutor, score, parts: { course, availability, tags, rating, load }, coveredHours, matchedTags, explanation: explain(req, tutor, course, coveredHours, wanted, matchedTags) };
    })
    .filter(m => m.parts.course > 0 || m.parts.tags > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Stand-in for the LLM ranking explanation (task D6). The real service turns the
 * score breakdown into a sentence and caches it; it never changes the ranking.
 */
function explain(req: HelpRequest, tutor: User, course: number, covered: number[], wanted: number[], tags: string[]): string {
  const first = tutor.name.split(' ')[0];
  const cw = tutor.coursework?.find(c => c.course === req.course);
  const parts: string[] = [];
  if (cw) parts.push(`${first} earned an ${cw.grade} in ${req.course} with ${cw.professor} (${cw.term})`);
  else if (course > 0) parts.push(`${first} hasn’t taken ${req.course}, but has completed a nearby ${req.course.split(' ')[0]} course`);
  if (tags.length) {
    const n = req.tags.length;
    parts.push(tags.length === n ? `covers ${n === 1 ? 'your topic' : n === 2 ? 'both of your topics' : `all ${n} of your topics`}` : `covers ${tags.length} of your ${n} topics`);
  }
  if (covered.length === wanted.length) parts.push(`is free for your whole ${DAY_NAMES[req.day]} ${fmtRange(req.start, req.end)} window`);
  else if (covered.length) parts.push(`is free for ${covered.length} of the ${wanted.length} hours you asked for`);
  else parts.push(`isn’t free on ${DAY_NAMES[req.day]} at that time, so you’d need to pick another slot`);
  const sentence = parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const load = (tutor.activeLoad ?? 0) >= 4 ? ` ${first} already has a full week, so replies may be slower.` : '';
  return `${sentence}.${load}`;
}
