import { BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, Link2, Lock, Search, ShieldCheck, Sparkles, Star, Users } from 'lucide-react';
import { go, useStore } from '../lib/store';
import { TutorCard } from '../components/TutorCard';
import { shortHash } from '../lib/ledger';

export function Landing() {
  const { tutors, ledger, ratings, role } = useStore();
  const start = role ? 'request' : 'signin';
  const sofia = tutors[0];
  const recent = ledger.filter(e => e.type === 'review').slice(-3);
  return (
    <>
      <section className="hero">
        <div className="heroinner">
          <div className="herotext">
            <div className="eyebrow"><span className="dot" /> MADE FOR STUDENTS, BY STUDENTS</div>
            <h1>Hard classes.<br /><em>Good company.</em></h1>
            <p>Find a peer tutor who already passed your exact course, is free when you are, and has reviews nobody can fake.</p>
            <div className="heroactions">
              <button className="primary" onClick={() => go(start)}>Find my tutor <ChevronRight size={19} /></button>
              <button className="secondary" onClick={() => go('signin')}>I want to tutor</button>
            </div>
            <div className="trust">
              <span className="avatars"><i>SM</i><i>DK</i><i>AP</i></span>
              <span>{tutors.length} peer tutors · {ledger.filter(e => e.type === 'review').length} verified reviews <span className="tinyheart">♥</span></span>
            </div>
          </div>
          <div className="heroart">
            <div className="floatinglabel"><Sparkles size={16} /> 92% match for CS 2400</div>
            <div className="featurecard">
              <div className="cardtop">
                <span className="miniavatar">SM</span>
                <div><strong>{sofia.name}</strong><small>CS 2400 · A with Prof. Lin</small></div>
                <span className="verified"><CheckCircle2 size={15} /> Verified</span>
              </div>
              <div className="featureline" />
              <div className="featuremeta">
                <span><Star size={15} fill="currentColor" /> {ratings[sofia.id]?.avg.toFixed(1)} · {ratings[sofia.id]?.count} reviews</span>
                <span><CalendarDays size={15} /> Free Thu 3–5 PM</span>
              </div>
              <div className="cardbottom"><span><Lock size={13} /> Every review is linked to a confirmed session</span><span>↗</span></div>
            </div>
            <div className="decoration deco1">✳</div>
            <div className="decoration deco2">✦</div>
          </div>
        </div>
      </section>

      <section className="how section" id="how">
        <div className="sectionhead">
          <div className="kicker">THE VOUCH WAY</div>
          <h2>Finding help should feel <em>easy.</em></h2>
          <p>Less scrolling through strangers, more learning from someone who sat in the same lecture hall.</p>
        </div>
        <div className="steps four">
          <article><span className="stepicon"><Search /></span><span className="stepnumber">01</span><h3>Say where you’re stuck</h3><p>Type it the way you’d text a friend. We turn it into a course, topics and a time.</p></article>
          <article><span className="stepicon"><Users /></span><span className="stepnumber">02</span><h3>See ranked matches</h3><p>Tutors who passed your course and are free when you are, with the reason they ranked where they did.</p></article>
          <article><span className="stepicon"><BadgeCheck /></span><span className="stepnumber">03</span><h3>Meet, then both confirm</h3><p>After the session, you and your tutor each confirm it happened. That unlocks the review.</p></article>
          <article><span className="stepicon"><ShieldCheck /></span><span className="stepnumber">04</span><h3>Leave a review that sticks</h3><p>Reviews go into a hash-linked record. Edit or delete one and verification catches it.</p></article>
        </div>
      </section>

      <section className="trustsection">
        <div className="section trustinner">
          <div>
            <div className="kicker">WHY THE NAME</div>
            <h2>Reviews you can <em>actually trust.</em></h2>
            <p>Every review on Vouch is tied to a session both people confirmed. Each record carries the fingerprint of the one before it, so changing an old review breaks the chain from that point on, and anyone can check.</p>
            <ul className="checklist">
              <li><CheckCircle2 size={18} /> No session, no review. Fake five-stars can’t pile up.</li>
              <li><CheckCircle2 size={18} /> Append-only. Reviews are never edited or quietly removed.</li>
              <li><CheckCircle2 size={18} /> One click to verify the whole record yourself.</li>
            </ul>
            <button className="primary" onClick={() => go('ledger')}>Explore the ledger <ChevronRight size={17} /></button>
          </div>
          <div className="minichain" aria-hidden="true">
            {recent.map((e, i) => (
              <div key={e.seq} className="minichain-item">
                <div className="mc-block">
                  <div className="mc-top"><span>#{e.seq}</span><span className="mc-stars">{'★'.repeat(Number(e.payload.rating))}</span></div>
                  <p>“{String(e.payload.comment)}”</p>
                  <div className="mc-hash"><span>prev {shortHash(e.prevHash)}</span><span>hash {shortHash(e.hash)}</span></div>
                </div>
                {i < recent.length - 1 && <div className="mc-link"><Link2 size={16} /></div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="featured section">
        <div className="featuredheading">
          <div><div className="kicker">MEET THE COMMUNITY</div><h2>Real students. <em>Real support.</em></h2></div>
          <button className="textlink" onClick={() => go(start)}>Get matched <ChevronRight size={17} /></button>
        </div>
        <div className="tutorgrid">{tutors.slice(0, 3).map(t => <TutorCard key={t.id} tutor={t} />)}</div>
      </section>

      <section className="cta">
        <div>
          <div className="kicker">YOU'VE GOT THIS</div>
          <h2>Your next aha! moment<br />is one request away.</h2>
          <p>Find someone who gets your class and your schedule.</p>
          <button className="primary light" onClick={() => go(start)}>Get tutoring help <ChevronRight size={18} /></button>
        </div>
        <span className="ctaflower">✳</span>
      </section>
    </>
  );
}
