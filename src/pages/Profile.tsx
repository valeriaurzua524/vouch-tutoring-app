import { useState } from 'react';
import { CalendarClock, GraduationCap, Plus, Save, Trash2, UserRound } from 'lucide-react';
import type { Coursework, Modality, User } from '../types';
import { COURSES, courseByCode } from '../data/seed';
import { useStore } from '../lib/store';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { Avatar, PageHead } from '../components/ui';

const GRADES = ['A', 'A-', 'B+', 'B', 'B-'];
const PREFS = ['Worked examples', 'Practice problems', 'Whiteboard', 'Concept first', 'Quiet space', 'Step-by-step'];

export function Profile() {
  const { me, role, updateUser, toast } = useStore();
  const [u, setU] = useState<User>(me!);
  const [dirty, setDirty] = useState(false);
  const isTutor = role === 'tutor';
  const edit = (patch: Partial<User>) => { setU(x => ({ ...x, ...patch })); setDirty(true); };
  const [newCw, setNewCw] = useState<Coursework>({ course: 'CS 3310', grade: 'A', professor: '', term: 'Spring 2026' });

  const allTopics = [...new Set((isTutor ? u.coursework?.map(c => c.course) : u.enrolled)?.flatMap(c => courseByCode(c)?.topics ?? []) ?? [])];
  const save = () => {
    if (isTutor && !u.coursework?.length) return toast('Add at least one completed course.');
    updateUser(u);
    setDirty(false);
    toast('Profile saved. Matches will use your new details.');
  };
  const addCourse = () => {
    if (u.coursework?.some(c => c.course === newCw.course)) return toast('That course is already on your list.');
    if (!newCw.professor.trim()) return toast('Add the professor’s name.');
    edit({ coursework: [...(u.coursework ?? []), { ...newCw, professor: newCw.professor.startsWith('Prof') ? newCw.professor : `Prof. ${newCw.professor}` }] });
    setNewCw({ ...newCw, professor: '' });
  };
  const hours = u.availability?.length ?? 0;

  return (
    <main className="section page">
      <PageHead kicker={isTutor ? 'WHAT YOU OFFER' : 'YOUR PROFILE'} title={isTutor ? 'Courses &' : 'About'} em={isTutor ? 'availability.' : 'you.'}
        intro={isTutor ? 'Matching ranks you on courses you’ve passed, the topics you cover and when you’re free. Keep these current.' : 'Your enrolled courses and free time make your matches better.'}>
        <button className="primary" onClick={save} disabled={!dirty}><Save size={16} /> {dirty ? 'Save changes' : 'Saved'}</button>
      </PageHead>

      <div className="profilegrid">
        <div>
          <section className="panel">
            <div className="panelhead"><h2><UserRound size={18} /> Basics</h2></div>
            <div className="basics">
              <Avatar user={u} size={64} />
              <div><strong>{u.name}</strong><small className="muted">{u.email}</small><small className="muted">{u.major}</small></div>
            </div>
            {isTutor && (
              <>
                <label className="field">Short bio
                  <textarea rows={3} maxLength={200} value={u.bio} onChange={e => edit({ bio: e.target.value })} />
                </label>
                <label className="field">I tutor
                  <div className="segmented">
                    {(['Online', 'In person', 'Both'] as Modality[]).map(m => <button type="button" key={m} className={u.modality === m ? 'on' : ''} onClick={() => edit({ modality: m })}>{m === 'Both' ? 'Online & in person' : m}</button>)}
                  </div>
                </label>
              </>
            )}
            {!isTutor && (
              <>
                <h4 className="subhead">Enrolled this term</h4>
                <div className="tags selectable">
                  {COURSES.map(c => {
                    const on = u.enrolled?.includes(c.code);
                    return <button key={c.code} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => edit({ enrolled: on ? u.enrolled!.filter(x => x !== c.code) : [...(u.enrolled ?? []), c.code] })}>{c.code}</button>;
                  })}
                </div>
                <h4 className="subhead">What helps you learn</h4>
                <div className="tags selectable">
                  {PREFS.map(p => {
                    const on = u.preferences?.includes(p);
                    return <button key={p} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => edit({ preferences: on ? u.preferences!.filter(x => x !== p) : [...(u.preferences ?? []), p] })}>{p}</button>;
                  })}
                </div>
              </>
            )}
          </section>

          {isTutor && (
            <section className="panel">
              <div className="panelhead"><h2><GraduationCap size={18} /> Completed coursework</h2></div>
              <table className="cwtable editable">
                <thead><tr><th>Course</th><th>Grade</th><th>Professor</th><th>Term</th><th /></tr></thead>
                <tbody>
                  {u.coursework?.map(c => (
                    <tr key={c.course}>
                      <td><strong>{c.course}</strong><small>{courseByCode(c.course)?.title}</small></td>
                      <td><span className="grade">{c.grade}</span></td><td>{c.professor}</td><td>{c.term}</td>
                      <td><button className="iconbtn" aria-label={`Remove ${c.course}`} onClick={() => edit({ coursework: u.coursework!.filter(x => x.course !== c.course), topics: u.topics?.filter(t => !courseByCode(c.course)?.topics.includes(t)) })}><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="addcw">
                <select aria-label="Course" value={newCw.course} onChange={e => setNewCw({ ...newCw, course: e.target.value })}>{COURSES.map(c => <option key={c.code}>{c.code}</option>)}</select>
                <select aria-label="Grade" value={newCw.grade} onChange={e => setNewCw({ ...newCw, grade: e.target.value })}>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
                <input aria-label="Professor" placeholder="Professor" value={newCw.professor} onChange={e => setNewCw({ ...newCw, professor: e.target.value })} />
                <input aria-label="Term" placeholder="Term" value={newCw.term} onChange={e => setNewCw({ ...newCw, term: e.target.value })} />
                <button className="outline small" onClick={addCourse}><Plus size={15} /> Add</button>
              </div>
              <p className="small muted">Grades are checked against your transcript by the Learning Center before your profile goes live.</p>
              <h4 className="subhead">Topics you can help with</h4>
              <div className="tags selectable">
                {allTopics.map(t => {
                  const on = u.topics?.includes(t);
                  return <button key={t} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => edit({ topics: on ? u.topics!.filter(x => x !== t) : [...(u.topics ?? []), t] })}>{t}</button>;
                })}
              </div>
            </section>
          )}
        </div>

        <div>
          <section className="panel sticky">
            <div className="panelhead"><h2><CalendarClock size={18} /> Weekly availability</h2><span className="hourcount">{hours} hr / week</span></div>
            <p className="small muted">Click or drag to mark when you’re free each week. Times are campus time (Pacific).</p>
            <AvailabilityGrid value={u.availability ?? []} onChange={availability => edit({ availability })} />
            <div className="gridactions">
              <button className="textlink" onClick={() => edit({ availability: [] })}>Clear all</button>
              <button className="textlink" onClick={() => edit({ availability: [...new Set([...(u.availability ?? []), ...['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].flatMap(d => [13, 14, 15, 16].map(h => `${d}-${h}`))])] })}>Add weekday afternoons</button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
