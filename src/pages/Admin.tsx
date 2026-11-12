import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Check, ClipboardList, FlaskConical, Gavel, Inbox, RotateCcw, ShieldCheck, Trash2, UserCheck, Pencil } from 'lucide-react';
import type { VerifyResult } from '../types';
import { DAY_NAMES } from '../data/seed';
import { fmtRange, pct, timeAgo } from '../lib/format';
import { rankTutors } from '../lib/matching';
import { go, useStore } from '../lib/store';
import { LedgerBlock } from '../components/LedgerBlock';
import { Avatar, Empty, PageHead, StatusPill, VerifyBanner, VerifyButton } from '../components/ui';

export function Admin({ tab }: { tab: string }) {
  const { bookings, disputes } = useStore();
  const open = bookings.filter(b => b.status === 'open').length;
  const openDisputes = disputes.filter(d => d.status === 'open').length;
  const tabs: [string, string, number][] = [['admin', 'Audit', 0], ['admin/queue', 'Match queue', open], ['admin/disputes', 'Disputes', openDisputes]];
  const current = tab ? `admin/${tab}` : 'admin';
  return (
    <main className="section page">
      <PageHead kicker="LEARNING RESOURCE CENTER" title="Admin &" em="audit." intro="Match students by hand, resolve disputes, and check that the reputation record hasn’t been touched." />
      <div className="tabs" role="tablist">
        {tabs.map(([to, label, n]) => (
          <button key={to} role="tab" aria-selected={current === to} className={current === to ? 'on' : ''} onClick={() => go(to)}>
            {label}{n > 0 && <span className="count hot">{n}</span>}
          </button>
        ))}
      </div>
      {current === 'admin' && <Audit />}
      {current === 'admin/queue' && <Queue />}
      {current === 'admin/disputes' && <Disputes />}
    </main>
  );
}

function Audit() {
  const { ledger, ledgerBackup, bookings, tamper, restoreLedger, toast } = useStore();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const reviews = ledger.filter(e => e.type === 'review');
  const [target, setTarget] = useState<number>(reviews[Math.floor(reviews.length / 2)]?.seq ?? 1);

  const total = bookings.length;
  const decided = bookings.filter(b => !['open', 'requested'].includes(b.status));
  const accepted = bookings.filter(b => ['scheduled', 'completed', 'attested'].includes(b.status));
  const attested = bookings.filter(b => b.status === 'attested');
  const metrics: [string, string, string][] = [
    ['Requests', String(total), 'all time in demo'],
    ['Acceptance rate', decided.length ? pct(accepted.length / decided.length) : '—', `${accepted.length} of ${decided.length} answered`],
    ['Completion rate', accepted.length ? pct(attested.length / accepted.length) : '—', `${attested.length} attested`],
    ['Ledger entries', String(ledger.length), ledgerBackup ? 'tampered copy active' : 'append-only'],
  ];

  return (
    <>
      <div className="stats">{metrics.map(([a, b, c]) => <div className="stat" key={a}><span>{a}</span><strong>{b}</strong><small>{c}</small></div>)}</div>
      <div className="dashgrid">
        <div className="dashmain">
          <section className="panel">
            <div className="panelhead"><h2><ShieldCheck size={18} /> Chain verification</h2><VerifyButton chain={ledger} compact onResult={setResult} onStep={setChecking} /></div>
            <VerifyBanner result={result} onClose={() => setResult(null)} />
            <div className="ledgerlist compact scroll">
              {ledger.slice().reverse().map(e => (
                <LedgerBlock key={e.seq} e={e}
                  state={checking === e.seq ? 'checking' : result && !result.ok && result.firstBreak !== undefined && e.seq >= result.firstBreak ? 'broken' : undefined} />
              ))}
            </div>
          </section>
        </div>
        <aside className="dashside">
          <section className="panel tamper">
            <div className="panelhead"><h2><FlaskConical size={18} /> Tamper demonstration</h2></div>
            <p className="small">Simulates someone with database access secretly changing history. In production this is impossible from the app: the ledger table blocks UPDATE and DELETE at the database level.</p>
            <label className="field">Target entry
              <select value={target} onChange={e => setTarget(Number(e.target.value))}>
                {reviews.map(e => <option key={e.seq} value={e.seq}>#{e.seq} · {String(e.payload.rating)}★ · {String(e.payload.reviewer)}</option>)}
              </select>
            </label>
            <div className="tamperbtns">
              <button className="outline small danger" onClick={() => { tamper(target, 'edit'); setResult(null); toast(`Entry #${target} edited without re-hashing. Now run verify.`); }}><Pencil size={14} /> Change to 1★</button>
              <button className="outline small danger" onClick={() => { tamper(target, 'delete'); setResult(null); toast(`Entry #${target} deleted. Now run verify.`); }}><Trash2 size={14} /> Delete entry</button>
            </div>
            {ledgerBackup && (
              <button className="primary small full" onClick={() => { restoreLedger(); setResult(null); toast('Ledger restored from the append-only original.'); }}><RotateCcw size={14} /> Restore original</button>
            )}
            <small className="demotag">Demo mode only</small>
          </section>
          <section className="panel">
            <div className="panelhead"><h2><BarChart3 size={18} /> Raw counts</h2></div>
            <ul className="rawcounts">
              {(['open', 'requested', 'scheduled', 'completed', 'attested', 'declined', 'cancelled'] as const).map(s => (
                <li key={s}><StatusPill status={s} /><strong>{bookings.filter(b => b.status === s).length}</strong></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function Queue() {
  const { bookings } = useStore();
  const open = bookings.filter(b => b.status === 'open');
  if (!open.length) return <Empty icon={<Inbox size={36} />} title="Queue is empty"><p>Requests where a student asked the Learning Center to pick a tutor show up here.</p></Empty>;
  return <div className="sessionlist">{open.map(b => <QueueItem key={b.id} id={b.id} />)}</div>;
}

function QueueItem({ id }: { id: string }) {
    const { bookings, userById, tutors, ratings, assignTutor, toast } = useStore();
    const b = bookings.find(x => x.id === id)!;
    const s = userById(b.studentId)!;
    const ranked = useMemo(() => rankTutors({ raw: '', course: b.course, topic: b.topic, tags: b.tags, day: b.day, start: b.start, end: b.end, mode: 'Either', urgency: 'This week', notes: '' }, tutors, ratings), [b]);
    const [pick, setPick] = useState(ranked[0]?.tutor.id ?? tutors[0].id);
    const chosen = ranked.find(r => r.tutor.id === pick);
    return (
      <article className="sessioncard">
        <div className="sc-top">
          <Avatar user={s} size={48} />
          <div className="sc-info">
            <div className="sc-titlerow"><StatusPill status="open" /><small className="muted">#{b.id} · {timeAgo(b.createdAt)}</small></div>
            <h3>{b.course} · {b.topic}</h3>
            <div className="sc-meta"><span>{s.name}</span><span className="withicon"><CalendarDays size={14} /> {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)}</span><span>{b.mode}</span>{b.tags.map(t => <span key={t} className="rs-tag">{t}</span>)}</div>
          </div>
        </div>
        {b.notes && <p className="sc-notes">“{b.notes}”</p>}
        <div className="assign">
          <label className="field">Assign tutor
            <select value={pick} onChange={e => setPick(e.target.value)}>
              {ranked.map(r => <option key={r.tutor.id} value={r.tutor.id}>{r.tutor.name} · {pct(r.score)} match</option>)}
              {tutors.filter(t => !ranked.some(r => r.tutor.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.name} · no course overlap</option>)}
            </select>
          </label>
          <button className="primary small" onClick={() => { assignTutor(b.id, pick, chosen?.score ?? 0); toast(`Assigned to ${userById(pick)?.name}. They’ll see it as a new request.`); }}><UserCheck size={15} /> Assign</button>
        </div>
        {chosen && <p className="small muted assignwhy">{chosen.explanation}</p>}
      </article>
    );
}

function Disputes() {
  const { disputes, bookings, userById, resolveDispute, toast } = useStore();
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  if (!disputes.length) return <Empty icon={<ClipboardList size={36} />} title="No disputes" />;
  return (
    <div className="sessionlist">
      {disputes.map(d => {
        const b = bookings.find(x => x.id === d.bookingId);
        const filer = userById(d.filedBy);
        return (
          <article className={`sessioncard dispute ${d.status}`} key={d.id}>
            <div className="sc-titlerow">
              <span className={`pill ${d.status === 'open' ? 'pill-dispute' : 'pill-attested'}`}>{d.status === 'open' ? <><AlertTriangle size={11} /> Open</> : <><Check size={11} /> Resolved</>}</span>
              <small className="muted">{d.id} · session #{d.bookingId} · {timeAgo(d.createdAt)}</small>
            </div>
            <h3>{d.reason}</h3>
            {b && <p className="muted small">{b.course} · {userById(b.studentId)?.name} with {userById(b.tutorId)?.name} · filed by {filer?.name}</p>}
            <p className="sc-notes">“{d.details}”</p>
            {d.status === 'open' ? (
              <div className="assign">
                <label className="field">Outcome (recorded on the ledger)
                  <input placeholder="e.g. Partial session confirmed; no penalty for tutor" value={outcomes[d.id] ?? ''} onChange={e => setOutcomes({ ...outcomes, [d.id]: e.target.value })} />
                </label>
                <button className="primary small" onClick={async () => {
                  const o = (outcomes[d.id] ?? '').trim();
                  if (!o) return toast('Write an outcome first.');
                  await resolveDispute(d.id, o);
                  toast('Dispute resolved and appended to the ledger.');
                }}><Gavel size={15} /> Resolve</button>
              </div>
            ) : <p className="resolved"><Gavel size={15} /> {d.outcome}</p>}
          </article>
        );
      })}
    </div>
  );
}
