// Shared domain types for the Vouch UI.
// These mirror the entities in the Architecture Specification (M1–M8) so the
// backend team can return the same shapes from the real Express API.

export type Role = 'student' | 'tutor' | 'admin';
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type Modality = 'Online' | 'In person' | 'Both';

export interface Course {
  code: string;
  title: string;
  subject: string;
  level: number;
  topics: string[];
}

export interface Coursework {
  course: string;
  grade: string;
  professor: string;
  term: string;
}

export interface User {
  id: string;
  name: string;
  initials: string;
  role: Role;
  email: string;
  major: string;
  color: string;
  bio?: string;
  /** Tutor: completed courses with grade earned (M1). */
  coursework?: Coursework[];
  /** Tutor: declared topic tags from the course taxonomy. */
  topics?: string[];
  modality?: Modality;
  /** Recurring weekly free blocks, keyed "Mon-14" = Monday 2–3 PM (M2). */
  availability?: string[];
  /** Student: courses currently enrolled in. */
  enrolled?: string[];
  /** Student: what helps them learn. */
  preferences?: string[];
  /** Tutor: active bookings, used for the load penalty. */
  activeLoad?: number;
}

/** Booking lifecycle from M5: request → accept → scheduled → completed → attested. */
export type BookingStatus = 'open' | 'requested' | 'scheduled' | 'declined' | 'cancelled' | 'completed' | 'attested';

export interface SessionSummary {
  covered: string[];
  gaps: string[];
}

export interface Booking {
  id: string;
  studentId: string;
  /** Empty when the request waits in the Learning Center's manual-match queue. */
  tutorId: string;
  course: string;
  topic: string;
  tags: string[];
  day: Day;
  start: number;
  end: number;
  mode: string;
  notes: string;
  status: BookingStatus;
  studentConfirmed: boolean;
  tutorConfirmed: boolean;
  reviewed: boolean;
  disputed: boolean;
  createdAt: number;
  matchScore?: number;
  /** Advisory AI summary; stored outside the ledger and never hashed. */
  summary?: SessionSummary;
}

export type LedgerType = 'attestation' | 'review' | 'dispute' | 'resolution';

export interface LedgerEntry {
  seq: number;
  type: LedgerType;
  bookingId: string;
  tutorId: string;
  payload: Record<string, string | number | string[]>;
  ts: string;
  prevHash: string;
  hash: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  filedBy: string;
  reason: string;
  details: string;
  status: 'open' | 'resolved';
  outcome?: string;
  createdAt: number;
}

export interface HelpRequest {
  raw: string;
  course: string;
  topic: string;
  tags: string[];
  day: Day;
  start: number;
  end: number;
  mode: 'Either' | 'Online' | 'In person';
  urgency: 'This week' | 'Before an exam' | 'No rush';
  notes: string;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  firstBreak?: number;
  reason?: string;
}
