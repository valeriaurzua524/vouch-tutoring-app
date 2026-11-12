// Client-side mirror of M7 (Reputation Ledger) so the UI can demonstrate
// verification. The real ledger lives in PostgreSQL with INSERT-only grants;
// the backend's /ledger/verify endpoint should return the same VerifyResult.
import type { LedgerEntry, VerifyResult } from '../types';

export const GENESIS = '0'.repeat(64);

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical string that gets hashed. Order matters and must match the backend. */
function canonical(e: Omit<LedgerEntry, 'hash'>): string {
  return [e.seq, e.type, e.bookingId, e.tutorId, JSON.stringify(e.payload), e.ts, e.prevHash].join('|');
}

export async function hashEntry(e: Omit<LedgerEntry, 'hash'>): Promise<string> {
  return sha256(canonical(e));
}

/** Append one record, linking it to the hash of the previous one. */
export async function appendEntry(chain: LedgerEntry[], draft: Omit<LedgerEntry, 'seq' | 'prevHash' | 'hash'>): Promise<LedgerEntry> {
  const prev = chain[chain.length - 1];
  const partial = { ...draft, seq: prev ? prev.seq + 1 : 1, prevHash: prev ? prev.hash : GENESIS };
  return { ...partial, hash: await hashEntry(partial) };
}

export async function buildChain(drafts: Omit<LedgerEntry, 'seq' | 'prevHash' | 'hash'>[]): Promise<LedgerEntry[]> {
  const chain: LedgerEntry[] = [];
  for (const d of drafts) chain.push(await appendEntry(chain, d));
  return chain;
}

/** Walk the chain and report the first broken link (M7 "Verify finds first break"). */
export async function verifyChain(chain: LedgerEntry[], onStep?: (seq: number) => void): Promise<VerifyResult> {
  let prevHash = GENESIS;
  let expectedSeq = chain[0]?.seq ?? 1;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    onStep?.(e.seq);
    if (e.seq !== expectedSeq) {
      return { ok: false, checked: i, firstBreak: expectedSeq, reason: `Entry #${expectedSeq} is missing. The chain jumps from #${expectedSeq - 1} to #${e.seq}.` };
    }
    if (e.prevHash !== prevHash) {
      return { ok: false, checked: i, firstBreak: e.seq, reason: `Entry #${e.seq} points to a previous hash that doesn’t match entry #${e.seq - 1}.` };
    }
    const { hash, ...rest } = e;
    if ((await hashEntry(rest)) !== hash) {
      return { ok: false, checked: i, firstBreak: e.seq, reason: `Entry #${e.seq} was changed after it was written. Its contents no longer match its hash.` };
    }
    prevHash = hash;
    expectedSeq++;
  }
  return { ok: true, checked: chain.length };
}

export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
