import { useState } from 'react';
import { ArrowRight, BadgeCheck, BookOpen, CalendarDays, ChevronRight, Lightbulb, MapPin, MessageSquareText, Sparkles, Video } from 'lucide-react';
import type { HelpRequest } from '../types';
import { DAY_NAMES } from '../data/seed';
import { fmtHour, fmtRange } from '../lib/format';
import { go, useStore } from '../lib/store';
import { Avatar, StatusPill } from '../components/ui';

export function StudentHome() {
  const { me, bookings, userById, setDraft } = useStore();
  const [quick, setQuick] = useState('');
  const mine = bookings.filter(b => b.studentId === me!.id);
  const upcoming = mine.filter(b => b.status === 'scheduled');
  const pending = mine.filter(b => b.status === 'requested' || b.status === 'open');
  const confirm = mine.filter(b => b.status === 'completed' && !b.studentConfirmed);
  const review = mine.filter(b => b.status === 'attested' && !b.reviewed && !b.disputed);
  const gaps = mine.filter(b => b.summary?.gaps.length && (b.status === 'attested' || b.status === 'completed'))
    .flatMap(b => b.summary!.gaps.map(g => ({ gap: g, course: b.course })));
  const next = upcoming[0];
  const nextTutor = next && userById(next.tutorId);

  const startFromGap = (gap: string, course: string) => {
    setDraft({ raw: `Still shaky on ${gap.toLowerCase()} for ${course}`, course, topic: gap, tags: [], day: 'Thu', start: 15, end: 17, mode: 'Either', urgency: 'This week', notes: '' } as HelpRequest);
    go('request');
  };

  return (
    <main className="section page">
      <div className="welcome">
        <div>
          <div className="kicker">GOOD TO SEE YOU</div>
          <h1 className="pagetitle">Hi {me!.name.split(' ')[0]}, <em>let’s keep going.</em></h1>
          <p className="pageintro">You’re enrolled in {me!.enrolled?.join(', ')}.</p>
        </div>
      </div>

      <form className="quickask" onSubmit={e => { e.preventDefault(); sessionStorage.setItem('vouch_quick', quick); go('request'); }}>
        <Sparkles size={20} />
        <input aria-label="Describe what you need help with" placeholder="What are you stuck on? e.g. “lost on BST deletion for CS 2400, free Thursday afternoon”" value={quick} onChange={e => setQuick(e.target.value)} />
        <button className="primary small" type="submit">Find help <ArrowRight size={15} /></button>
      </form>

      <div className="stats">
        <div className="stat"><span>Upcoming</span><strong>{upcoming.length}</strong><small>scheduled sessions</small></div>
        <div className="stat"><span>Waiting</span><strong>{pending.length}</strong><small>requests out to tutors</small></div>
        <div className={`stat ${confirm.length + review.length ? 'attn' : ''}`}><span>Your turn</span><strong>{confirm.length + review.length}</strong><small>to confirm or review</small></div>
        <div className="stat"><span>Completed</span><strong>{mine.filter(b => b.status === 'attested').length}</strong><small>attested sessions</small></div>
      </div>

      <div className="dashgrid">
        <div className="dashmain">
          <section className="panel">
            <div className="panelhead"><h2>Next session</h2><button className="textlink" onClick={() => go('sessions')}>All sessions <ChevronRight size={15} /></button></div>
            {next && nextTutor ? (
              <div className="nextsession">
                <div className="ns-date"><span>{next.day}</span><strong>{fmtHour(next.start)}</strong><small>{next.end - next.start} hr</small></div>
                <div className="ns-body">
                  <h3>{next.course} · {next.topic}</h3>
                  <p className="withicon"><Avatar user={nextTutor} size={24} /> with {nextTutor.name}</p>
                  <p className="withicon muted">{next.mode === 'Online' ? <Video size={15} /> : <MapPin size={15} />} {next.mode === 'Online' ? 'Zoom link shared by tutor' : 'University Library, 2nd floor'} · {DAY_NAMES[next.day]} {fmtRange(next.start, next.end)}</p>
                </div>
                <button className="outline small" onClick={() => go('sessions')}>Details</button>
              </div>
            ) : (
              <div className="emptyinline"><CalendarDays size={22} /> Nothing scheduled yet. <button className="textlink" onClick={() => go('request')}>Request a session <ChevronRight size={14} /></button></div>
            )}
          </section>

          <section className="panel">
            <div className="panelhead"><h2>Needs your attention</h2></div>
            {confirm.length + review.length === 0 && <div className="emptyinline"><BadgeCheck size={22} /> You’re all caught up.</div>}
            {confirm.map(b => (
              <div className="actionrow" key={b.id}>
                <span className="ar-icon"><BadgeCheck size={18} /></span>
                <div><strong>Confirm your {b.course} session with {userById(b.tutorId)?.name}</strong><small>Your tutor already confirmed. Once you do, the session is attested and you can review it.</small></div>
                <button className="primary small" onClick={() => go('sessions')}>Confirm</button>
              </div>
            ))}
            {review.map(b => (
              <div className="actionrow" key={b.id}>
                <span className="ar-icon"><MessageSquareText size={18} /></span>
                <div><strong>Review {userById(b.tutorId)?.name} for {b.course}</strong><small>Both of you confirmed this session. Your review is added to their permanent record.</small></div>
                <button className="primary small" onClick={() => go('sessions')}>Review</button>
              </div>
            ))}
          </section>

          {pending.length > 0 && (
            <section className="panel">
              <div className="panelhead"><h2>Open requests</h2></div>
              {pending.map(b => (
                <div className="actionrow" key={b.id}>
                  <span className="ar-icon muted"><BookOpen size={18} /></span>
                  <div><strong>{b.course} · {b.topic}</strong><small>{b.tutorId ? `Sent to ${userById(b.tutorId)?.name}` : 'With the Learning Center for manual matching'} · {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)}</small></div>
                  <StatusPill status={b.status} />
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="dashside">
          <section className="panel gaps">
            <div className="panelhead"><h2><Lightbulb size={18} /> Topics to revisit</h2></div>
            <p className="muted small">From your session summaries. These help us match you better next time.</p>
            {gaps.length === 0 && <p className="muted small">After your first session, gaps your tutor noticed show up here.</p>}
            {gaps.map(g => (
              <button key={g.gap} className="gapchip" onClick={() => startFromGap(g.gap, g.course)}>
                <span><strong>{g.gap}</strong><small>{g.course}</small></span><ArrowRight size={15} />
              </button>
            ))}
            <small className="advisory">AI-generated summaries are advisory and never part of the review ledger.</small>
          </section>
          <section className="panel tipcard">
            <h3>Midterm season tip</h3>
            <p>Tutors fill up fast in weeks 5–6. Requesting a 2-hour window instead of 1 hour usually gets you more matches.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
