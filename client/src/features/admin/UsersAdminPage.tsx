import { useState } from 'react';
import { Plus, PencilSimple } from '@phosphor-icons/react';
import type { User } from '@wqi/contracts';
import { api } from '../../lib/axios';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../auth/AuthProvider';
import { ActionForm, Alert, Empty, Loading, Modal, PageHeader, Pager } from '../../components/ui';

export function UsersAdminPage() {
  const [page, setPage] = useState(1);
  const list = useApi<User[]>(`/users?page=${page}`);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const { user: currentUser } = useAuth();
  return <>
    <PageHeader title="Quản lý tài khoản" description="Admin tạo tài khoản, cấp quyền và quản lý trạng thái truy cập." actions={<button className="button" onClick={() => setEditing('new')}><Plus size={18}/>Tạo tài khoản</button>}/>
    <section className="panel">{list.loading ? <Loading/> : list.error ? <Alert>{list.error}</Alert> : !list.data?.length ? <Empty/> : <div className="table-scroll"><table><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{list.data.map(user => <tr key={user._id}><td>{user.name}{user._id === currentUser?._id && <small> (Bạn)</small>}</td><td>{user.email}</td><td>{user.role === 'admin' ? 'Admin' : 'User'}</td><td><span className={`badge ${user.isActive ? 'status-verified' : 'status-rejected'}`}>{user.isActive ? 'Hoạt động' : 'Đã khóa'}</span></td><td><button className="button secondary compact" onClick={() => setEditing(user)}><PencilSimple size={16}/>Chỉnh sửa</button></td></tr>)}</tbody></table></div>}<Pager meta={list.meta} onPage={setPage}/></section>
    {editing && <UserEditor user={editing === 'new' ? undefined : editing} currentId={currentUser?._id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }}/>} 
  </>;
}

function UserEditor({ user, currentId, onClose, onSaved }: { user?: User; currentId?: string; onClose: () => void; onSaved: () => void }) {
  const isSelf = Boolean(user && user._id === currentId);
  return <Modal title={user ? `Chỉnh sửa ${user.name}` : 'Tạo tài khoản'} onClose={onClose}><ActionForm onSuccess={onSaved} submitLabel={user ? 'Lưu thay đổi' : 'Tạo tài khoản'} onSubmit={async form => {
    const fields = { name: String(form.get('name')).trim(), role: isSelf ? user!.role : String(form.get('role')) };
    const password = String(form.get('password') || '');
    if (user) await api.patch(`/users/${user._id}`, { ...fields, isActive: isSelf ? true : form.get('isActive') === 'on', ...(password ? { password } : {}) });
    else await api.post('/users', { ...fields, email: String(form.get('email')).trim(), password });
  }}>
    <label>Họ tên<input name="name" required minLength={2} maxLength={100} defaultValue={user?.name} autoComplete="name"/></label>
    <label>Email<input name="email" type="email" required maxLength={254} defaultValue={user?.email} disabled={Boolean(user)} autoComplete="email"/></label>
    <label>{user ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu'}<input name="password" type="password" required={!user} minLength={12} maxLength={128} autoComplete="new-password"/><small>Tối thiểu 12 ký tự.</small></label>
    <label>Vai trò<select name="role" defaultValue={user?.role || 'user'} disabled={isSelf}><option value="user">User</option><option value="admin">Admin</option></select></label>
    {user && <label className="check"><input name="isActive" type="checkbox" defaultChecked={user.isActive} disabled={isSelf}/>Tài khoản đang hoạt động</label>}
    {isSelf && <p className="muted">Tài khoản đang đăng nhập được giữ quyền Admin và trạng thái hoạt động.</p>}
  </ActionForm></Modal>;
}
