import { z } from 'zod';
import { config } from '../config.js';
import { COURSES, COURSE_BY_CODE, type Course } from '../db/catalog.js';

/**
 * Structured intake (backlog D3): free text -> validated request fields.
 *
 * Two producers, one contract. With ANTHROPIC_API_KEY set, a hosted model
 * proposes the fields; without it (or if the model's answer fails validation)
 * a deterministic keyword parser does. Either way the result is checked against
 * the catalog here, so nothing unvalidated reaches the matching engine, and the
 * model never computes a ranking.
 */

export const IntakeResult = z.object({
  course_code: z.string().nullable(),
  tags: z.array(z.string()),
  exam: z.enum(['midterm', 'final', 'quiz', 'exam']).nullable(),
  deadline_day: z.number().int().min(0).max(6).nullable(),
  urgency: z.enum(['high', 'normal']),
});
export type IntakeResult = z.infer<typeof IntakeResult>;

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, phrase: string) =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(phrase.toLowerCase())}s?([^a-z0-9]|$)`).test(text);

function tagsFor(course: Course, text: string): string[] {
  return course.topics.filter((t) => t.keywords.some((k) => mentions(text, k))).map((t) => t.tag);
}

/** Deterministic parser. Same text always gives the same fields. */
export function parseWithRules(raw: string, today = new Date()): IntakeResult {
  const text = raw.toLowerCase();

  // 1. An explicit course code wins ("CS 2400", "cs2400", "CS-2400").
  let course: Course | null = null;
  for (const m of text.matchAll(/\b([a-z]{2,4})[\s-]?(\d{4})\b/g)) {
    const found = COURSE_BY_CODE.get(`${m[1].toUpperCase()} ${m[2]}`);
    if (found) {
      course = found;
      break;
    }
  }
  // 2. Otherwise a course title, then the course whose topics are mentioned most.
  course ??= COURSES.find((c) => mentions(text, c.title)) ?? null;
  if (!course) {
    const ranked = COURSES.map((c) => ({ c, hits: tagsFor(c, text).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.c.code.localeCompare(b.c.code));
    course = ranked[0]?.c ?? null;
  }

  const exam = (['midterm', 'final', 'quiz', 'exam'] as const).find((w) => mentions(text, w)) ?? null;

  // Full names plus abbreviations that are not ordinary words ("sat", "sun", "wed" are skipped).
  const ABBREV: Record<string, string[]> = { monday: ['mon'], tuesday: ['tue', 'tues'], thursday: ['thu', 'thur', 'thurs'], friday: ['fri'] };
  let deadline: number | null = DAYS.findIndex((d) => [d, ...(ABBREV[d] ?? [])].some((w) => mentions(text, w)));
  if (deadline < 0) deadline = null;
  if (deadline === null && /\b(today|tonight)\b/.test(text)) deadline = today.getDay();
  if (deadline === null && /\btomorrow\b/.test(text)) deadline = (today.getDay() + 1) % 7;

  const urgent = exam !== null || /\b(urgent|asap|today|tonight|tomorrow|due)\b/.test(text);

  return {
    course_code: course?.code ?? null,
    tags: course ? tagsFor(course, text) : [],
    exam,
    deadline_day: deadline,
    urgency: urgent ? 'high' : 'normal',
  };
}

/** Drops anything not in the catalog. Returns null if the shape itself is wrong. */
export function validateAgainstCatalog(candidate: unknown): IntakeResult | null {
  const parsed = IntakeResult.safeParse(candidate);
  if (!parsed.success) return null;
  const course = parsed.data.course_code ? COURSE_BY_CODE.get(parsed.data.course_code) : null;
  if (parsed.data.course_code && !course) return null;
  const allowed = new Set(course?.topics.map((t) => t.tag) ?? []);
  return { ...parsed.data, tags: [...new Set(parsed.data.tags.filter((t) => allowed.has(t)))] };
}

/** Calls the hosted model and returns its text, or null on any failure. */
export async function callModel(system: string, user: string): Promise<string | null> {
  if (!config.llmKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.llmKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.llmModel,
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return body.content?.find((b) => b.type === 'text')?.text ?? null;
  } catch {
    return null;
  }
}

export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const INTAKE_SYSTEM = `You turn a student's free-text tutoring request into JSON. Reply with one JSON object and nothing else:
{"course_code": string|null, "tags": string[], "exam": "midterm"|"final"|"quiz"|"exam"|null, "deadline_day": 0-6|null (0=Sunday), "urgency": "high"|"normal"}
Use only course codes and tags from this catalog. Use null or [] when the text does not say.
${JSON.stringify(COURSES.map((c) => ({ code: c.code, title: c.title, tags: c.topics.map((t) => t.tag) })))}`;

export async function structureRequest(raw: string): Promise<IntakeResult & { source: 'llm' | 'rules' }> {
  const answer = await callModel(INTAKE_SYSTEM, raw);
  const fromModel = answer ? validateAgainstCatalog(extractJson(answer)) : null;
  return fromModel ? { ...fromModel, source: 'llm' } : { ...parseWithRules(raw), source: 'rules' };
}

/**
 * Session summary (backlog D7): topics covered and topics still weak.
 * Rule-based reading: a topic counts as a gap when it is named in a sentence
 * that signals difficulty; every topic named anywhere counts as covered.
 */
export function summarizeWithRules(courseCode: string, notes: string): { concepts: string[]; gaps: string[] } {
  const course = COURSE_BY_CODE.get(courseCode);
  if (!course) return { concepts: [], gaps: [] };
  const lower = notes.toLowerCase();
  const concepts = tagsFor(course, lower);
  const weak = /(struggl|confus|unclear|still|needs?|gap|review|weak|shaky|stuck|not yet|didn't|did not)/;
  const gaps = new Set<string>();
  for (const sentence of lower.split(/[.!?\n]+/)) {
    if (weak.test(sentence)) tagsFor(course, sentence).forEach((t) => gaps.add(t));
  }
  return { concepts, gaps: [...gaps] };
}

export async function summarizeSession(
  courseCode: string,
  notes: string,
): Promise<{ concepts: string[]; gaps: string[]; source: 'llm' | 'rules' }> {
  const course = COURSE_BY_CODE.get(courseCode);
  const allowed = new Set(course?.topics.map((t) => t.tag) ?? []);
  const answer = await callModel(
    `You summarise a tutoring session. Reply with one JSON object and nothing else: {"concepts": string[], "gaps": string[]}. "concepts" are topics covered; "gaps" are topics the student still has not mastered. Use only these tags: ${[...allowed].join(', ')}`,
    notes,
  );
  const parsed = z
    .object({ concepts: z.array(z.string()), gaps: z.array(z.string()) })
    .safeParse(answer ? extractJson(answer) : null);
  if (parsed.success) {
    return {
      concepts: [...new Set(parsed.data.concepts.filter((t) => allowed.has(t)))],
      gaps: [...new Set(parsed.data.gaps.filter((t) => allowed.has(t)))],
      source: 'llm',
    };
  }
  return { ...summarizeWithRules(courseCode, notes), source: 'rules' };
}
