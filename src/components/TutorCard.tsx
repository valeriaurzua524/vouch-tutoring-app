import { ChevronRight, Clock3, ShieldCheck, Star } from 'lucide-react';
import type { User } from '../types';
import { go, useStore } from '../lib/store';
import { Avatar } from './ui';

export function TutorCard({ tutor: t }: { tutor: User }) {
  const { ratings } = useStore();
  const r = ratings[t.id];
  const days = [...new Set((t.availability ?? []).map(k => k.split('-')[0]))];
  return (
    <article className="tutorcard">
      <div className="tutorcardtop">
        <Avatar user={t} size={60} />
        <span className="verifiedtag"><ShieldCheck size={13} /> Transcript verified</span>
      </div>
      <h3>{t.name}</h3>
      <p className="major">{t.major}</p>
      <div className="rating">
        <Star size={15} fill="currentColor" />
        <strong>{r ? r.avg.toFixed(1) : 'New'}</strong>
        <span>· {r?.count ?? 0} verified reviews</span>
      </div>
      <div className="tags">{t.coursework?.map(c => <span key={c.course}>{c.course} · {c.grade}</span>)}</div>
      <p className="bio">{t.bio}</p>
      <div className="cardfoot">
        <span><Clock3 size={15} /> {days.slice(0, 3).join(', ')}{days.length > 3 ? ' +' : ''}</span>
        <button onClick={() => go(`tutor/${t.id}`)}>View profile <ChevronRight size={16} /></button>
      </div>
    </article>
  );
}
