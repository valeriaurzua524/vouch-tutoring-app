import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, ShieldAlert, ShieldCheck, Star, X } from 'lucide-react';
import type { Booking, BookingStatus, LedgerEntry, User, VerifyResult } from '../types';
import { verifyChain } from '../lib/ledger';

export function Avatar({ user, size = 48 }: { user: Pick<User, 'initials' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ background: user.color, width: size, height: size, fontSize: size * 0.32, borderRadius: size * 0.27 }}>
      {user.initials}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map(i => <Star key={i} size={size} fill={i <= Math.round(value) ? 'currentColor' : 'none'} />)}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const labels = ['', 'Not helpful', 'Somewhat helpful', 'Helpful', 'Very helpful', 'Couldn’t have done it without them'];
  return (
    <div className="starinput">
      <div role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map(i => (
          <button type="button" key={i} role="radio" aria-checked={value === i} aria-label={`${i} star${i > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => onChange(i)}>
            <Star size={30} fill={i <= (hover || value) ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
      <span>{labels[hover || value] || 'Tap to rate'}</span>
    </div>
  );
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  open: 'Waiting for a match', requested: 'Awaiting tutor', scheduled: 'Scheduled', declined: 'Declined',
  cancelled: 'Cancelled', completed: 'Needs confirmation', attested: 'Attested',
};
export function StatusPill({ status }: { status: BookingStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** Booking lifecycle stepper: request → accept → session → both confirm → review. */
export function Lifecycle({ b }: { b: Booking }) {
  const steps = ['Requested', 'Accepted', 'Session held', 'Both confirmed', 'Reviewed'];
  const reached =
    b.status === 'open' || b.status === 'requested' ? 1
      : b.status === 'scheduled' ? 2
        : b.status === 'completed' ? 3
          : b.status === 'attested' ? (b.reviewed ? 5 : 4) : 1;
  if (b.status === 'declined' || b.status === 'cancelled') return null;
  return (
    <ol className="lifecycle" aria-label="Session progress">
      {steps.map((s, i) => (
        <li key={s} className={i < reached ? 'done' : i === reached ? 'current' : ''}>
          <span className="dotstep">{i < reached ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
          <span className="steplabel">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modalback" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="toast" role="status"><CheckCircle2 size={18} />{message}</div>;
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return <div className="empty">{icon}<h3>{title}</h3>{children}</div>;
}

export function PageHead({ kicker, title, em, intro, children }: { kicker: string; title: string; em: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <div className="kicker">{kicker}</div>
        <h1 className="pagetitle">{title} <em>{em}</em></h1>
        {intro && <p className="pageintro">{intro}</p>}
      </div>
      {children && <div className="pageheadactions">{children}</div>}
    </div>
  );
}

/** Runs chain verification with a short visible walk, then shows the result. */
export function VerifyButton({ chain, label = 'Verify chain', onResult, onStep, compact }: {
  chain: LedgerEntry[]; label?: string; compact?: boolean;
  onResult?: (r: VerifyResult) => void; onStep?: (seq: number | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const delay = Math.max(8, Math.min(40, 1400 / Math.max(chain.length, 1)));
    const r = await verifyChain(chain);
    // Replay the walk visually up to the first break so people can watch it happen.
    for (const e of chain.slice(0, r.ok ? chain.length : r.checked + 1)) { onStep?.(e.seq); await new Promise(res => setTimeout(res, delay)); }
    onStep?.(null);
    setBusy(false);
    onResult?.(r);
  };
  return (
    <button className={compact ? 'outline small' : 'primary'} onClick={run} disabled={busy || !chain.length}>
      <ShieldCheck size={16} /> {busy ? 'Verifying…' : label}
    </button>
  );
}

export function VerifyBanner({ result, onClose }: { result: VerifyResult | null; onClose?: () => void }) {
  if (!result) return null;
  return result.ok ? (
    <div className="verifybanner ok" role="status">
      <ShieldCheck size={22} />
      <div><strong>Chain intact.</strong> All {result.checked} entries were re-hashed and every link matches. Nothing has been edited or removed.</div>
      {onClose && <button aria-label="Dismiss" onClick={onClose}><X size={16} /></button>}
    </div>
  ) : (
    <div className="verifybanner bad" role="alert">
      <ShieldAlert size={22} />
      <div><strong>Chain broken at entry #{result.firstBreak}.</strong> {result.reason} {result.checked} entries before it are still valid.</div>
      {onClose && <button aria-label="Dismiss" onClick={onClose}><X size={16} /></button>}
    </div>
  );
}
