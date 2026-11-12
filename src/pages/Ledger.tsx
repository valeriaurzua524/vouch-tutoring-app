import { useMemo, useState } from 'react';
import { Database, Hash, Link2, Lock, ShieldCheck } from 'lucide-react';
import type { LedgerType, VerifyResult } from '../types';
import { GENESIS, shortHash } from '../lib/ledger';
import { useStore } from '../lib/store';
import { LedgerBlock } from '../components/LedgerBlock';
import { PageHead, VerifyBanner, VerifyButton } from '../components/ui';

export function Ledger() {
  const { ledger, tutors, role, me } = useStore();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState<number | null>(null);
  const [type, setType] = useState<LedgerType | 'all'>('all');
  const [tutor, setTutor] = useState(role === 'tutor' ? me!.id : 'all');
  const shown = useMemo(() => ledger.filter(e => (type === 'all' || e.type === type) && (tutor === 'all' || e.tutorId === tutor)).slice().reverse(), [ledger, type, tutor]);
  const head = ledger[ledger.length - 1];

  return (
    <main className="section page">
      <PageHead kicker="TAMPER-EVIDENT BY DESIGN" title="The reputation" em="ledger."
        intro="Every attested session, review and dispute on campus, in order. Each entry stores the hash of the one before it, so editing or deleting any past entry breaks every link after it.">
        <VerifyButton chain={ledger} onResult={setResult} onStep={setChecking} />
      </PageHead>

      <div className="ledgerstats">
        <div><Database size={18} /><strong>{ledger.length}</strong><span>entries</span></div>
        <div><ShieldCheck size={18} /><strong>{ledger.filter(e => e.type === 'attestation').length}</strong><span>attested sessions</span></div>
        <div><Lock size={18} /><strong>{ledger.filter(e => e.type === 'review').length}</strong><span>reviews</span></div>
        <div className="headhash"><Hash size={18} /><span>Latest hash</span><code title={head?.hash}>{head ? shortHash(head.hash) : '—'}</code></div>
      </div>

      <VerifyBanner result={result} onClose={() => setResult(null)} />

      <div className="howchain">
        <div className="hc-step"><code>#{'n−1'}</code><span>hash = SHA-256(entry n−1)</span></div>
        <Link2 size={18} />
        <div className="hc-step"><code>#n</code><span>stores prev = hash(n−1), then its own hash</span></div>
        <Link2 size={18} />
        <div className="hc-step"><code>verify</code><span>re-hash every entry and compare. The first mismatch is reported.</span></div>
      </div>

      <div className="filters slim">
        <label><span>Type</span>
          <select value={type} onChange={e => setType(e.target.value as LedgerType | 'all')}>
            <option value="all">All entries</option><option value="attestation">Attestations</option><option value="review">Reviews</option><option value="dispute">Disputes</option><option value="resolution">Resolutions</option>
          </select>
        </label>
        <label><span>Tutor</span>
          <select value={tutor} onChange={e => setTutor(e.target.value)}>
            <option value="all">Everyone</option>{tutors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <span className="filtercount">Showing {shown.length} of {ledger.length}</span>
      </div>

      <div className="ledgerlist">
        {shown.map(e => (
          <LedgerBlock key={e.seq} e={e}
            state={checking === e.seq ? 'checking' : result && !result.ok && result.firstBreak !== undefined && e.seq >= result.firstBreak ? 'broken' : result?.ok ? 'ok' : undefined} />
        ))}
        {type === 'all' && tutor === 'all' && <div className="genesis"><code>{shortHash(GENESIS)}</code> Genesis · the chain starts here</div>}
      </div>
    </main>
  );
}
