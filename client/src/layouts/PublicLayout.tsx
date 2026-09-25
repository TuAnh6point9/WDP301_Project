import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Brand } from '@/components/Brand';

const links = [
  ['/', 'Home'],
  ['/map', 'Map'],
  ['/historical-data', 'Historical Data'],
  ['/calculate', 'Calculate WQI'],
  ['/history', 'History'],
] as const;

export function PublicLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return <>
    <header className="topnav">
      <div className="container topnav-inner">
        <Link to="/" className="brand"><Brand/>WQI <span>An Kim Hai</span></Link>
        <nav className="nav" aria-label="Main">
          {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}
        </nav>
        <div className="nav-actions">
          <Link to="/admin" className="btn btn-ghost">Admin</Link>
          {user
            ? <button type="button" className="btn btn-secondary" onClick={() => { signOut(); navigate('/'); }} title={user.email}>Log Out</button>
            : <Link to="/login" className="btn btn-primary">Log In</Link>}
        </div>
      </div>
    </header>
    <Outlet/>
  </>;
}
