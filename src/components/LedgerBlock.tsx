import { AlertTriangle, BadgeCheck, Gavel, Link2, MessageSquareText, Star } from 'lucide-react';
import type { LedgerEntry } from '../types';
import { shortHash } from '../lib/ledger';
import { fmtDate } from '../lib/format';
import { useStore } from '../lib/store';

const ICON = { attestation: BadgeCheck, review: MessageSquareText, dispute: AlertTriangle, resolution: Gavel };
const LABEL = { attestation: 'Session attested', review: 'Review', dispute: 'Dispute filed', resolution: 'Dispute resolved' };

export function LedgerBlock({ e, state, showTutor = true }: { e: LedgerEntry; state?: 'checking' | 'broken' | 'ok'; showTutor?: boolean }) {
  const { userById } = useStore();
  const Icon = ICON[e.type];
  const tutor = userById(e.tutorId);
  const p = e.payload;
  return (
    <article className={`ledgerblock type-${e.type} ${state ?? ''}`}>
      <div className="lb-seq">#{e.seq}</div>
      <div className="lb-body">
        <div className="lb-head">
          <span className={`lb-type t-${e.type}`}><Icon size={14} /> {LABEL[e.type]}</span>
          {showTutor && tutor && <span className="lb-tutor">{tutor.name}</span>}
          <span className="lb-date">{fmtDate(e.ts)}</span>
        </div>
        <div className="lb-content">
          {e.type === 'review' && (
            <>
              <span className="lb-stars">{Array.from({ length: Number(p.rating) }, (_, i) => <Star key={i} size={13} fill="currentColor" />)}</span>
              <span>“{String(p.comment)}”</span>
              <small>{String(p.reviewer)} · {String(p.course)}</small>
            </>
          )}
          {e.type === 'attestation' && <span>{String(p.course)} session confirmed by student and tutor · {String(p.durationMin)} min</span>}
          {e.type === 'dispute' && <span>{String(p.reason)} · filed by {String(p.filedBy)}</span>}
          {e.type === 'resolution' && <span>{String(p.outcome)}</span>}
        </div>
        <div className="lb-hashes">
          <span title={e.prevHash}><Link2 size={12} /> prev {shortHash(e.prevHash)}</span>
          <span title={e.hash}>hash {shortHash(e.hash)}</span>
        </div>
      </div>
    </article>
  );
}
