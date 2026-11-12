// Stand-in for the M9 AI Gateway "parse" call (task D3): free text in,
// schema-checked structured fields out. This mock uses keyword rules so the
// demo never depends on a live model; swap parseRequest() for the API call.
import type { Day, HelpRequest } from '../types';
import { COURSES, DAYS } from '../data/seed';

const DAY_WORDS: Record<string, Day> = {
  monday: 'Mon', mon: 'Mon', tuesday: 'Tue', tue: 'Tue', tues: 'Tue', wednesday: 'Wed', wed: 'Wed',
  thursday: 'Thu', thu: 'Thu', thurs: 'Thu', friday: 'Fri', fri: 'Fri', saturday: 'Sat', sat: 'Sat', sunday: 'Sun', sun: 'Sun',
};

const SYNONYMS: Record<string, string> = {
  'linked list': 'Linked Lists', 'bst': 'Trees', 'binary tree': 'Trees', 'tree': 'Trees', 'recursion': 'Recursion', 'recursive': 'Recursion',
  'big o': 'Big-O', 'big-o': 'Big-O', 'runtime': 'Big-O', 'hash': 'Hash Tables', 'stack': 'Stacks & Queues', 'queue': 'Stacks & Queues',
  'dp': 'Dynamic Programming', 'dynamic programming': 'Dynamic Programming', 'graph': 'Graphs', 'bfs': 'Graphs', 'dfs': 'Graphs', 'greedy': 'Greedy',
  'derivative': 'Derivatives', 'limit': 'Limits', 'chain rule': 'Chain Rule', 'integral': 'Integrals', 'by parts': 'Integration by Parts', 'series': 'Series',
  'matrix': 'Matrices', 'matrices': 'Matrices', 'eigen': 'Eigenvalues', 'free body': "Newton's Laws", 'force': "Newton's Laws", 'newton': "Newton's Laws",
  'kinematic': 'Kinematics', 'projectile': 'Kinematics', 'energy': 'Energy', 'momentum': 'Momentum', 'stoich': 'Stoichiometry', 'limiting reagent': 'Stoichiometry',
  'mole': 'Stoichiometry', 'equilibrium': 'Equilibrium', 'acid': 'Acids & Bases', 'lab report': 'Lab Prep', 'loop': 'Loops', 'array': 'Arrays', 'method': 'Methods',
  'java': 'Java', 'debug': 'Debugging', 'probability': 'Probability', 'hypothesis': 'Hypothesis Testing', 'regression': 'Regression',
};

const TOPIC_TO_COURSE: Record<string, string> = {};
for (const c of COURSES) for (const t of c.topics) if (!TOPIC_TO_COURSE[t]) TOPIC_TO_COURSE[t] = c.code;

export interface IntakeResult {
  fields: Partial<HelpRequest>;
  /** Which fields the parser actually found, shown as "detected" chips. */
  detected: string[];
}

export async function parseRequest(raw: string, fallbackCourse: string): Promise<IntakeResult> {
  await new Promise(r => setTimeout(r, 750)); // simulate the cached API round-trip
  const text = raw.toLowerCase();
  const detected: string[] = [];
  const fields: Partial<HelpRequest> = { raw };

  const code = raw.match(/\b(cs|mat|math|phy|chm|chem|sta)\s?-?(\d{4})\b/i);
  if (code) {
    const subj = code[1].toUpperCase().replace('MATH', 'MAT').replace('CHEM', 'CHM');
    const guess = `${subj} ${code[2]}`;
    if (COURSES.some(c => c.code === guess)) { fields.course = guess; detected.push('course'); }
  }

  const tags = new Set<string>();
  for (const [word, tag] of Object.entries(SYNONYMS)) if (text.includes(word)) tags.add(tag);
  if (!fields.course && tags.size) { fields.course = TOPIC_TO_COURSE[[...tags][0]]; detected.push('course'); }
  const course = COURSES.find(c => c.code === (fields.course ?? fallbackCourse));
  const valid = [...tags].filter(t => course?.topics.includes(t));
  if (valid.length) { fields.tags = valid; detected.push('topics'); }

  for (const [word, day] of Object.entries(DAY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) { fields.day = day; detected.push('day'); break; }
  }
  if (!fields.day && /\btomorrow\b/.test(text)) {
    fields.day = DAYS[(new Date().getDay() + 6 + 1) % 7]; detected.push('day');
  }

  const time = text.match(/\b(\d{1,2})\s?(am|pm)\b/);
  if (time) {
    let h = Number(time[1]) % 12;
    if (time[2] === 'pm') h += 12;
    if (h >= 8 && h <= 20) { fields.start = h; fields.end = h + 1; detected.push('time'); }
  } else if (/\bafternoon\b/.test(text)) { fields.start = 13; fields.end = 16; detected.push('time'); }
  else if (/\bmorning\b/.test(text)) { fields.start = 9; fields.end = 12; detected.push('time'); }
  else if (/\b(evening|tonight)\b/.test(text)) { fields.start = 17; fields.end = 20; detected.push('time'); }

  if (/\b(zoom|online|remote|discord)\b/.test(text)) { fields.mode = 'Online'; detected.push('format'); }
  else if (/\b(in person|in-person|library|campus)\b/.test(text)) { fields.mode = 'In person'; detected.push('format'); }

  if (/\b(midterm|final|exam|quiz|test)\b/.test(text)) { fields.urgency = 'Before an exam'; detected.push('urgency'); }

  const cleaned = raw.trim().replace(/\s+/g, ' ');
  fields.topic = cleaned.length > 70 ? `${cleaned.slice(0, 67)}…` : cleaned;
  return { fields, detected };
}
