import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon, type IconName } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { PageStatus } from '@/components/PageStatus';
import { MobileNavigationDrawer } from '@/components/MobileNavigationDrawer';
import { TransitionViewport, usePageReadiness } from '@/app/navigation/NavigationTransition';

const sections: [string, [string, IconName, string][]][] = [
  ['Overview', [['/admin', 'dashboard', 'Dashboard'], ['/admin/import', 'upload', 'Import Excel Data']]],
  ['Data', [['/admin/data', 'database', 'Data Records'], ['/admin/stations', 'pin', 'Stations']]],
  ['System', [['/admin/users', 'users', 'Users'], ['/admin/status', 'pulse', 'System Status'], ['/admin/settings', 'sliders', 'Settings']]],
];
const titles = Object.fromEntries(sections.flatMap(([, items]) => items.map(([to, , label]) => [to, label])));
function AccessDenied() {
  usePageReadiness('error');
  return <main id="page-content" className="container page"><h1 className="h1">{M.ACCESS_DENIED_TITLE}</h1><p className="sub">{M.ACCESS_DENIED}</p><Link to="/" className="btn btn-secondary">Back to Home</Link></main>;
}

export function AdminLayout() {
  const { user, signOut, status, error, pending, refreshSession, sessionEpoch } = useAuth();
  const [failure, setFailure] = useState('');
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  async function logout() {
    setFailure('');
    try { await signOut(); navigate('/', { replace: true, flushSync: true }); }
    catch (failure) { setFailure(userErrorMessage(failure, M.LOGOUT_FAILED)); }
  }
  if (status === 'loading' || status === 'error') return <div id="page-content"><TransitionViewport><PageStatus error={error} onRetry={() => void refreshSession()}/></TransitionViewport></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search }}/>;
  if (user.role !== 'admin') return <AccessDenied/>;
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const navigation = <>{sections.map(([label, items]) => <div key={label} style={{ display: 'contents' }}>
    <div className="side-label">{label}</div>
    {items.map(([to, icon, text]) => <NavLink key={to} to={to} end className="side-link"><Icon name={icon}/>{text}</NavLink>)}
  </div>)}<div className="side-grow"/><div className="side-sep"/>
    <NavLink to="/" className="side-link"><Icon name="back"/>Back to Public Site</NavLink>
    <button type="button" className="side-link" onClick={() => void logout()} disabled={pending}><Icon name="logout"/>{pending ? 'Logging out…' : 'Log Out'}</button>
  </>;
  return <div className="admin">
    <aside className="sidebar">
      <NavLink to="/admin" className="side-brand"><Brand small/>System Admin</NavLink>
      {navigation}
    </aside>
    <div className="admin-main">
      <header className="admin-top">
        <span className="h3 admin-desktop-title" style={{ fontSize: 18 }}>{titles[pathname] || 'Admin'}</span>
        <Link to="/admin" className="brand admin-mobile-brand"><Brand small/>System Admin</Link>
        <div className="row" style={{ gap: 12 }}>
          <span className="small text-2 hide-sm">{user.email}</span>
          <span className="avatar">{initials}</span>
        </div>
        <MobileNavigationDrawer>{navigation}</MobileNavigationDrawer>
      </header>
      {failure && <div className="admin-body callout callout-warn" role="alert">{failure}</div>}
      <div id="page-content" tabIndex={-1}><TransitionViewport><Outlet key={`${user._id}:${sessionEpoch}`}/></TransitionViewport></div>
    </div>
  </div>;
}
