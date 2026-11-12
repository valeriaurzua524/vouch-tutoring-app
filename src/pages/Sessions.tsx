import { useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarDays, Check, ChevronDown, Flag, Inbox, Lock, MapPin, MessageSquareText, Plus, Sparkles, Video, X } from 'lucide-react';
import type { Booking } from '../types';
import { DAY_NAMES } from '../data/seed';
import { fmtHour, fmtRange, pct, timeAgo } from '../lib/format';
import { go, useStore } from '../lib/store';
import { Avatar, Empty, Lifecycle, Modal, PageHead, StarInput, StatusPill } from '../components/ui';

type Tab = 'action' | 'upcoming' | 'requests' | 'past';

export function Sessions() {
  const { me, role, bookings } = useStore();
  const isTutor = role === 'tutor';
  const mine = bookings.filter(b => (isTutor ? b.tutorId === me!.id : b.studentId === me!.id));
  const myConfirm = (b: Booking) => (isTutor ? b.tutorConfirmed : b.studentConfirmed);
  const groups: Record<Tab, Booking[]> = {
    action: mine.filter(b =>
      (b.status === 'completed' && !myConfirm(b)) ||
      (!isTutor && b.status === 'attested' && !b.reviewed && !b.disputed) ||
      (isTutor && b.status === 'requested')),
    upcoming: mine.filter(b => b.status === 'scheduled'),
    requests: mine.filter(b => ['open', 'requested'].includes(b.status) || (b.status === 'completed' && myConfirm(b))),
    past: mine.filter(b => ['attested', 'declined', 'cancelled'].includes(b.status)),
  };
  const [tab, setTab] = useState<Tab>(groups.action.length ? 'action' : 'upcoming');
  const tabs: [Tab, string][] = [['action', 'Needs you'], ['upcoming', 'Upcoming'], ['requests', isTutor ? 'Waiting on student' : 'Pending'], ['past', 'Past']];

  return (
    <main className="section page narrow">
      <PageHead kicker={isTutor ? 'YOUR TUTORING' : 'YOUR LEARNING JOURNEY'} title={isTutor ? 'Your' : 'My'} em="sessions."
        intro={isTutor ? 'Accept requests, confirm sessions after they happen, and watch your record grow.' : 'Every session moves from request to review. Both of you confirm it happened before a review can be written.'}>
        {!isTutor && <button className="primary small" onClick={() => go('request')}><Plus size={15} /> New request</button>}
      </PageHead>

      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}<span className={`count ${k === 'action' && groups.action.length ? 'hot' : ''}`}>{groups[k].length}</span>
          </button>
        ))}
      </div>

      {groups[tab].length === 0 ? (
        <Empty icon={<Inbox size={36} />} title={tab === 'action' ? 'You’re all caught up' : 'Nothing here yet'}>
          <p>{tab === 'upcoming' ? 'Accepted sessions will show up here.' : tab === 'action' ? 'Nothing needs your attention right now.' : 'Sessions will move here as they progress.'}</p>
          {!isTutor && <button className="primary" onClick={() => go('request')}>Request a session</button>}
        </Empty>
      ) : (
        <div className="sessionlist">{groups[tab].map(b => <SessionCard key={b.id} b={b} />)}</div>
      )}
    </main>
  );
}

function SessionCard({ b }: { b: Booking }) {
  const { role, userById, respond, cancel, confirmSession, toast } = useStore();
  const [review, setReview] = useState(false);
  const [dispute, setDispute] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isTutor = role === 'tutor';
  const other = userById(isTutor ? b.studentId : b.tutorId);
  const iConfirmed = isTutor ? b.tutorConfirmed : b.studentConfirmed;
  const theyConfirmed = isTutor ? b.studentConfirmed : b.tutorConfirmed;

  const confirm = async () => {
    await confirmSession(b.id);
    toast(theyConfirmed ? 'Both confirmed! The session is attested on the ledger.' : `Confirmed. Waiting for ${other?.name.split(' ')[0]} to confirm.`);
  };

  return (
    <article className={`sessioncard status-${b.status}`}>
      <div className="sc-top">
        <div className="sc-when"><span>{b.day}</span><strong>{fmtHour(b.start)}</strong></div>
        <div className="sc-info">
          <div className="sc-titlerow"><StatusPill status={b.status} />{b.disputed && <span className="pill pill-dispute"><Flag size={11} /> Disputed</span>}<small className="muted">#{b.id} · {timeAgo(b.createdAt)}</small></div>
          <h3>{b.course} · {b.topic}</h3>
          <div className="sc-meta">
            {other ? <span className="withicon"><Avatar user={other} size={22} /> {isTutor ? 'Student: ' : ''}{other.name}</span> : <span className="muted">Learning Center is finding a tutor</span>}
            <span className="withicon"><CalendarDays size={14} /> {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)}</span>
            <span className="withicon">{b.mode === 'Online' ? <Video size={14} /> : <MapPin size={14} />} {b.mode}</span>
            {b.matchScore !== undefined && <span className="withicon"><Sparkles size={14} /> {pct(b.matchScore)} match</span>}
          </div>
        </div>
      </div>

      <Lifecycle b={b} />

      {b.notes && <p className="sc-notes">“{b.notes}”</p>}

      {b.status === 'completed' && (
        <div className="attest">
          <div className={`att ${b.studentConfirmed ? 'yes' : ''}`}>{b.studentConfirmed ? <Check size={14} /> : <span className="hollow" />} Student confirmed</div>
          <div className={`att ${b.tutorConfirmed ? 'yes' : ''}`}>{b.tutorConfirmed ? <Check size={14} /> : <span className="hollow" />} Tutor confirmed</div>
          <small>A review can only be written once both sides confirm.</small>
        </div>
      )}

      {b.summary && (b.status === 'attested' || b.status === 'completed') && (
        <div className="summary">
          <button className="summarytoggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            <Sparkles size={15} /> Session summary <small>AI · advisory</small><ChevronDown size={15} className={expanded ? 'flip' : ''} />
          </button>
          {expanded && (
            <div className="summarybody">
              <div><h4>Covered</h4><ul>{b.summary.covered.map(x => <li key={x}>{x}</li>)}</ul></div>
              <div><h4>Still to work on</h4><ul>{b.summary.gaps.map(x => <li key={x}>{x}</li>)}</ul></div>
              <small>Summaries are stored separately and never included in ledger hashes.</small>
            </div>
          )}
        </div>
      )}

      <div className="sc-actions">
        {isTutor && b.status === 'requested' && (
          <>
            <button className="outline small danger" onClick={() => { respond(b.id, false); toast('Request declined. The student can pick another tutor.'); }}><X size={14} /> Decline</button>
            <button className="primary small" onClick={() => { respond(b.id, true); toast(`Accepted! ${other?.name.split(' ')[0]} has been notified.`); }}><Check size={14} /> Accept</button>
          </>
        )}
        {!isTutor && (b.status === 'requested' || b.status === 'open') && (
          <button className="outline small danger" onClick={() => { cancel(b.id); toast('Request cancelled.'); }}>Cancel request</button>
        )}
        {(b.status === 'scheduled' || (b.status === 'completed' && !iConfirmed)) && (
          <>
            {b.status === 'scheduled' && <span className="hint">After you meet, confirm it happened.</span>}
            <button className="primary small" onClick={confirm}><BadgeCheck size={15} /> Confirm session happened</button>
          </>
        )}
        {b.status === 'completed' && iConfirmed && <span className="hint">Waiting for {other?.name.split(' ')[0]} to confirm. <em className="demohint">Demo: switch role in the top-right menu.</em></span>}
        {!isTutor && b.status === 'attested' && !b.reviewed && !b.disputed && (
          <button className="primary small" onClick={() => setReview(true)}><MessageSquareText size={15} /> Leave a review</button>
        )}
        {b.status === 'attested' && b.reviewed && <span className="hint ok"><Lock size={14} /> Review recorded on the ledger</span>}
        {(b.status === 'completed' || b.status === 'attested') && !b.disputed && (
          <button className="textlink subtle" onClick={() => setDispute(true)}><AlertTriangle size={14} /> Report a problem</button>
        )}
      </div>

      {review && <ReviewModal b={b} onClose={() => setReview(false)} />}
      {dispute && <DisputeModal b={b} onClose={() => setDispute(false)} />}
    </article>
  );
}

const PRAISE = ['Explained clearly', 'Patient', 'Well prepared', 'On time', 'Knew the professor’s style', 'Good examples'];

function ReviewModal({ b, onClose }: { b: Booking; onClose: () => void }) {
  const { userById, submitReview, toast } = useStore();
  const tutor = userById(b.tutorId)!;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    if (!rating) return setErr('Choose a star rating.');
    if (comment.trim().length < 10) return setErr('Write at least a sentence so other students know what helped.');
    setBusy(true);
    await submitReview(b.id, rating, comment.trim(), tags);
    toast('Review added to the ledger. Thanks for vouching!');
    onClose();
  };
  return (
    <Modal title="Leave a review" onClose={onClose}>
      <div className="bookhead"><Avatar user={tutor} size={52} /><div><div className="kicker">ATTESTED SESSION · {b.course}</div><h2>How was {tutor.name.split(' ')[0]}?</h2></div></div>
      <StarInput value={rating} onChange={n => { setRating(n); setErr(''); }} />
      <div className="tags selectable">
        {PRAISE.map(p => <button key={p} type="button" className={tags.includes(p) ? 'on' : ''} aria-pressed={tags.includes(p)} onClick={() => setTags(tags.includes(p) ? tags.filter(x => x !== p) : [...tags, p])}>{p}</button>)}
      </div>
      <label className="field">What helped most?
        <textarea rows={4} maxLength={280} value={comment} onChange={e => { setComment(e.target.value); setErr(''); }} placeholder="e.g. Drew out every case of BST deletion and had me trace it myself." />
        <small className="counter">{comment.length}/280</small>
      </label>
      {err && <p className="fielderror" role="alert">{err}</p>}
      <div className="lockednote"><Lock size={16} /><span><strong>Reviews are permanent.</strong> Yours is appended to a hash-linked record and can’t be edited later, by you or anyone else.</span></div>
      <button className="primary full" onClick={send} disabled={busy}>{busy ? 'Writing to ledger…' : 'Submit review'}</button>
    </Modal>
  );
}

const REASONS = ['Tutor didn’t show up', 'Student didn’t show up', 'Session was shorter than booked', 'Academic integrity concern', 'Something else'];

function DisputeModal({ b, onClose }: { b: Booking; onClose: () => void }) {
  const { fileDispute, toast } = useStore();
  const [reason, setReason] = useState(REASONS[2]);
  const [details, setDetails] = useState('');
  const [err, setErr] = useState('');
  const send = async () => {
    if (details.trim().length < 15) return setErr('Please describe what happened in a sentence or two.');
    await fileDispute(b.id, reason, details.trim());
    toast('Report filed. The Learning Center will follow up.');
    onClose();
  };
  return (
    <Modal title="Report a problem" onClose={onClose}>
      <div className="kicker">SESSION #{b.id} · {b.course}</div>
      <h2>Report a problem</h2>
      <p className="muted">Learning Center staff review every report. The fact that a dispute was filed, and its outcome, are recorded on the ledger. Your written details stay private to staff.</p>
      <fieldset className="radiolist">
        <legend>What went wrong?</legend>
        {REASONS.map(r => <label key={r} className={reason === r ? 'on' : ''}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>)}
      </fieldset>
      <label className="field">Details
        <textarea rows={4} value={details} onChange={e => { setDetails(e.target.value); setErr(''); }} placeholder="What happened, and when?" />
      </label>
      {err && <p className="fielderror" role="alert">{err}</p>}
      <button className="primary full" onClick={send}><Flag size={15} /> File report</button>
    </Modal>
  );
}
