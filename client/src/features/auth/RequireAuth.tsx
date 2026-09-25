import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Route guard for pages that need a signed-in user; sends visitors to /login and back afterwards. */
export function RequireAuth() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search }}/>;
  return <Outlet/>;
}
