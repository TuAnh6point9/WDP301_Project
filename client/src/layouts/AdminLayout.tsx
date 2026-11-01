import { messageText } from '@/i18n/messages';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon, type IconName } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { PageStatus } from '@/components/PageStatus';
import { MobileNavigationDrawer } from '@/components/MobileNavigationDrawer';
import { TransitionViewport, usePageReadiness } from '@/app/navigation/NavigationTransition';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';

// Grouped by the job people come here to do, named in plain words.
const sections: [TranslationKey, [string, IconName, TranslationKey][]][] = [
  ['admin.dailyWork', [['/admin', 'dashboard', 'common.dashboard'], ['/admin/import', 'upload', 'imports.title'], ['/admin/data', 'database', 'admin.reviewData']]],
  ['admin.manage', [['/admin/stations', 'pin', 'common.stations'], ['/admin/users', 'users', 'admin.accounts']]],
  ['admin.system', [['/admin/status', 'pulse', 'admin.systemHealth'], ['/admin/settings', 'sliders', 'common.settings']]],
];
const titles: Record<string, TranslationKey> = Object.fromEntries(sections.flatMap(([, items]) => items.map(([to, , label]) => [to, label])));
const COLLAPSED_KEY = 'wqi.admin.sidebar-collapsed';
function storedCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === 'true'; } catch { return false; }
}

function AccessDenied() {
  useLocale();
  usePageReadiness('error');
  return <main id="page-content" className="container page"><h1 className="h1">{messageText(M.ACCESS_DENIED_TITLE)}</h1><p className="sub">{messageText(M.ACCESS_DENIED)}</p><Link to="/" className="btn btn-secondary">{msg('common.backHome')}</Link></main>;
}

export function AdminLayout() {
  useLocale();
  const { user, signOut, status, error, pending, refreshSession, sessionEpoch } = useAuth();
  const [failure, setFailure] = useState('');
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  async function logout() {
    setFailure('');
    try { await signOut(); navigate('/', { replace: true, flushSync: true }); }
    catch (failure) { setFailure(userErrorMessage(failure, M.LOGOUT_FAILED)); }
  }
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, String(next)); } catch { /* Storage blocked: the choice lasts for this visit. */ }
  }
  if (status === 'loading' || status === 'error') return <div id="page-content"><TransitionViewport><PageStatus error={error} onRetry={() => void refreshSession()}/></TransitionViewport></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search }}/>;
  if (user.role !== 'admin') return <AccessDenied/>;
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  // In the icon rail the names stay in the page for screen readers and show as tooltips.
  const links = (rail: boolean) => <>
    {sections.map(([label, items]) => <div key={label} className="side-group" role="group" aria-label={msg(label)}>
      <div className="side-label" aria-hidden="true">{msg(label)}</div>
      {items.map(([to, icon, text]) => <NavLink key={to} to={to} end className="side-link" data-tip={rail ? msg(text) : undefined}><Icon name={icon}/><span className="side-text">{msg(text)}</span></NavLink>)}
    </div>)}
    <div className="side-grow"/><div className="side-sep"/>
    <NavLink to="/" className="side-link" data-tip={rail ? msg('admin.backPublic') : undefined}><Icon name="back"/><span className="side-text">{msg('admin.backPublic')}</span></NavLink>
    <button type="button" className="side-link" onClick={() => void logout()} disabled={pending} data-tip={rail ? msg('auth.logout') : undefined}><Icon name="logout"/><span className="side-text">{pending ? msg('auth.loggingOut') : msg('auth.logout')}</span></button>
  </>;
  return <div className={collapsed ? 'admin is-collapsed' : 'admin'}>
    <aside className="sidebar" id="admin-sidebar">
      <div className="side-top">
        <NavLink to="/admin" end className="side-brand" data-tip={collapsed ? msg('admin.systemAdmin') : undefined}><Brand small/><span className="side-text">{msg('admin.systemAdmin')}</span></NavLink>
        <button type="button" className="side-toggle" aria-controls="admin-sidebar" aria-expanded={!collapsed} aria-label={msg(collapsed ? 'admin.expandMenu' : 'admin.collapseMenu')} data-tip={collapsed ? msg('admin.expandMenu') : undefined} onClick={toggleSidebar}><Icon name={collapsed ? 'chevronsRight' : 'chevronsLeft'}/></button>
      </div>
      <nav className="side-nav" aria-label={msg('admin.menu')}>{links(collapsed)}</nav>
    </aside>
    <div className="admin-main">
      <header className="admin-top">
        <div className="admin-crumbs admin-desktop-title"><span>{msg('admin.systemAdmin')}</span><span aria-hidden="true">/</span><b>{msg(titles[pathname] ?? 'common.admin')}</b></div>
        <Link to="/admin" className="brand admin-mobile-brand"><Brand small/>{msg('admin.systemAdmin')}</Link>
        <div className="admin-account">
          <LanguageSwitcher/>
          <span className="admin-user"><span className="avatar">{initials}</span><span className="admin-user-text"><b>{user.name}</b><span className="xs muted">{user.email}</span></span></span>
        </div>
        <MobileNavigationDrawer><LanguageSwitcher/>{links(false)}</MobileNavigationDrawer>
      </header>
      {failure && <div className="admin-body callout callout-warn" role="alert">{messageText(failure)}</div>}
      <div id="page-content" tabIndex={-1}><TransitionViewport><Outlet key={`${user._id}:${sessionEpoch}`}/></TransitionViewport></div>
    </div>
  </div>;
}
