import { messageText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Brand } from '@/components/Brand';
import { MobileNavigationDrawer } from '@/components/MobileNavigationDrawer';
import { TransitionViewport } from '@/app/navigation/NavigationTransition';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import type { TranslationKey } from '@/i18n';

const links = [
  ['/', 'common.home'],
  ['/map', 'common.map'],
  ['/historical-data', 'common.historicalData'],
  ['/calculate', 'common.calculate'],
  ['/history', 'common.history'],
] as const satisfies readonly (readonly [string, TranslationKey])[];

export function PublicLayout() {
  useLocale();
  const { user, signOut, pending, status } = useAuth();
  const [failure, setFailure] = useState('');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigationLinks = links.map(([to, label]) => to === '/calculate' && pathname.startsWith('/excel/')
    ? <Link key={to} to={to} className="active" aria-current="page">{msg(label)}</Link>
    : <NavLink key={to} to={to} end={to === '/'}>{msg(label)}</NavLink>);
  async function logout() {
    setFailure('');
    try { await signOut(); navigate('/', { replace: true, flushSync: true }); }
    catch (error) { setFailure(userErrorMessage(error, M.LOGOUT_FAILED)); }
  }
  const accountActions = <>
    {user?.role === 'admin' && <Link to="/admin" className="btn btn-ghost">{msg('common.admin')}</Link>}
    {user
      ? <button type="button" className="btn btn-secondary" onClick={() => void logout()} disabled={pending} title={user.email}>{pending ? msg('auth.loggingOut') : msg('auth.logout')}</button>
      : status === 'loading' ? <span className="session-placeholder small text-2">{msg('auth.checkingSession')}</span> : <Link to="/login" className="btn btn-primary">{msg('auth.login')}</Link>}
  </>;
  return <>
    <header className="topnav">
      <div className="container topnav-inner">
        <Link to="/" className="brand"><Brand/>WQI <span>An Kim Hai</span></Link>
        <nav className="nav" aria-label={msg('common.main')}>
          {navigationLinks}
        </nav>
        <div className="nav-actions">
          <LanguageSwitcher/>
          {accountActions}
        </div>
        <MobileNavigationDrawer>
          <LanguageSwitcher/>
          {navigationLinks}
          <div className="drawer-account">{accountActions}</div>
        </MobileNavigationDrawer>
      </div>
    </header>
    {failure && <div className="container callout callout-warn" role="alert">{messageText(failure)}</div>}
    <div id="page-content" tabIndex={-1}><TransitionViewport><Outlet/></TransitionViewport></div>
  </>;
}
