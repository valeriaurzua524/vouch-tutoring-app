// Mock API + app state. Every exported action matches an endpoint the backend
// team will provide (see README "Backend hand-off"). Until then, state lives in
// localStorage so the prototype survives a page refresh.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Booking, Dispute, HelpRequest, LedgerEntry, Role, User } from '../types';
import { SEED_BOOKINGS, SEED_DISPUTES, SEED_USERS, seedLedgerDrafts } from '../data/seed';
import { appendEntry, buildChain } from './ledger';

const STORAGE_KEY = 'vouch_ui_state_v1';

interface State {
  role: Role | null;
  userIds: Record<Role, string>;
  users: User[];
  bookings: Booking[];
  ledger: LedgerEntry[];
  /** Copy of the ledger taken before a tamper demo, so the admin can restore it. */
  ledgerBackup: LedgerEntry[] | null;
  disputes: Dispute[];
  draft: HelpRequest | null;
}

interface Store extends State {
  ready: boolean;
  me: User | null;
  userById: (id: string) => User | undefined;
  tutors: User[];
  ratings: Record<string, { avg: number; count: number }>;
  notice: string;
  toast: (msg: string) => void;
  signIn: (role: Role, userId?: string) => void;
  signOut: () => void;
  updateUser: (u: User) => void;
  setDraft: (r: HelpRequest | null) => void;
  requestSession: (b: Omit<Booking, 'id' | 'status' | 'studentConfirmed' | 'tutorConfirmed' | 'reviewed' | 'disputed' | 'createdAt'>) => Booking;
  respond: (id: string, accept: boolean) => void;
  cancel: (id: string) => void;
  confirmSession: (id: string) => Promise<void>;
  submitReview: (id: string, rating: number, comment: string, tags: string[]) => Promise<void>;
  fileDispute: (bookingId: string, reason: string, details: string) => Promise<void>;
  resolveDispute: (id: string, outcome: string) => Promise<void>;
  assignTutor: (bookingId: string, tutorId: string, score: number) => void;
  tamper: (seq: number, mode: 'edit' | 'delete') => void;
  restoreLedger: () => void;
  resetDemo: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

async function freshState(): Promise<State> {
  return {
    role: null,
    userIds: { student: 's1', tutor: 't1', admin: 'a1' },
    users: SEED_USERS,
    bookings: SEED_BOOKINGS,
    ledger: await buildChain(seedLedgerDrafts()),
    ledgerBackup: null,
    disputes: SEED_DISPUTES,
    draft: null,
  };
}

const MOCK_SUMMARY = {
  covered: ['Walked through the core idea with a worked example', 'Solved two practice problems together'],
  gaps: ['Edge cases on harder exam-style questions'],
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [notice, setNotice] = useState('');
  const ref = useRef<State | null>(null);
  ref.current = state;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let saved: State | null = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
    if (saved?.ledger?.length) setState(saved);
    else freshState().then(setState);
  }, []);

  useEffect(() => {
    if (!state) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ }
  }, [state]);

  const toast = useCallback((msg: string) => {
    setNotice(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(''), 3800);
  }, []);

  const patch = (fn: (s: State) => Partial<State>) => setState(s => (s ? { ...s, ...fn(s) } : s));
  const patchBooking = (id: string, fn: (b: Booking) => Partial<Booking>) =>
    patch(s => ({ bookings: s.bookings.map(b => (b.id === id ? { ...b, ...fn(b) } : b)) }));

  const append = async (draft: Omit<LedgerEntry, 'seq' | 'prevHash' | 'hash'>) => {
    const chain = ref.current!.ledger;
    const entry = await appendEntry(chain, draft);
    patch(s => ({ ledger: [...s.ledger, entry] }));
    return entry;
  };

  const store = useMemo<Store | null>(() => {
    if (!state) return null;
    const userById = (id: string) => state.users.find(u => u.id === id);
    const me = state.role ? userById(state.userIds[state.role]) ?? null : null;
    const ratings: Record<string, { avg: number; count: number }> = {};
    for (const e of state.ledger) {
      if (e.type !== 'review') continue;
      const r = ratings[e.tutorId] ?? { avg: 0, count: 0 };
      const total = r.avg * r.count + Number(e.payload.rating);
      ratings[e.tutorId] = { count: r.count + 1, avg: total / (r.count + 1) };
    }
    const nowIso = () => new Date().toISOString();

    return {
      ...state,
      ready: true,
      me,
      userById,
      tutors: state.users.filter(u => u.role === 'tutor'),
      ratings,
      notice,
      toast,
      signIn: (role, userId) => patch(s => ({ role, userIds: userId ? { ...s.userIds, [role]: userId } : s.userIds })),
      signOut: () => patch(() => ({ role: null })),
      updateUser: u => patch(s => ({ users: s.users.map(x => (x.id === u.id ? u : x)) })),
      setDraft: r => patch(() => ({ draft: r })),
      requestSession: b => {
        const booking: Booking = {
          ...b, id: `b-${Math.floor(Date.now() / 1000) % 100000}`, status: b.tutorId ? 'requested' : 'open',
          studentConfirmed: false, tutorConfirmed: false, reviewed: false, disputed: false, createdAt: Date.now(),
        };
        patch(s => ({ bookings: [booking, ...s.bookings] }));
        return booking;
      },
      respond: (id, accept) => {
        patchBooking(id, () => ({ status: accept ? 'scheduled' : 'declined' }));
        if (accept) patch(s => {
          const b = s.bookings.find(x => x.id === id);
          return { users: s.users.map(u => (u.id === b?.tutorId ? { ...u, activeLoad: (u.activeLoad ?? 0) + 1 } : u)) };
        });
      },
      cancel: id => patchBooking(id, () => ({ status: 'cancelled' })),
      confirmSession: async id => {
        const s = ref.current!;
        const b = s.bookings.find(x => x.id === id)!;
        const asTutor = s.role === 'tutor';
        const studentConfirmed = b.studentConfirmed || !asTutor;
        const tutorConfirmed = b.tutorConfirmed || asTutor;
        const both = studentConfirmed && tutorConfirmed;
        patchBooking(id, () => ({ studentConfirmed, tutorConfirmed, status: both ? 'attested' : 'completed', summary: b.summary ?? MOCK_SUMMARY }));
        if (both) {
          await append({ type: 'attestation', bookingId: id, tutorId: b.tutorId, ts: nowIso(), payload: { course: b.course, confirmedBy: ['student', 'tutor'], durationMin: (b.end - b.start) * 60 } });
          patch(st => ({ users: st.users.map(u => (u.id === b.tutorId ? { ...u, activeLoad: Math.max(0, (u.activeLoad ?? 1) - 1) } : u)) }));
        }
      },
      submitReview: async (id, rating, comment, tags) => {
        const s = ref.current!;
        const b = s.bookings.find(x => x.id === id)!;
        const student = s.users.find(u => u.id === b.studentId)!;
        const [first, last] = student.name.split(' ');
        await append({ type: 'review', bookingId: id, tutorId: b.tutorId, ts: nowIso(), payload: { course: b.course, rating, comment, reviewer: `${first} ${last?.[0] ?? ''}.`, ...(tags.length ? { tags } : {}) } });
        patchBooking(id, () => ({ reviewed: true }));
      },
      fileDispute: async (bookingId, reason, details) => {
        const s = ref.current!;
        const b = s.bookings.find(x => x.id === bookingId)!;
        const d: Dispute = { id: `d-${Date.now() % 100000}`, bookingId, filedBy: s.userIds[s.role!], reason, details, status: 'open', createdAt: Date.now() };
        patch(st => ({ disputes: [d, ...st.disputes] }));
        patchBooking(bookingId, () => ({ disputed: true }));
        await append({ type: 'dispute', bookingId, tutorId: b.tutorId, ts: nowIso(), payload: { reason, filedBy: s.role! } });
      },
      resolveDispute: async (id, outcome) => {
        const d = ref.current!.disputes.find(x => x.id === id)!;
        const b = ref.current!.bookings.find(x => x.id === d.bookingId)!;
        patch(st => ({ disputes: st.disputes.map(x => (x.id === id ? { ...x, status: 'resolved', outcome } : x)) }));
        await append({ type: 'resolution', bookingId: d.bookingId, tutorId: b.tutorId, ts: nowIso(), payload: { outcome, resolvedBy: 'Learning Center' } });
      },
      assignTutor: (bookingId, tutorId, score) => patchBooking(bookingId, () => ({ tutorId, status: 'requested', matchScore: score })),
      tamper: (seq, mode) => patch(s => {
        const backup = s.ledgerBackup ?? s.ledger;
        if (mode === 'delete') return { ledgerBackup: backup, ledger: s.ledger.filter(e => e.seq !== seq) };
        return {
          ledgerBackup: backup,
          ledger: s.ledger.map(e => (e.seq === seq
            ? { ...e, payload: e.type === 'review' ? { ...e.payload, rating: 1, comment: 'Edited: this tutor was terrible.' } : { ...e.payload, durationMin: 180 } }
            : e)),
        };
      }),
      restoreLedger: () => patch(s => ({ ledger: s.ledgerBackup ?? s.ledger, ledgerBackup: null })),
      resetDemo: async () => { const f = await freshState(); setState({ ...f, role: ref.current?.role ?? null }); },
    };
  }, [state, notice, toast]);

  if (!store) return <div className="booting"><span className="brandmark">v.</span>Building the reputation ledger…</div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

/* ---------- Tiny hash router (#/path/param) ---------- */
export function useRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [parts, (path: string) => { window.location.hash = `#/${path.replace(/^\//, '')}`; }];
}

export const go = (path: string) => { window.location.hash = `#/${path.replace(/^\//, '')}`; };
