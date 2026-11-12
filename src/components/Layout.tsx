import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GraduationCap, LogOut, Menu, RotateCcw, X } from 'lucide-react';
import type { Role } from '../types';
import { go, useStore } from '../lib/store';
import { Avatar } from './ui';

const LINKS: Record<Role | 'guest', [string, string][]> = {
  guest: [['', 'How it works'], ['ledger', 'Reputation ledger']],
  student: [['home', 'Home'], ['request', 'Get help'], ['sessions', 'My sessions'], ['ledger', 'Ledger'], ['profile', 'Profile']],
  tutor: [['home', 'Home'], ['sessions', 'Sessions'], ['profile', 'Availability & courses'], ['ledger', 'My record']],
  admin: [['admin', 'Audit'], ['admin/queue', 'Match queue'], ['admin/disputes', 'Disputes'], ['ledger', 'Ledger']],
};

export function Nav({ path }: { path: string }) {
  const { role, me, bookings, signIn, signOut, resetDemo, toast, users, userIds } = useStore();
  const [mobile, setMobile] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const links = LINKS[role ?? 'guest'];
  const pending = me ? bookings.filter(b =>
    (role === 'student' && b.studentId === me.id && ((b.status === 'completed' && !b.studentConfirmed) || (b.status === 'attested' && !b.reviewed && !b.disputed))) ||
    (role === 'tutor' && b.tutorId === me.id && (b.status === 'requested' || (b.status === 'completed' && !b.tutorConfirmed)))).length : 0;
  const nav = (to: string) => { go(to); setMobile(false); };
  const isActive = (to: string) => (to === '' ? path === '' : path === to || (to !== 'admin' && path.startsWith(to + '/')));
  const switchTo = (r: Role) => {
    signIn(r);
    setMenu(false);
    const u = users.find(x => x.id === userIds[r]);
    toast(`Now viewing as ${u?.name} (${r})`);
    go(r === 'admin' ? 'admin' : 'home');
  };

  return (
    <header className="nav">
      <div className="navinner">
        <button className="brand" onClick={() => nav(role ? (role === 'admin' ? 'admin' : 'home') : '')} aria-label="Vouch home">
          <span className="brandmark">v.</span><span>vouch<span className="branddot">.</span></span>
        </button>
        <nav className={mobile ? 'navlinks open' : 'navlinks'} aria-label="Main">
          {links.map(([to, label]) => (
            <button key={to} onClick={() => nav(to)} className={isActive(to) ? 'active' : ''}>
              {label}
              {to === 'sessions' && pending > 0 && <span className="badge" aria-label={`${pending} need attention`}>{pending}</span>}
            </button>
          ))}
          {!role && <button className="mobileonly" onClick={() => nav('signin')}>Sign in</button>}
        </nav>
        <div className="navright">
          <span className="campus"><GraduationCap size={15} /> Cal Poly Pomona</span>
          {!role && (
            <>
              <button className="textbtn" onClick={() => nav('signin')}>Sign in</button>
              <button className="primary small" onClick={() => nav('signin')}>Get started <ChevronRight size={15} /></button>
            </>
          )}
          {role && me && (
            <div className="usermenu" ref={menuRef}>
              <button className="userbtn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu">
                <Avatar user={me} size={34} />
                <span className="userbtn-text"><strong>{me.name.split(' ').find(w => !w.endsWith('.'))}</strong><small>{role}</small></span>
                <ChevronDown size={15} />
              </button>
              {menu && (
                <div className="dropdown" role="menu">
                  <div className="dd-label">Demo: view the app as</div>
                  {(['student', 'tutor', 'admin'] as Role[]).map(r => {
                    const u = users.find(x => x.id === userIds[r])!;
                    return (
                      <button key={r} role="menuitem" className={r === role ? 'current' : ''} onClick={() => switchTo(r)}>
                        <Avatar user={u} size={28} /><span><strong>{u.name}</strong><small>{r}</small></span>
                      </button>
                    );
                  })}
                  <hr />
                  <button role="menuitem" onClick={async () => { await resetDemo(); setMenu(false); toast('Demo data reset'); }}><RotateCcw size={15} /> Reset demo data</button>
                  <button role="menuitem" onClick={() => { signOut(); setMenu(false); go(''); }}><LogOut size={15} /> Sign out</button>
                </div>
              )}
            </div>
          )}
          <button className="mobilemenu" aria-label="Toggle menu" onClick={() => setMobile(!mobile)}>{mobile ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="footerinner">
        <div className="brand footbrand"><span className="brandmark">v.</span><span>vouch<span className="branddot">.</span></span></div>
        <span>Peer tutoring with a reputation record you can audit.</span>
        <small>CS 4800 · Fall 2026 · Educational prototype · Sample data only</small>
      </div>
    </footer>
  );
}
