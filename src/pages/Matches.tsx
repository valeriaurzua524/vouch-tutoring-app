import { useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Info, Pencil, SearchX, ShieldCheck, Sparkles, Star, Users } from 'lucide-react';
import type { Day, User } from '../types';
import { DAY_NAMES, DAYS } from '../data/seed';
import { rankTutors, WEIGHTS, type MatchResult } from '../lib/matching';
import { fmtHour, fmtRange, pct } from '../lib/format';
import { go, useStore } from '../lib/store';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { Avatar, Empty, Modal, PageHead } from '../components/ui';

export function Matches() {
  const { draft, tutors, ratings } = useStore();
  const [booking, setBooking] = useState<MatchResult | null>(null);
  const [why, setWhy] = useState(false);
  const results = useMemo(() => (draft ? rankTutors(draft, tutors, ratings) : []), [draft, tutors, ratings]);

  if (!draft) {
    return (
      <main className="section page narrow">
        <Empty icon={<SearchX size={38} />} title="Tell us what you need first">
          <p>Matches are ranked against a specific request.</p>
          <button className="primary" onClick={() => go('request')}>Start a request</button>
        </Empty>
      </main>
    );
  }

  return (
    <main className="section page">
      <PageHead kicker="YOUR STUDY CREW AWAITS" title="Your best" em="matches." intro="Ranked by a transparent score. Open any breakdown to see exactly why someone is where they are." />

      <div className="requestsummary">
        <div className="rs-main">
          <span className="rs-course">{draft.course}</span>
          <strong>{draft.topic}</strong>
          <div className="rs-meta">
            <span><CalendarDays size={14} /> {DAY_NAMES[draft.day]} {fmtRange(draft.start, draft.end)}</span>
            <span>{draft.mode}</span>
            <span>{draft.urgency}</span>
            {draft.tags.map(t => <span key={t} className="rs-tag">{t}</span>)}
          </div>
        </div>
        <button className="outline small" onClick={() => go('request')}><Pencil size={14} /> Edit request</button>
      </div>

      <div className="resultshead">
        <strong>{results.length} tutors ranked</strong>
        <button className="textlink" onClick={() => setWhy(!why)}><Info size={15} /> How is this scored?</button>
      </div>
      {why && (
        <div className="scoreexplainer">
          <p><strong>Score = </strong>
            <span className="w c1">40% course match</span> + <span className="w c2">30% availability overlap</span> + <span className="w c3">20% topic overlap</span> + <span className="w c4">10% rating</span> − <span className="w c5">10% current load</span>
          </p>
          <p className="muted small">Course match is 100% for the same course, 60% for a nearby course in the same subject. Availability is how much of your window the tutor is free for. The load penalty spreads requests so a few popular tutors don’t get swamped. AI only writes the explanation sentence; it never changes the rank.</p>
        </div>
      )}

      {results.length === 0 ? (
        <Empty icon={<Users size={38} />} title="No tutors cover this course yet">
          <p>Send it to the Learning Center and a coordinator will find someone.</p>
          <button className="primary" onClick={() => go('request')}>Back to request</button>
        </Empty>
      ) : (
        <ol className="matchlist">
          {results.map((m, i) => <MatchCard key={m.tutor.id} m={m} rank={i + 1} onBook={() => setBooking(m)} />)}
        </ol>
      )}

      {booking && <BookModal m={booking} onClose={() => setBooking(null)} />}
    </main>
  );
}

function MatchCard({ m, rank, onBook }: { m: MatchResult; rank: number; onBook: () => void }) {
  const { ratings } = useStore();
  const [open, setOpen] = useState(rank === 1);
  const t = m.tutor;
  const r = ratings[t.id];
  const bars: [string, number, number, string][] = [
    ['Course match', m.parts.course, WEIGHTS.course, 'c1'],
    ['Availability overlap', m.parts.availability, WEIGHTS.availability, 'c2'],
    ['Topic overlap', m.parts.tags, WEIGHTS.tags, 'c3'],
    ['Rating', m.parts.rating, WEIGHTS.rating, 'c4'],
  ];
  return (
    <li className={`matchcard ${rank === 1 ? 'top' : ''}`}>
      <div className="mc-rank">{rank}</div>
      <div className="mc-main">
        <div className="mc-head">
          <Avatar user={t} size={56} />
          <div className="mc-id">
            <h3>{t.name} {rank === 1 && <span className="bestpill">Best match</span>}</h3>
            <p className="major">{t.major} · {t.modality === 'Both' ? 'Online or in person' : t.modality}</p>
            <div className="rating"><Star size={14} fill="currentColor" /><strong>{r ? r.avg.toFixed(1) : 'New'}</strong><span>· {r?.count ?? 0} verified reviews</span><span className="chainok"><ShieldCheck size={13} /> on ledger</span></div>
          </div>
          <div className="mc-score" aria-label={`Match score ${pct(m.score)}`}>
            <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" className="track" /><circle cx="18" cy="18" r="15.5" className="fill" strokeDasharray={`${m.score * 97.4} 97.4`} /></svg>
            <span>{Math.round(m.score * 100)}<small>%</small></span>
          </div>
        </div>
        <p className="explanation"><Sparkles size={14} /> {m.explanation}</p>
        {open && (
          <div className="breakdown">
            {bars.map(([label, v, w, c]) => (
              <div className="bd-row" key={label}>
                <span className="bd-label">{label}</span>
                <span className="bd-bar"><span className={c} style={{ width: pct(v) }} /></span>
                <span className="bd-val">{pct(v)} × {w.toFixed(2)} = <strong>+{(v * w * 100).toFixed(0)}</strong></span>
              </div>
            ))}
            <div className="bd-row">
              <span className="bd-label">Current load</span>
              <span className="bd-bar"><span className="c5" style={{ width: pct(m.parts.load) }} /></span>
              <span className="bd-val">{t.activeLoad ?? 0} active × 0.10 = <strong className="neg">−{(m.parts.load * WEIGHTS.load * 100).toFixed(0)}</strong></span>
            </div>
          </div>
        )}
        <div className="mc-foot">
          <div className="tags">{m.matchedTags.map(x => <span key={x}>{x}</span>)}{t.coursework?.slice(0, 2).map(c => <span key={c.course} className="muted">{c.course} · {c.grade}</span>)}</div>
          <div className="mc-actions">
            <button className="textlink" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} breakdown</button>
            <button className="outline small" onClick={() => go(`tutor/${t.id}`)}>Profile</button>
            <button className="primary small" onClick={onBook}>Request session <ChevronRight size={15} /></button>
          </div>
        </div>
      </div>
    </li>
  );
}

function BookModal({ m, onClose }: { m: MatchResult; onClose: () => void }) {
  const { draft, me, requestSession, toast } = useStore();
  const t: User = m.tutor;
  const free = new Set(t.availability);
  const tutorDays = DAYS.filter(d => [...free].some(k => k.startsWith(d + '-')));
  const firstCovered = m.coveredHours[0];
  const [day, setDay] = useState<Day>(firstCovered !== undefined ? draft!.day : tutorDays[0]);
  const hoursFor = (d: Day) => [...free].filter(k => k.startsWith(d + '-')).map(k => Number(k.split('-')[1])).sort((a, b) => a - b);
  const [start, setStart] = useState<number>(firstCovered ?? hoursFor(day)[0]);
  const [len, setLen] = useState(1);
  const canTwo = free.has(`${day}-${start + 1}`);
  const [note, setNote] = useState(draft!.notes);

  const send = () => {
    requestSession({
      studentId: me!.id, tutorId: t.id, course: draft!.course, topic: draft!.topic, tags: draft!.tags, day, start,
      end: start + (canTwo ? len : 1), mode: draft!.mode === 'Either' ? (t.modality === 'Online' ? 'Online' : 'In person') : draft!.mode,
      notes: note, matchScore: m.score,
    });
    toast(`Request sent to ${t.name.split(' ')[0]}! You’ll see it in My sessions.`);
    onClose();
    go('sessions');
  };

  return (
    <Modal title={`Request a session with ${t.name}`} onClose={onClose} wide>
      <div className="bookhead">
        <Avatar user={t} size={52} />
        <div><div className="kicker">REQUEST A SESSION</div><h2>{t.name}</h2><p className="muted">{draft!.course} · {draft!.topic}</p></div>
      </div>
      <div className="bookgrid">
        <div>
          <p className="small muted gridlegend"><span className="lg on" /> {t.name.split(' ')[0]} is free <span className="lg both" /> you’re both free <span className="lg win" /> your requested window</p>
          <AvailabilityGrid value={t.availability ?? []} compare={me?.availability} highlight={{ day: draft!.day, start: draft!.start, end: draft!.end }} />
        </div>
        <div className="bookform">
          <label>Day
            <select value={day} onChange={e => { const d = e.target.value as Day; setDay(d); setStart(hoursFor(d)[0]); }}>
              {tutorDays.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
            </select>
          </label>
          <label>Start time
            <select value={start} onChange={e => setStart(Number(e.target.value))}>
              {hoursFor(day).map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
            </select>
          </label>
          <label>Length
            <div className="segmented">
              <button type="button" className={len === 1 || !canTwo ? 'on' : ''} onClick={() => setLen(1)}>1 hour</button>
              <button type="button" className={len === 2 && canTwo ? 'on' : ''} disabled={!canTwo} onClick={() => setLen(2)}>2 hours</button>
            </div>
          </label>
          <label>Message to {t.name.split(' ')[0]} <small className="optional">Optional</small>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Say hi and share what you’ve tried so far." />
          </label>
          <div className="booksummary">
            <CalendarDays size={16} /> {DAY_NAMES[day]}, {fmtRange(start, start + (canTwo ? len : 1))}
          </div>
          <button className="primary full" onClick={send}>Send request <ChevronRight size={17} /></button>
          <small className="disclaimer">{t.name.split(' ')[0]} can accept or decline. Nothing is charged in this prototype.</small>
        </div>
      </div>
    </Modal>
  );
}
