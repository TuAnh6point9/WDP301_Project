import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError, Link } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { DashboardPage, AboutPage } from '../features/dashboard/DashboardPage';
import { LoginPage } from '../features/auth/LoginPage';
import { useAuth } from '../features/auth/AuthProvider';
import { Alert, Loading, PageHeader } from '../components/ui';

const ImportsPage = lazy(() => import('../features/admin/ImportsPage').then(module => ({ default: module.ImportsPage })));
const ImportDetailPage = lazy(() => import('../features/admin/ImportsPage').then(module => ({ default: module.ImportDetailPage })));
const StationsAdminPage = lazy(() => import('../features/admin/StationsAdminPage').then(module => ({ default: module.StationsAdminPage })));
const UsersAdminPage = lazy(() => import('../features/admin/UsersAdminPage').then(module => ({ default: module.UsersAdminPage })));
const ReportsPage = lazy(() => import('../features/admin/ReportsPage').then(module => ({ default: module.ReportsPage })));
const RecordsPage = lazy(() => import('../features/water-records/RecordsPage').then(module => ({ default: module.RecordsPage })));
const StationDetailPage = lazy(() => import('../features/water-records/RecordsPage').then(module => ({ default: module.StationDetailPage })));
const PredictionsPage = lazy(() => import('../features/predictions/PredictionsPage').then(module => ({ default: module.PredictionsPage })));
const HistoryPage = lazy(() => import('../features/predictions/PredictionsPage').then(module => ({ default: module.HistoryPage })));
const StationsPage = lazy(() => import('../features/stations/StationsPage').then(module => ({ default: module.StationsPage })));

function Protected({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  if (auth.loading) return <Loading/>;
  if (auth.error) return <Alert>{auth.error}</Alert>;
  if (!auth.user) return <Navigate to="/login" replace/>;
  if (admin && auth.user.role !== 'admin') return <><PageHeader title="Không có quyền truy cập"/><Alert>Chức năng chỉ dành cho quản trị viên.</Alert></>;
  return <Outlet/>;
}
function Boundary() {
  useRouteError();
  return <div className="container"><PageHeader title="Không thể mở trang"/><Alert>Đã có lỗi khi tải trang. Vui lòng tải lại hoặc quay về tổng quan.</Alert><Link className="button" to="/">Về tổng quan</Link></div>;
}
function page(content: ReactNode) { return <Suspense fallback={<Loading/>}>{content}</Suspense>; }
export const router = createBrowserRouter([{
  element: <MainLayout/>, errorElement: <Boundary/>, children: [
    { path: '/', element: <DashboardPage/> },
    { path: '/map', element: <DashboardPage mapOnly/> },
    { path: '/about', element: <AboutPage/> },
    { path: '/login', element: <LoginPage/> },
    { path: '/records', element: page(<RecordsPage/>) },
    { path: '/stations', element: page(<StationsPage/>) },
    { path: '/stations/:id', element: page(<StationDetailPage/>) },
    { element: <Protected/>, children: [
      { path: '/predict', element: page(<PredictionsPage/>) },
      { path: '/history', element: page(<HistoryPage/>) },
      { path: '/history/:id', element: page(<HistoryPage/>) },
    ] },
    { element: <Protected admin/>, children: [
      { path: '/admin/imports', element: page(<ImportsPage/>) },
      { path: '/admin/imports/:id', element: page(<ImportDetailPage/>) },
      { path: '/admin/stations', element: page(<StationsAdminPage/>) },
      { path: '/admin/records', element: page(<RecordsPage admin/>) },
      { path: '/admin/users', element: page(<UsersAdminPage/>) },
      { path: '/admin/reports', element: page(<ReportsPage/>) },
    ] },
    { path: '*', element: <><PageHeader title="Không tìm thấy trang"/><Link className="button" to="/">Về tổng quan</Link></> },
  ],
}]);
