import { USER_MESSAGES as M } from '@wqi/contracts';
import { lazy, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/AuthContext';
import { NavigationTransitionProvider, RoutePage, TransitionViewport } from './navigation/NavigationTransition';
import { createTransitionStore, isProtectedPage } from './navigation/transitionStore';
import { captureNavigationScroll } from './navigation/navigationScroll';

const transitions = createTransitionStore(window.location);
function NavigationRoot() {
  const { user, sessionEpoch } = useAuth();
  const location = useLocation();
  const session = `${sessionEpoch}:${user?._id ?? 'anonymous'}`;
  const previousSession = useRef(session);
  useLayoutEffect(() => {
    if (previousSession.current === session) return;
    previousSession.current = session;
    if (isProtectedPage(location)) transitions.navigate(location, { force: true, continuation: true });
  }, [session, location]);
  return <NavigationTransitionProvider store={transitions}><TransitionViewport scope="fullscreen"><Outlet/></TransitionViewport></NavigationTransitionProvider>;
}

const MapPage = lazy(() => import('@/features/map/pages/MapPage').then(m => ({ default: m.MapPage })));
const HistoricalDataPage = lazy(() => import('@/features/water-records/pages/HistoricalDataPage').then(m => ({ default: m.HistoricalDataPage })));
const CalculatePage = lazy(() => import('@/features/predictions/pages/CalculatePage').then(m => ({ default: m.CalculatePage })));
const BatchPage = lazy(() => import('@/features/predictions/pages/BatchPage').then(m => ({ default: m.BatchPage })));
const BatchHistoryPage = lazy(() => import('@/features/predictions/pages/BatchHistoryPage').then(m => ({ default: m.BatchHistoryPage })));
const ResultPage = lazy(() => import('@/features/predictions/pages/ResultPage').then(m => ({ default: m.ResultPage })));
const HistoryPage = lazy(() => import('@/features/predictions/pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ReportPage = lazy(() => import('@/features/reports/pages/ReportPage').then(m => ({ default: m.ReportPage })));
const AdminDashboardPage = lazy(() => import('@/features/system/pages/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const AdminImportPage = lazy(() => import('@/features/imports/pages/AdminImportPage').then(m => ({ default: m.AdminImportPage })));
const AdminDataPage = lazy(() => import('@/features/water-records/pages/AdminDataPage').then(m => ({ default: m.AdminDataPage })));
const AdminStationsPage = lazy(() => import('@/features/stations/pages/AdminStationsPage').then(m => ({ default: m.AdminStationsPage })));
const AdminUsersPage = lazy(() => import('@/features/users/pages/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminStatusPage = lazy(() => import('@/features/system/pages/AdminStatusPage').then(m => ({ default: m.AdminStatusPage })));
const AdminSettingsPage = lazy(() => import('@/features/system/pages/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));

function page(content: ReactNode) {
  return <RoutePage>{content}</RoutePage>;
}
function LegacyExcelRedirect() {
  const { id } = useParams();
  return <Navigate to={`/excel/${id}`} replace/>;
}
function NotFound() {
  return <main className="container page"><h1 className="h1">{M.PAGE_NOT_FOUND}</h1><Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Back to Home</Link></main>;
}

export const router = createBrowserRouter([{ element: <NavigationRoot/>, children: [
  { path: '/login', element: <div id="page-content" tabIndex={-1}>{page(<LoginPage/>)}</div> },
  { element: <PublicLayout/>, children: [
    { path: '/', element: page(<HomePage/>) },
    { path: '/map', element: page(<MapPage/>) },
    { path: '/historical-data', element: page(<HistoricalDataPage/>) },
    { element: <RequireAuth/>, children: [
      { path: '/calculate', element: page(<CalculatePage/>) },
      { path: '/calculate/excel', element: <Navigate to="/calculate" replace/> },
      { path: '/prediction-batches/:id', element: <LegacyExcelRedirect/> },
      { path: '/excel/:id', element: page(<BatchPage/>) },
      { path: '/history/excel', element: page(<BatchHistoryPage/>) },
      { path: '/result', element: page(<ResultPage/>) },
      { path: '/history', element: page(<HistoryPage/>) },
      { path: '/report', element: page(<ReportPage/>) },
    ] },
    { path: '/records', element: <Navigate to="/historical-data" replace/> },
    { path: '*', element: page(<NotFound/>) },
  ] },
  { element: <AdminLayout/>, children: [
    { path: '/admin', element: page(<AdminDashboardPage/>) },
    { path: '/admin/import', element: page(<AdminImportPage/>) },
    { path: '/admin/data', element: page(<AdminDataPage/>) },
    { path: '/admin/stations', element: page(<AdminStationsPage/>) },
    { path: '/admin/users', element: page(<AdminUsersPage/>) },
    { path: '/admin/status', element: page(<AdminStatusPage/>) },
    { path: '/admin/settings', element: page(<AdminSettingsPage/>) },
  ] },
]}]);

// Runs before RouterProvider commits the next tree, including cached routes and POP navigation.
let previousEntry = router.state.location.key;
const unsubscribe = router.subscribe(state => {
  const pending = state.navigation.state !== 'idle' ? state.navigation.location : undefined;
  if (!transitions.getSnapshot().busy && (pending || state.location.key !== previousEntry)) captureNavigationScroll(previousEntry);
  if (!pending) previousEntry = state.location.key;
  transitions.navigate(pending ?? state.location, { committed: !pending, continuation: !pending && state.historyAction === 'REPLACE' && transitions.getSnapshot().busy });
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); transitions.dispose(); });
