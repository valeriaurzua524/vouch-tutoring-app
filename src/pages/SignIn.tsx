import { useState } from 'react';
import { ChevronRight, GraduationCap, Info, Mail } from 'lucide-react';
import type { Role } from '../types';
import { go, useStore } from '../lib/store';
import { Avatar } from '../components/ui';

const ROLE_COPY: Record<Role, string> = {
  student: 'Ask for help, get matched, book and review sessions.',
  tutor: 'List your courses and hours, accept requests, build your record.',
  admin: 'Learning Center staff: match requests, resolve disputes, audit.',
};

export function SignIn() {
  const { users, userIds, signIn, toast } = useStore();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const enter = (role: Role, id?: string) => {
    signIn(role, id);
    const u = users.find(x => x.id === (id ?? userIds[role]))!;
    toast(`Welcome back, ${u.name.split(' ')[0]}!`);
    go(role === 'admin' ? 'admin' : 'home');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = users.find(x => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!email.trim()) return setError('Enter your campus email.');
    if (!/@cpp\.edu$/i.test(email.trim())) return setError('Use your @cpp.edu email address.');
    if (!u) return setError('No demo account uses that email. Try one of the demo accounts below.');
    enter(u.role, u.id);
  };

  return (
    <main className="signin">
      <div className="signincard">
        <div className="signinhead">
          <span className="brandmark big">v.</span>
          <h1>Welcome to <em>vouch.</em></h1>
          <p>Sign in with your campus account to get started.</p>
        </div>
        <button className="ssobtn" onClick={() => enter('student')}>
          <GraduationCap size={18} /> Continue with Cal Poly Pomona SSO
        </button>
        <div className="divider"><span>or use email</span></div>
        <form onSubmit={submit} noValidate>
          <label className="field">
            Campus email
            <span className="inputicon"><Mail size={16} /><input type="email" placeholder="you@cpp.edu" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby="email-err" /></span>
          </label>
          {error && <p className="fielderror" id="email-err">{error}</p>}
          <button className="primary full" type="submit">Sign in <ChevronRight size={17} /></button>
        </form>
        <div className="demonote"><Info size={15} /> Prototype: SSO is simulated and signs you in as the demo student.</div>
      </div>

      <div className="demoaccounts">
        <div className="kicker">DEMO ACCOUNTS</div>
        <h2>Try every side of <em>Vouch.</em></h2>
        <p>Switch roles any time from the menu in the top right.</p>
        {(['student', 'tutor', 'admin'] as Role[]).map(r => {
          const u = users.find(x => x.id === userIds[r])!;
          return (
            <button key={r} className="democard" onClick={() => enter(r)}>
              <Avatar user={u} size={46} />
              <span className="dc-text"><strong>{u.name}</strong><small>{u.email}</small><span>{ROLE_COPY[r]}</span></span>
              <span className={`rolepill role-${r}`}>{r}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
