import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Brand } from '@/components/Brand';
import { MobileNavigationDrawer } from '@/components/MobileNavigationDrawer';
import { TransitionViewport } from '@/app/navigation/NavigationTransition';

const links = [
  ['/', 'Home'],
  ['/map', 'Map'],
  ['/historical-data', 'Historical Data'],
  ['/calculate', 'Calculate WQI'],
  ['/history', 'History'],
] as const;

export function PublicLayout() {
  const { user, signOut, pending, status } = useAuth();
  const [failure, setFailure] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigationLinks = links.map(([to, label]) => to === '/calculate' && pathname.startsWith('/excel/')
    ? <Link key={to} to={to} className="active" aria-current="page">{label}</Link>
    : <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>);
  async function logout() {
    setFailure('');
    try { await signOut(); navigate('/', { replace: true, flushSync: true }); }
    catch (error) { setFailure(userErrorMessage(error, M.LOGOUT_FAILED)); }
  }
  const accountActions = <>
    {user?.role === 'admin' && <Link to="/admin" className="btn btn-ghost">Admin</Link>}
    {user
      ? <button type="button" className="btn btn-secondary" onClick={() => void logout()} disabled={pending} title={user.email}>{pending ? 'Logging out…' : 'Log Out'}</button>
      : status === 'loading' ? <span className="session-placeholder small text-2">Checking session…</span> : <Link to="/login" className="btn btn-primary">Log In</Link>}
  </>;
  return <>
    <header className="topnav">
      <div className="container topnav-inner">
        <Link to="/" className="brand"><Brand/>WQI <span>An Kim Hai</span></Link>
        <nav className="nav" aria-label="Main">
          {navigationLinks}
        </nav>
        <div className="nav-actions">
          {accountActions}
        </div>
        <MobileNavigationDrawer>
          {navigationLinks}
          <div className="drawer-account">{accountActions}</div>
        </MobileNavigationDrawer>
      </div>
    </header>
    {failure && <div className="container callout callout-warn" role="alert">{failure}</div>}
    <div id="page-content" tabIndex={-1}><TransitionViewport><Outlet/></TransitionViewport></div>
  </>;
}
