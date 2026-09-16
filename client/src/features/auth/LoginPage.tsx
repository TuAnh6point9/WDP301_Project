import { Navigate, useNavigate } from 'react-router-dom';
import { LockKey } from '@phosphor-icons/react';
import { useAuth } from './AuthProvider';
import { ActionForm, PageHeader } from '../../components/ui';
export function LoginPage() {
  const { user, login } = useAuth(); const navigate = useNavigate();
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/imports' : '/predict'} replace/>;
  return <><PageHeader title="Đăng nhập" description="Sử dụng tài khoản do quản trị viên cung cấp."/><section className="panel login-panel"><LockKey size={36} weight="light"/><h2>Truy cập không gian làm việc</h2><ActionForm submitLabel="Đăng nhập" onSubmit={async form => { await login(String(form.get('email')), String(form.get('password'))); navigate('/'); }}><label>Email<input name="email" type="email" autoComplete="username" required/></label><label>Mật khẩu<input name="password" type="password" autoComplete="current-password" maxLength={128} required/></label></ActionForm><p className="muted">Bạn vẫn có thể xem bản đồ và dữ liệu đã duyệt mà không cần đăng nhập.</p></section></>;
}
