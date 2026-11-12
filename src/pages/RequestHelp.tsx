import { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, Clock3, Info, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { Day, HelpRequest } from '../types';
import { COURSES, courseByCode, DAY_NAMES, DAYS, HOURS } from '../data/seed';
import { parseRequest } from '../lib/intake';
import { fmtHour } from '../lib/format';
import { go, useStore } from '../lib/store';
import { PageHead } from '../components/ui';

const EXAMPLES = [
  'lost on dynamic programming for CS 3310, midterm thursday, prefer zoom',
  'need help with limiting reagent problems in chem, free monday afternoon',
  'BST deletion and recursion for data structures, thursday 3pm in person',
];

export function RequestHelp() {
  const { me, draft, setDraft, requestSession, toast } = useStore();
  const [raw, setRaw] = useState('');
  const [parsing, setParsing] = useState(false);
  const [detected, setDetected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState<HelpRequest>(() => draft ?? {
    raw: '', course: me?.enrolled?.[0] ?? 'CS 2400', topic: '', tags: [], day: 'Thu', start: 15, end: 17,
    mode: 'Either', urgency: 'This week', notes: '',
  });
  const course = courseByCode(form.course);
  const set = <K extends keyof HelpRequest>(k: K, v: HelpRequest[K]) => { setForm(f => ({ ...f, [k]: v })); setError(''); };

  const runParse = async (text: string) => {
    if (!text.trim()) return;
    setParsing(true);
    const { fields, detected } = await parseRequest(text, form.course);
    setForm(f => ({ ...f, ...fields, tags: fields.tags ?? (fields.course && fields.course !== f.course ? [] : f.tags) }));
    setDetected(detected);
    setParsing(false);
  };

  useEffect(() => {
    const q = sessionStorage.getItem('vouch_quick');
    if (q) { sessionStorage.removeItem('vouch_quick'); setRaw(q); runParse(q); }
    else if (draft?.raw) setRaw(draft.raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTag = (t: string) => set('tags', form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t]);
  const validate = () => {
    if (!form.topic.trim()) return 'Add a short description of what you need help with.';
    if (form.end <= form.start) return 'End time needs to be after start time.';
    return '';
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setDraft({ ...form, raw });
    go('matches');
  };

  const manual = () => {
    const v = validate();
    if (v) return setError(v);
    requestSession({ studentId: me!.id, tutorId: '', course: form.course, topic: form.topic, tags: form.tags, day: form.day, start: form.start, end: form.end, mode: form.mode, notes: form.notes });
    toast('Sent to the Learning Center. A coordinator will match you.');
    go('sessions');
  };

  return (
    <main className="section page narrow">
      <PageHead kicker="LET'S GET YOU UNSTUCK" title="Ask for a" em="little help." intro="Describe it in your own words and we’ll fill in the details, or fill them in yourself. You can edit everything before we match." />

      <section className="intake">
        <label htmlFor="raw" className="intake-label"><Sparkles size={17} /> Describe what you need</label>
        <textarea id="raw" rows={3} placeholder="e.g. lost on dynamic programming, midterm Thursday, I'm free after 3" value={raw} onChange={e => setRaw(e.target.value)} />
        <div className="intake-foot">
          <div className="examples">
            <span>Try:</span>
            {EXAMPLES.map(x => <button type="button" key={x} onClick={() => { setRaw(x); runParse(x); }}>{x.length > 38 ? x.slice(0, 36) + '…' : x}</button>)}
          </div>
          <button type="button" className="primary small" onClick={() => runParse(raw)} disabled={parsing || !raw.trim()}>
            {parsing ? <><Loader2 size={15} className="spin" /> Reading…</> : <><Wand2 size={15} /> Fill in details</>}
          </button>
        </div>
        {detected.length > 0 && !parsing && (
          <div className="detected" role="status">
            <Sparkles size={14} /> Filled in <strong>{detected.join(', ')}</strong>. Check below and adjust anything that’s off.
          </div>
        )}
      </section>

      <form className="formcard" onSubmit={submit} noValidate>
        <div className="formheading">
          <span className="formicon"><BookOpen /></span>
          <div><h2>Request details</h2><p>These fields are what the matching score uses.</p></div>
        </div>
        <div className="formgrid">
          <label className={detected.includes('course') ? 'filled' : ''}>Course
            <select value={form.course} onChange={e => { set('course', e.target.value); set('tags', []); }}>
              {COURSES.map(c => <option key={c.code} value={c.code}>{c.code} · {c.title}</option>)}
            </select>
          </label>
          <label className={detected.includes('urgency') ? 'filled' : ''}>How soon?
            <select value={form.urgency} onChange={e => set('urgency', e.target.value as HelpRequest['urgency'])}>
              <option>This week</option><option>Before an exam</option><option>No rush</option>
            </select>
          </label>
        </div>
        <label>What do you need help with?
          <input maxLength={100} placeholder="e.g. Deleting a node from a binary search tree" value={form.topic} onChange={e => set('topic', e.target.value)} aria-invalid={!!error && !form.topic.trim()} />
        </label>
        <fieldset className={`tagpicker ${detected.includes('topics') ? 'filled' : ''}`}>
          <legend>Topics <small>(pick any that apply, used for topic overlap)</small></legend>
          <div className="tags selectable">
            {course?.topics.map(t => (
              <button type="button" key={t} className={form.tags.includes(t) ? 'on' : ''} aria-pressed={form.tags.includes(t)} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
        </fieldset>
        <div className="formgrid three">
          <label className={detected.includes('day') ? 'filled' : ''}>Day
            <select value={form.day} onChange={e => set('day', e.target.value as Day)}>{DAYS.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</select>
          </label>
          <label className={detected.includes('time') ? 'filled' : ''}>From
            <select value={form.start} onChange={e => set('start', Number(e.target.value))}>{HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}</select>
          </label>
          <label className={detected.includes('time') ? 'filled' : ''}>Until
            <select value={form.end} onChange={e => set('end', Number(e.target.value))}>{[...HOURS.slice(1), 22].map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}</select>
          </label>
        </div>
        <label className={detected.includes('format') ? 'filled' : ''}>Session format
          <div className="segmented" role="radiogroup">
            {(['Either', 'Online', 'In person'] as const).map(m => (
              <button type="button" key={m} role="radio" aria-checked={form.mode === m} className={form.mode === m ? 'on' : ''} onClick={() => set('mode', m)}>{m}</button>
            ))}
          </div>
        </label>
        <label>Anything else your tutor should know? <small className="optional">Optional</small>
          <textarea rows={3} placeholder="e.g. I have the practice exam and want to go through problems 4–7" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </label>
        {error && <p className="fielderror" role="alert">{error}</p>}
        <div className="formfooter">
          <button type="button" className="textlink" onClick={manual}>Rather have the Learning Center pick for me?</button>
          <button className="primary" type="submit">See my matches <ChevronRight size={18} /></button>
        </div>
        <p className="formnote"><Clock3 size={14} /> Times are in campus time (Pacific). <Info size={14} /> No personal data leaves this demo.</p>
      </form>
    </main>
  );
}
