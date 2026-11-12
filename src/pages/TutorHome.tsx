import { useState } from 'react';
import { BadgeCheck, CalendarDays, Check, ChevronRight, Inbox, ShieldCheck, Star, X } from 'lucide-react';
import type { VerifyResult } from '../types';
import { DAY_NAMES } from '../data/seed';
import { fmtHour, fmtRange, pct, timeAgo } from '../lib/format';
import { go, useStore } from '../lib/store';
import { Avatar, VerifyBanner, VerifyButton } from '../components/ui';
import { LedgerBlock } from '../components/LedgerBlock';

export function TutorHome() {
  const { me, bookings, userById, respond, toast, ratings, ledger } = useStore();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const mine = bookings.filter(b => b.tutorId === me!.id);
  const incoming = mine.filter(b => b.status === 'requested');
  const upcoming = mine.filter(b => b.status === 'scheduled');
  const confirm = mine.filter(b => b.status === 'completed' && !b.tutorConfirmed);
  const r = ratings[me!.id];
  const myEntries = ledger.filter(e => e.tutorId === me!.id);
  const hours = me!.availability?.length ?? 0;

  return (
    <main className="section page">
      <div className="kicker">TUTOR DASHBOARD</div>
      <h1 className="pagetitle">Welcome back, <em>{me!.name.split(' ')[0]}.</em></h1>
      <p className="pageintro">You’re listed for {me!.coursework?.map(c => c.course).join(', ')} with {hours} free hours a week.</p>

      <div className="stats">
        <div className={`stat ${incoming.length ? 'attn' : ''}`}><span>New requests</span><strong>{incoming.length}</strong><small>waiting for your reply</small></div>
        <div className="stat"><span>This week</span><strong>{upcoming.length}</strong><small>scheduled sessions</small></div>
        <div className="stat"><span>Rating</span><strong>{r ? r.avg.toFixed(1) : '—'}<Star size={18} fill="currentColor" className="statstar" /></strong><small>{r?.count ?? 0} verified reviews</small></div>
        <div className="stat"><span>Ledger</span><strong>{myEntries.length}</strong><small>entries on your record</small></div>
      </div>

      <div className="dashgrid">
        <div className="dashmain">
          <section className="panel">
            <div className="panelhead"><h2>Incoming requests</h2><button className="textlink" onClick={() => go('sessions')}>All sessions <ChevronRight size={15} /></button></div>
            {incoming.length === 0 && <div className="emptyinline"><Inbox size={22} /> No new requests. Keeping your availability current helps you show up in matches.</div>}
            {incoming.map(b => {
              const s = userById(b.studentId)!;
              return (
                <div className="requestrow" key={b.id}>
                  <Avatar user={s} size={44} />
                  <div className="rr-body">
                    <strong>{s.name} <small className="muted">· {s.major}</small></strong>
                    <span>{b.course} · {b.topic}</span>
                    <small className="muted"><CalendarDays size={13} /> {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)} · {b.mode} · {b.matchScore ? `${pct(b.matchScore)} match · ` : ''}{timeAgo(b.createdAt)}</small>
                    {b.notes && <em>“{b.notes}”</em>}
                  </div>
                  <div className="rr-actions">
                    <button className="outline small danger" aria-label="Decline" onClick={() => { respond(b.id, false); toast('Request declined.'); }}><X size={15} /></button>
                    <button className="primary small" onClick={() => { respond(b.id, true); toast(`Accepted! ${s.name.split(' ')[0]} has been notified.`); }}><Check size={15} /> Accept</button>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel">
            <div className="panelhead"><h2>Upcoming</h2></div>
            {upcoming.length === 0 && confirm.length === 0 && <div className="emptyinline"><CalendarDays size={22} /> Nothing scheduled.</div>}
            {confirm.map(b => (
              <div className="actionrow" key={b.id}>
                <span className="ar-icon"><BadgeCheck size={18} /></span>
                <div><strong>Confirm your session with {userById(b.studentId)?.name}</strong><small>{b.course} · {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)}</small></div>
                <button className="primary small" onClick={() => go('sessions')}>Confirm</button>
              </div>
            ))}
            {upcoming.map(b => (
              <div className="actionrow" key={b.id}>
                <span className="ar-date"><small>{b.day}</small>{fmtHour(b.start)}</span>
                <div><strong>{b.course} · {b.topic}</strong><small>with {userById(b.studentId)?.name} · {b.mode}</small></div>
                <button className="outline small" onClick={() => go('sessions')}>Open</button>
              </div>
            ))}
          </section>
        </div>

        <aside className="dashside">
          <section className="panel">
            <div className="panelhead"><h2><ShieldCheck size={18} /> Your record</h2></div>
            <p className="muted small">Anyone can verify that your reviews haven’t been edited or removed.</p>
            <VerifyButton chain={ledger} label="Verify my record" compact onResult={setResult} />
            <VerifyBanner result={result} />
            <div className="miniledger">{myEntries.slice(-3).reverse().map(e => <LedgerBlock key={e.seq} e={e} showTutor={false} />)}</div>
            <button className="textlink" onClick={() => go(`tutor/${me!.id}`)}>View public profile <ChevronRight size={15} /></button>
          </section>
        </aside>
      </div>
    </main>
  );
}
