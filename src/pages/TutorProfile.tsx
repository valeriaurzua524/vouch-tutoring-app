import { useState } from 'react';
import { ArrowLeft, ChevronRight, GraduationCap, MapPin, ShieldCheck, Star, UserX, Video } from 'lucide-react';
import type { VerifyResult } from '../types';
import { courseByCode } from '../data/seed';
import { go, useStore } from '../lib/store';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { LedgerBlock } from '../components/LedgerBlock';
import { Avatar, Empty, Stars, VerifyBanner, VerifyButton } from '../components/ui';

export function TutorProfile({ id }: { id: string }) {
  const { userById, ratings, ledger, role, setDraft, me } = useStore();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const t = userById(id);
  if (!t || t.role !== 'tutor') {
    return <main className="section page narrow"><Empty icon={<UserX size={36} />} title="Tutor not found"><button className="primary" onClick={() => go('')}>Go home</button></Empty></main>;
  }
  const r = ratings[t.id];
  const entries = ledger.filter(e => e.tutorId === t.id);
  const reviews = entries.filter(e => e.type === 'review');
  const dist = [5, 4, 3, 2, 1].map(n => reviews.filter(e => Number(e.payload.rating) === n).length);
  const sessions = entries.filter(e => e.type === 'attestation').length;

  const requestWith = () => {
    const c = t.coursework?.[0]?.course ?? 'CS 2400';
    setDraft({ raw: '', course: c, topic: '', tags: [], day: 'Thu', start: 15, end: 17, mode: 'Either', urgency: 'This week', notes: '' });
    go(role === 'student' ? 'request' : 'signin');
  };

  return (
    <main className="section page">
      <button className="backlink" onClick={() => history.back()}><ArrowLeft size={16} /> Back</button>
      <div className="profilehero">
        <Avatar user={t} size={96} />
        <div className="ph-main">
          <div className="kicker">PEER TUTOR</div>
          <h1>{t.name}</h1>
          <p className="muted">{t.major}</p>
          <div className="ph-facts">
            <span className="gold"><Star size={16} fill="currentColor" /> {r ? r.avg.toFixed(1) : 'New'} · {r?.count ?? 0} verified reviews</span>
            <span><ShieldCheck size={16} /> {sessions} attested sessions</span>
            <span>{t.modality === 'Online' ? <Video size={16} /> : <MapPin size={16} />} {t.modality === 'Both' ? 'Online or in person' : t.modality}</span>
          </div>
          <p className="ph-bio">{t.bio}</p>
        </div>
        {role !== 'tutor' && role !== 'admin' && <button className="primary" onClick={requestWith}>Request a session <ChevronRight size={17} /></button>}
      </div>

      <div className="profilegrid">
        <div>
          <section className="panel">
            <div className="panelhead"><h2><GraduationCap size={18} /> Completed coursework</h2><span className="verifiedtag"><ShieldCheck size={13} /> Transcript verified</span></div>
            <table className="cwtable">
              <thead><tr><th>Course</th><th>Grade</th><th>Professor</th><th>Term</th></tr></thead>
              <tbody>{t.coursework?.map(c => <tr key={c.course}><td><strong>{c.course}</strong><small>{courseByCode(c.course)?.title}</small></td><td><span className="grade">{c.grade}</span></td><td>{c.professor}</td><td>{c.term}</td></tr>)}</tbody>
            </table>
            <h4 className="subhead">Topics</h4>
            <div className="tags">{t.topics?.map(x => <span key={x}>{x}</span>)}</div>
          </section>
          <section className="panel">
            <div className="panelhead"><h2>Weekly availability</h2><small className="muted">Campus time</small></div>
            {role === 'student' && me && <p className="small muted gridlegend"><span className="lg on" /> {t.name.split(' ')[0]} is free <span className="lg both" /> you’re both free</p>}
            <AvailabilityGrid value={t.availability ?? []} compare={role === 'student' ? me?.availability : undefined} />
          </section>
        </div>
        <div>
          <section className="panel">
            <div className="panelhead"><h2>Reputation record</h2></div>
            <div className="ratingdist">
              <div className="rd-big"><strong>{r ? r.avg.toFixed(1) : '—'}</strong><Stars value={r?.avg ?? 0} /><small>{reviews.length} reviews</small></div>
              <div className="rd-bars">{dist.map((n, i) => <div key={i} className="rd-row"><span>{5 - i}</span><span className="rd-bar"><span style={{ width: reviews.length ? `${(n / reviews.length) * 100}%` : 0 }} /></span><small>{n}</small></div>)}</div>
            </div>
            <div className="verifyrow">
              <p className="muted small">Each entry below includes the hash of the entry before it in the campus-wide ledger. Verify re-computes every hash.</p>
              <VerifyButton chain={ledger} label="Verify this record" compact onResult={setResult} onStep={setChecking} />
            </div>
            <VerifyBanner result={result} onClose={() => setResult(null)} />
            <div className="ledgerlist compact">
              {entries.slice().reverse().map(e => (
                <LedgerBlock key={e.seq} e={e} showTutor={false}
                  state={checking === e.seq ? 'checking' : result && !result.ok && result.firstBreak === e.seq ? 'broken' : undefined} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
