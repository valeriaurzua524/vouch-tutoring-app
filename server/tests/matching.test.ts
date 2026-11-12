import { describe, expect, it } from 'vitest';
import { checkTransition } from '../src/lib/bookingMachine.js';
import { parseWithRules, summarizeWithRules, validateAgainstCatalog } from '../src/lib/intake.js';
import {
  availabilityOverlap,
  compareRanked,
  courseMatch,
  loadPenalty,
  normalizedRating,
  scoreTutor,
  tagOverlap,
  WEIGHTS,
} from '../src/lib/matching.js';

const completed = (course_code: string, professor: string | null = null) => ({ course_code, grade: 'A', professor });

describe('matching score', () => {
  it('positive weights sum to 1.0', () => {
    const positive = Object.values(WEIGHTS).filter((w) => w > 0).reduce((a, b) => a + b, 0);
    expect(positive).toBeCloseTo(1.0, 10);
  });

  it('course_match: 1.0 exact, 0.6 same subject at a nearby level, 0 otherwise', () => {
    expect(courseMatch('CS 3310', [completed('CS 3310')]).value).toBe(1);
    expect(courseMatch('CS 3310', [completed('CS 2400')]).value).toBe(0.6);
    expect(courseMatch('CS 3310', [completed('CS 1400')]).value).toBe(0); // levels 3 and 1 are not adjacent
    expect(courseMatch('CS 3310', [completed('MAT 2140')]).value).toBe(0);
    expect(courseMatch('CS 3310', []).value).toBe(0);
  });

  it('availability_overlap counts covered minutes once, even when blocks overlap', () => {
    const windows = [{ day_of_week: 2, start_min: 840, end_min: 960 }]; // Tue 14:00-16:00 = 120 min
    const blocks = [
      { day_of_week: 2, start_min: 870, end_min: 930 }, // 14:30-15:30
      { day_of_week: 2, start_min: 900, end_min: 990 }, // 15:00-16:30 (overlaps the first)
      { day_of_week: 3, start_min: 840, end_min: 960 }, // wrong day
    ];
    // Union on Tuesday is 14:30-16:30; inside the window that is 14:30-16:00 = 90 min. 90 / 120 = 0.75
    expect(availabilityOverlap(windows, blocks)).toEqual({ value: 0.75, covered_min: 90, requested_min: 120 });
  });

  it('tag_overlap is the fraction of requested tags the tutor declares', () => {
    expect(tagOverlap(['a', 'b', 'c'], ['b', 'c', 'z']).value).toBeCloseTo(2 / 3);
    expect(tagOverlap([], ['a']).value).toBe(0);
  });

  it('rating and load terms', () => {
    expect(normalizedRating(5)).toBe(1);
    expect(normalizedRating(1)).toBe(0);
    expect(normalizedRating(4)).toBe(0.75);
    expect(normalizedRating(null)).toBe(0.5);
    expect(loadPenalty(0)).toBe(0);
    expect(loadPenalty(2)).toBe(0.5);
    expect(loadPenalty(9)).toBe(1);
  });

  it('worked example adds up term by term', () => {
    const out = scoreTutor(
      {
        course_code: 'CS 3310',
        professor: 'Prof. Alvarez',
        tags: ['dynamic-programming', 'recurrences'],
        windows: [{ day_of_week: 2, start_min: 840, end_min: 960 }],
      },
      {
        courses: [completed('CS 3310', 'prof. alvarez')],
        tags: ['dynamic-programming'],
        blocks: [{ day_of_week: 2, start_min: 870, end_min: 960 }],
        rating_avg: 4,
        rating_count: 2,
        active_bookings: 1,
      },
    );
    // 0.40*1.0 + 0.30*0.75 + 0.20*0.5 + 0.10*0.75 - 0.10*0.25
    // = 0.400 + 0.225 + 0.100 + 0.075 - 0.025 = 0.775
    expect(out.terms.course_match.contribution).toBe(0.4);
    expect(out.terms.availability_overlap.contribution).toBe(0.225);
    expect(out.terms.tag_overlap.contribution).toBe(0.1);
    expect(out.terms.normalized_tutor_rating.contribution).toBe(0.075);
    expect(out.terms.current_load_penalty.contribution).toBe(-0.025);
    expect(out.score).toBe(0.775);
    expect(out.same_professor).toBe(true);
    expect(out.explanation).toContain('same professor');
  });

  it('ranking is deterministic: score, then same professor, then id', () => {
    const b = (score: number, same_professor: boolean) => ({ score, same_professor }) as any;
    const list = [
      { tutor_id: 3, breakdown: b(0.5, false) },
      { tutor_id: 2, breakdown: b(0.5, true) },
      { tutor_id: 1, breakdown: b(0.9, false) },
      { tutor_id: 4, breakdown: b(0.5, false) },
    ];
    expect(list.sort(compareRanked).map((x) => x.tutor_id)).toEqual([1, 2, 3, 4]);
  });
});

describe('booking state machine', () => {
  it('allows only the documented path', () => {
    expect(checkTransition('requested', 'accept', 'tutor')).toEqual({ ok: true, to: 'accepted' });
    expect(checkTransition('accepted', 'confirm', 'student')).toEqual({ ok: true, to: 'scheduled' });
    expect(checkTransition('scheduled', 'complete', 'system')).toEqual({ ok: true, to: 'completed' });
    expect(checkTransition('requested', 'accept', 'student')).toEqual({ ok: false, reason: 'WRONG_ACTOR' });
    expect(checkTransition('requested', 'confirm', 'student')).toEqual({ ok: false, reason: 'WRONG_STATE' });
    expect(checkTransition('scheduled', 'complete', 'tutor')).toEqual({ ok: false, reason: 'WRONG_ACTOR' });
    expect(checkTransition('completed', 'cancel', 'student')).toEqual({ ok: false, reason: 'WRONG_STATE' });
  });
});

describe('intake (rule-based)', () => {
  it('structures the example from the business plan', () => {
    expect(parseWithRules('lost on dynamic programming, midterm Thursday')).toEqual({
      course_code: 'CS 3310',
      tags: ['dynamic-programming'],
      exam: 'midterm',
      deadline_day: 4,
      urgency: 'high',
    });
  });

  it('an explicit course code wins over topic guesses', () => {
    const out = parseWithRules('cs2400 help with recursion and hash tables please');
    expect(out.course_code).toBe('CS 2400');
    expect(out.tags.sort()).toEqual(['hash-tables', 'recursion']);
    expect(out.urgency).toBe('normal');
  });

  it('returns nulls rather than guessing when nothing matches', () => {
    expect(parseWithRules('i need help with my essay')).toMatchObject({ course_code: null, tags: [] });
  });

  it('model output is rejected or trimmed against the catalog', () => {
    const base = { exam: null, deadline_day: null, urgency: 'normal' };
    expect(validateAgainstCatalog({ ...base, course_code: 'CS 9999', tags: [] })).toBeNull();
    expect(validateAgainstCatalog({ course_code: 'CS 3310' })).toBeNull();
    expect(validateAgainstCatalog({ ...base, course_code: 'CS 3310', tags: ['greedy', 'made-up', 'limits'] })?.tags).toEqual(['greedy']);
  });

  it('session summary separates covered topics from gaps', () => {
    const out = summarizeWithRules('CS 3310', 'We covered dynamic programming and greedy. Still shaky on recurrences.');
    expect(out.concepts.sort()).toEqual(['dynamic-programming', 'greedy', 'recurrences']);
    expect(out.gaps).toEqual(['recurrences']);
  });
});
