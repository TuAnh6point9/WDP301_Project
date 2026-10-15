import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { PageStatus } from '@/components/PageStatus';

/** Route guard for pages that need a signed-in user; sends visitors to /login and back afterwards. */
export function RequireAuth() {
  const { user, status, error, refreshSession, sessionEpoch } = useAuth();
  const { pathname, search } = useLocation();
  if (status === 'loading' || status === 'error') return <PageStatus error={error} onRetry={() => void refreshSession()}/>;
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search }}/>;
  return <Outlet key={`${user._id}:${sessionEpoch}`}/>;
}
