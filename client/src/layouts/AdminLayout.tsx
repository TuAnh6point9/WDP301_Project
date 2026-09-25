import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon, type IconName } from '@/components/Icon';
import { Brand } from '@/components/Brand';

const sections: [string, [string, IconName, string][]][] = [
  ['Overview', [['/admin', 'dashboard', 'Dashboard'], ['/admin/import', 'upload', 'Import Excel Data']]],
  ['Data', [['/admin/data', 'database', 'Data Records'], ['/admin/stations', 'pin', 'Stations']]],
  ['System', [['/admin/users', 'users', 'Users'], ['/admin/status', 'pulse', 'System Status'], ['/admin/settings', 'sliders', 'Settings']]],
];
const titles = Object.fromEntries(sections.flatMap(([, items]) => items.map(([to, , label]) => [to, label])));

export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Client-side guard for the demo only; real access control must be enforced by the server.
  if (user?.role !== 'admin') return <Navigate to="/login" replace state={{ from: pathname }}/>;
  return <div className="admin">
    <aside className="sidebar">
      <NavLink to="/admin" className="side-brand"><Brand small/>System Admin</NavLink>
      {sections.map(([label, items]) => <div key={label} style={{ display: 'contents' }}>
        <div className="side-label">{label}</div>
        {items.map(([to, icon, text]) => <NavLink key={to} to={to} end className="side-link"><Icon name={icon}/>{text}</NavLink>)}
      </div>)}
      <div className="side-grow"/>
      <div className="side-sep"/>
      <NavLink to="/" className="side-link"><Icon name="back"/>Back to Public Site</NavLink>
      <button type="button" className="side-link" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left' }} onClick={() => { signOut(); navigate('/'); }}><Icon name="logout"/>Log Out</button>
    </aside>
    <div className="admin-main">
      <header className="admin-top">
        <span className="h3" style={{ fontSize: 18 }}>{titles[pathname] || 'Admin'}</span>
        <div className="row" style={{ gap: 12 }}>
          <span className="small text-2 hide-sm">{user.email}</span>
          <span className="avatar">{user.initials}</span>
        </div>
      </header>
      <Outlet/>
    </div>
  </div>;
}
