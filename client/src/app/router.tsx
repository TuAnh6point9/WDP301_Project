import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { HomePage } from '@/features/home/pages/HomePage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';

const MapPage = lazy(() => import('@/features/map/pages/MapPage').then(m => ({ default: m.MapPage })));
const HistoricalDataPage = lazy(() => import('@/features/water-records/pages/HistoricalDataPage').then(m => ({ default: m.HistoricalDataPage })));
const CalculatePage = lazy(() => import('@/features/predictions/pages/CalculatePage').then(m => ({ default: m.CalculatePage })));
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
  return <Suspense fallback={<p className="container page muted">Loading…</p>}>{content}</Suspense>;
}
function NotFound() {
  return <main className="container page"><h1 className="h1">Page not found</h1><Link to="/" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Back to Home</Link></main>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage/> },
  { element: <PublicLayout/>, children: [
    { path: '/', element: <HomePage/> },
    { path: '/map', element: page(<MapPage/>) },
    { path: '/historical-data', element: page(<HistoricalDataPage/>) },
    { element: <RequireAuth/>, children: [
      { path: '/calculate', element: page(<CalculatePage/>) },
      { path: '/result', element: page(<ResultPage/>) },
      { path: '/history', element: page(<HistoryPage/>) },
      { path: '/report', element: page(<ReportPage/>) },
    ] },
    { path: '/records', element: <Navigate to="/historical-data" replace/> },
    { path: '*', element: <NotFound/> },
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
]);
