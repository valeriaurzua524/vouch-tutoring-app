// Hand-seeded demo data (task B4: ten target courses, taxonomy v1).
// Every name here is fictional sample data for the prototype.
import type { Booking, Course, Day, Dispute, LedgerEntry, User } from '../types';

export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES: Record<Day, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};
/** Hours shown in availability grids (8 AM – 9 PM, campus time). */
export const HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

export const COURSES: Course[] = [
  { code: 'CS 1400', title: 'Introduction to Programming', subject: 'CS', level: 1, topics: ['Java', 'Loops', 'Methods', 'Arrays', 'Debugging'] },
  { code: 'CS 2400', title: 'Data Structures', subject: 'CS', level: 2, topics: ['Linked Lists', 'Stacks & Queues', 'Trees', 'Recursion', 'Big-O', 'Hash Tables'] },
  { code: 'CS 3310', title: 'Design & Analysis of Algorithms', subject: 'CS', level: 3, topics: ['Dynamic Programming', 'Graphs', 'Greedy', 'Divide & Conquer', 'Big-O'] },
  { code: 'MAT 1140', title: 'Calculus I', subject: 'MAT', level: 1, topics: ['Limits', 'Derivatives', 'Chain Rule', 'Optimization'] },
  { code: 'MAT 1150', title: 'Calculus II', subject: 'MAT', level: 1, topics: ['Integrals', 'Integration by Parts', 'Series', 'Sequences'] },
  { code: 'MAT 2250', title: 'Linear Algebra', subject: 'MAT', level: 2, topics: ['Matrices', 'Eigenvalues', 'Vector Spaces', 'Determinants'] },
  { code: 'PHY 1510', title: 'Physics I: Mechanics', subject: 'PHY', level: 1, topics: ['Kinematics', "Newton's Laws", 'Energy', 'Momentum'] },
  { code: 'CHM 1210', title: 'General Chemistry I', subject: 'CHM', level: 1, topics: ['Stoichiometry', 'Atomic Structure', 'Bonding', 'Lab Prep'] },
  { code: 'CHM 1220', title: 'General Chemistry II', subject: 'CHM', level: 1, topics: ['Equilibrium', 'Kinetics', 'Acids & Bases', 'Thermodynamics'] },
  { code: 'STA 1200', title: 'Introduction to Statistics', subject: 'STA', level: 1, topics: ['Probability', 'Distributions', 'Hypothesis Testing', 'Regression'] },
];

export const courseByCode = (code: string) => COURSES.find(c => c.code === code);

/** Build availability keys like "Mon-14" for each day in [from, to). */
const block = (days: Day[], from: number, to: number) =>
  days.flatMap(d => Array.from({ length: to - from }, (_, i) => `${d}-${from + i}`));

export const SEED_USERS: User[] = [
  {
    id: 's1', name: 'Alex Nguyen', initials: 'AN', role: 'student', email: 'alex.nguyen@cpp.edu',
    major: 'Computer Science · Sophomore', color: '#dfe9f5', enrolled: ['CS 2400', 'MAT 1150', 'PHY 1510'],
    preferences: ['Worked examples', 'Practice problems', 'Whiteboard'],
    availability: [...block(['Tue', 'Thu'], 13, 18), ...block(['Mon', 'Wed'], 16, 20), ...block(['Sat'], 10, 14)],
  },
  {
    id: 's2', name: 'Jordan Lee', initials: 'JL', role: 'student', email: 'jordan.lee@cpp.edu',
    major: 'Mechanical Engineering · Freshman', color: '#f3e3d3', enrolled: ['MAT 1140', 'PHY 1510', 'CHM 1210'],
    availability: block(['Mon', 'Wed', 'Fri'], 10, 15),
  },
  {
    id: 't1', name: 'Sofia Martinez', initials: 'SM', role: 'tutor', email: 'sofia.martinez@cpp.edu',
    major: 'Computer Science · Senior', color: '#d6e5dc', modality: 'Both', activeLoad: 2,
    bio: 'I make data structures feel a lot less intimidating. I like drawing everything out first, then coding it together.',
    coursework: [
      { course: 'CS 2400', grade: 'A', professor: 'Prof. Lin', term: 'Fall 2024' },
      { course: 'CS 1400', grade: 'A', professor: 'Prof. Okafor', term: 'Spring 2024' },
      { course: 'CS 3310', grade: 'A-', professor: 'Prof. Hassan', term: 'Spring 2025' },
    ],
    topics: ['Linked Lists', 'Trees', 'Recursion', 'Big-O', 'Java', 'Hash Tables', 'Dynamic Programming'],
    availability: [...block(['Mon', 'Wed'], 12, 17), ...block(['Thu'], 14, 19), ...block(['Fri'], 10, 13)],
  },
  {
    id: 't2', name: 'Daniel Kim', initials: 'DK', role: 'tutor', email: 'daniel.kim@cpp.edu',
    major: 'Mathematics · Junior', color: '#e7ddf3', modality: 'Online', activeLoad: 1,
    bio: 'Patient, step-by-step explanations for calculus. We will do practice problems until it feels routine.',
    coursework: [
      { course: 'MAT 1140', grade: 'A', professor: 'Prof. Reyes', term: 'Fall 2023' },
      { course: 'MAT 1150', grade: 'A', professor: 'Prof. Reyes', term: 'Spring 2024' },
      { course: 'MAT 2250', grade: 'A-', professor: 'Prof. Sato', term: 'Fall 2024' },
    ],
    topics: ['Limits', 'Derivatives', 'Chain Rule', 'Integrals', 'Integration by Parts', 'Series', 'Matrices'],
    availability: [...block(['Tue', 'Thu'], 15, 21), ...block(['Sun'], 12, 16)],
  },
  {
    id: 't3', name: 'Ariana Patel', initials: 'AP', role: 'tutor', email: 'ariana.patel@cpp.edu',
    major: 'Computer Science · Senior', color: '#f5e4cf', modality: 'In person', activeLoad: 4,
    bio: 'Let’s work through coding problems until everything clicks. I was a CS 2400 grader for two terms.',
    coursework: [
      { course: 'CS 2400', grade: 'A', professor: 'Prof. Lin', term: 'Spring 2024' },
      { course: 'CS 3310', grade: 'A', professor: 'Prof. Hassan', term: 'Fall 2024' },
    ],
    topics: ['Trees', 'Recursion', 'Graphs', 'Dynamic Programming', 'Stacks & Queues', 'Big-O'],
    availability: [...block(['Tue', 'Thu'], 13, 17), ...block(['Wed'], 9, 12), ...block(['Sat'], 10, 15)],
  },
  {
    id: 't4', name: 'Noah Rivera', initials: 'NR', role: 'tutor', email: 'noah.rivera@cpp.edu',
    major: 'Mechanical Engineering · Junior', color: '#d9e8ef', modality: 'Both', activeLoad: 0,
    bio: 'Concept-first physics and calc help with lots of practice problems and free-body diagrams.',
    coursework: [
      { course: 'PHY 1510', grade: 'A', professor: 'Prof. Duarte', term: 'Fall 2023' },
      { course: 'MAT 1140', grade: 'B+', professor: 'Prof. Reyes', term: 'Fall 2023' },
      { course: 'MAT 1150', grade: 'A-', professor: 'Prof. Chu', term: 'Spring 2024' },
    ],
    topics: ['Kinematics', "Newton's Laws", 'Energy', 'Momentum', 'Derivatives', 'Integrals'],
    availability: [...block(['Mon', 'Thu'], 9, 13), ...block(['Sat'], 9, 14)],
  },
  {
    id: 't5', name: 'Maya Chen', initials: 'MC', role: 'tutor', email: 'maya.chen@cpp.edu',
    major: 'Chemistry · Senior', color: '#f0dce1', modality: 'Online', activeLoad: 1,
    bio: 'Friendly chemistry help, from the basics to tricky stoichiometry. Lab report reviews too.',
    coursework: [
      { course: 'CHM 1210', grade: 'A', professor: 'Prof. Bauer', term: 'Fall 2023' },
      { course: 'CHM 1220', grade: 'A', professor: 'Prof. Bauer', term: 'Spring 2024' },
      { course: 'STA 1200', grade: 'A-', professor: 'Prof. Ito', term: 'Fall 2024' },
    ],
    topics: ['Stoichiometry', 'Bonding', 'Lab Prep', 'Equilibrium', 'Acids & Bases', 'Probability'],
    availability: [...block(['Mon', 'Tue', 'Fri'], 14, 18)],
  },
  {
    id: 't6', name: 'Ethan Brooks', initials: 'EB', role: 'tutor', email: 'ethan.brooks@cpp.edu',
    major: 'Computer Science · Junior', color: '#e5e9d3', modality: 'Both', activeLoad: 1,
    bio: 'I love helping other Broncos build confidence in programming. No question is too basic.',
    coursework: [
      { course: 'CS 1400', grade: 'A', professor: 'Prof. Okafor', term: 'Fall 2023' },
      { course: 'CS 2400', grade: 'B+', professor: 'Prof. Morales', term: 'Fall 2024' },
    ],
    topics: ['Java', 'Loops', 'Methods', 'Arrays', 'Debugging', 'Linked Lists', 'Stacks & Queues'],
    availability: [...block(['Wed', 'Thu'], 16, 21), ...block(['Sun'], 13, 18)],
  },
  {
    id: 'a1', name: 'Dr. Renee Walker', initials: 'RW', role: 'admin', email: 'learningcenter@cpp.edu',
    major: 'Learning Resource Center · Coordinator', color: '#e9e4d6',
  },
];

const now = Date.now();
const H = 3600_000;

export const SEED_BOOKINGS: Booking[] = [
  {
    id: 'b-1001', studentId: 's1', tutorId: 't1', course: 'CS 2400', topic: 'Recursion and tree traversal',
    tags: ['Recursion', 'Trees'], day: 'Thu', start: 15, end: 16, mode: 'In person', notes: 'Midterm 2 is next week.',
    status: 'scheduled', studentConfirmed: false, tutorConfirmed: false, reviewed: false, disputed: false,
    createdAt: now - 30 * H, matchScore: 0.92,
  },
  {
    id: 'b-1002', studentId: 's1', tutorId: 't3', course: 'CS 2400', topic: 'Linked list insertion and deletion',
    tags: ['Linked Lists'], day: 'Tue', start: 14, end: 15, mode: 'In person', notes: '',
    status: 'completed', studentConfirmed: false, tutorConfirmed: true, reviewed: false, disputed: false,
    createdAt: now - 96 * H, matchScore: 0.81,
    summary: { covered: ['Inserting at head, tail and middle', 'Pointer updates when deleting a node'], gaps: ['Doubly linked list edge cases'] },
  },
  {
    id: 'b-1003', studentId: 's1', tutorId: 't2', course: 'MAT 1150', topic: 'Integration by parts',
    tags: ['Integration by Parts', 'Integrals'], day: 'Tue', start: 17, end: 18, mode: 'Online', notes: '',
    status: 'attested', studentConfirmed: true, tutorConfirmed: true, reviewed: true, disputed: false,
    createdAt: now - 240 * H, matchScore: 0.88,
    summary: { covered: ['Choosing u and dv with LIATE', 'Repeated integration by parts'], gaps: ['Tabular method', 'Trig substitution'] },
  },
  {
    id: 'b-1004', studentId: 's2', tutorId: 't1', course: 'CS 1400', topic: 'Nested loops and 2D arrays',
    tags: ['Loops', 'Arrays'], day: 'Wed', start: 13, end: 14, mode: 'Online', notes: 'Lab 6 keeps going out of bounds.',
    status: 'requested', studentConfirmed: false, tutorConfirmed: false, reviewed: false, disputed: false,
    createdAt: now - 3 * H, matchScore: 0.84,
  },
  {
    id: 'b-1005', studentId: 's2', tutorId: '', course: 'PHY 1510', topic: 'Free-body diagrams on inclines',
    tags: ["Newton's Laws"], day: 'Mon', start: 11, end: 12, mode: 'Either', notes: 'Not sure who to pick, please match me.',
    status: 'open', studentConfirmed: false, tutorConfirmed: false, reviewed: false, disputed: false,
    createdAt: now - 5 * H,
  },
  {
    id: 'b-1006', studentId: 's2', tutorId: 't5', course: 'CHM 1210', topic: 'Limiting reagent problems',
    tags: ['Stoichiometry'], day: 'Fri', start: 15, end: 16, mode: 'Online', notes: '',
    status: 'attested', studentConfirmed: true, tutorConfirmed: true, reviewed: false, disputed: true,
    createdAt: now - 170 * H, matchScore: 0.9,
  },
];

export const SEED_DISPUTES: Dispute[] = [
  {
    id: 'd-1', bookingId: 'b-1006', filedBy: 's2', reason: 'Session was shorter than booked',
    details: 'We started about 20 minutes late because the tutor’s Zoom link changed. Most of the material was still covered.',
    status: 'open', createdAt: now - 20 * H,
  },
];

/** Historical reviews written to the ledger before this demo starts. */
const reviewText: Record<string, [number, string, string][]> = {
  t1: [[5, 'Drew every tree on the whiteboard. Recursion finally makes sense.', 'CS 2400'], [5, 'Super patient and prepared practice problems ahead of time.', 'CS 2400'], [4, 'Great help with Big-O, ran a little long but worth it.', 'CS 3310'], [5, 'Helped me debug my hash table lab without just giving me the answer.', 'CS 2400'], [5, 'Clear and encouraging. Booking again before the final.', 'CS 1400']],
  t2: [[5, 'Explains every step. Series convergence tests are way less scary now.', 'MAT 1150'], [5, 'Very calm and organized.', 'MAT 1140'], [4, 'Good session, would like more practice problems next time.', 'MAT 1150']],
  t3: [[5, 'Knows exactly what Prof. Lin tests on.', 'CS 2400'], [5, 'DP problems finally clicked.', 'CS 3310'], [5, 'Amazing at graph algorithms.', 'CS 3310'], [4, 'Really helpful, the library was noisy though.', 'CS 2400']],
  t4: [[5, 'Free-body diagrams make sense now.', 'PHY 1510'], [4, 'Helpful for the energy unit.', 'PHY 1510']],
  t5: [[5, 'Best chemistry help I’ve had.', 'CHM 1210'], [5, 'Walked me through equilibrium with real examples.', 'CHM 1220'], [5, 'Reviewed my lab report and explained what was missing.', 'CHM 1210']],
  t6: [[5, 'Very friendly, great for beginners.', 'CS 1400'], [4, 'Helped me understand methods and parameters.', 'CS 1400'], [5, 'Debugged my linked list with me step by step.', 'CS 2400']],
};

const reviewers = ['Priya S.', 'Marcus T.', 'Elena R.', 'Kevin O.', 'Hannah W.', 'Luis G.', 'Grace P.', 'Omar F.'];

/** Unhashed ledger records; hashes are computed in the browser on first load. */
export function seedLedgerDrafts(): Omit<LedgerEntry, 'seq' | 'prevHash' | 'hash'>[] {
  const drafts: Omit<LedgerEntry, 'seq' | 'prevHash' | 'hash'>[] = [];
  let day = 60;
  let r = 0;
  const maxLen = Math.max(...Object.values(reviewText).map(v => v.length));
  for (let i = 0; i < maxLen; i++) {
    for (const [tutorId, list] of Object.entries(reviewText)) {
      const item = list[i];
      if (!item) continue;
      const [rating, comment, course] = item;
      const bookingId = `h-${tutorId}-${i + 1}`;
      const ts = new Date(now - day * 24 * H).toISOString();
      drafts.push({ type: 'attestation', bookingId, tutorId, ts, payload: { course, confirmedBy: ['student', 'tutor'], durationMin: 60 } });
      drafts.push({ type: 'review', bookingId, tutorId, ts: new Date(now - day * 24 * H + 2 * H).toISOString(), payload: { course, rating, comment, reviewer: reviewers[r++ % reviewers.length] } });
      day -= 2;
    }
  }
  // Alex's past calculus session with Daniel (b-1003) and its review.
  drafts.push({ type: 'attestation', bookingId: 'b-1003', tutorId: 't2', ts: new Date(now - 9 * 24 * H).toISOString(), payload: { course: 'MAT 1150', confirmedBy: ['student', 'tutor'], durationMin: 60 } });
  drafts.push({ type: 'review', bookingId: 'b-1003', tutorId: 't2', ts: new Date(now - 9 * 24 * H + 3 * H).toISOString(), payload: { course: 'MAT 1150', rating: 5, comment: 'Made integration by parts feel like a recipe. Thank you!', reviewer: 'Alex N.' } });
  // Jordan's chemistry session with Maya (b-1006), then the dispute.
  drafts.push({ type: 'attestation', bookingId: 'b-1006', tutorId: 't5', ts: new Date(now - 6 * 24 * H).toISOString(), payload: { course: 'CHM 1210', confirmedBy: ['student', 'tutor'], durationMin: 40 } });
  drafts.push({ type: 'dispute', bookingId: 'b-1006', tutorId: 't5', ts: new Date(now - 20 * H).toISOString(), payload: { reason: 'Session was shorter than booked', filedBy: 'student' } });
  return drafts;
}
