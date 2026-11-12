import { useEffect, type ReactNode } from 'react';
import { go, useRoute, useStore } from './lib/store';
import { Footer, Nav } from './components/Layout';
import { Toast } from './components/ui';
import { Landing } from './pages/Landing';
import { SignIn } from './pages/SignIn';
import { StudentHome } from './pages/StudentHome';
import { TutorHome } from './pages/TutorHome';
import { RequestHelp } from './pages/RequestHelp';
import { Matches } from './pages/Matches';
import { Sessions } from './pages/Sessions';
import { TutorProfile } from './pages/TutorProfile';
import { Profile } from './pages/Profile';
import { Ledger } from './pages/Ledger';
import { Admin } from './pages/Admin';
import type { Role } from './types';

/** Which roles may open each top-level route. Missing = public. */
const GUARDS: Record<string, Role[]> = {
  home: ['student', 'tutor'], request: ['student'], matches: ['student'], sessions: ['student', 'tutor'],
  profile: ['student', 'tutor'], admin: ['admin'],
};

export function App() {
  const { role, notice } = useStore();
  const [parts] = useRoute();
  const [page = '', sub = ''] = parts;
  const allowed = !GUARDS[page] || (role !== null && GUARDS[page].includes(role));

  useEffect(() => {
    if (!allowed) go(role ? (role === 'admin' ? 'admin' : 'home') : 'signin');
  }, [allowed, role]);

  let view: ReactNode = <Landing />;
  if (allowed) {
    if (page === 'signin') view = <SignIn />;
    else if (page === 'home') view = role === 'tutor' ? <TutorHome /> : <StudentHome />;
    else if (page === 'request') view = <RequestHelp />;
    else if (page === 'matches') view = <Matches />;
    else if (page === 'sessions') view = <Sessions />;
    else if (page === 'tutor' && sub) view = <TutorProfile id={sub} />;
    else if (page === 'profile') view = <Profile />;
    else if (page === 'ledger') view = <Ledger />;
    else if (page === 'admin') view = <Admin tab={sub} />;
  }

  return (
    <>
      <button className="skiplink" onClick={() => document.getElementById('main')?.focus()}>Skip to content</button>
      <Nav path={parts.join('/')} />
      <div id="main" tabIndex={-1}>{view}</div>
      <Footer />
      <Toast message={notice} />
    </>
  );
}
