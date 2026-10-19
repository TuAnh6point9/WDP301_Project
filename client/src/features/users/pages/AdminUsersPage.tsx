import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Modal, useToast } from '@/components/Modal';
import { defaultRange } from '@/features/system/api';
import type { DateRange } from '@/features/system/types';
import { DateRangeFields, Pager, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { createUser, listUsers, updateUser } from '../api';
import type { Role, UserAccount, UserPatch } from '../types';

export function AdminUsersPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<DateRange & { page: number }>(() => ({ ...defaultRange(), page: 1 }));
  const users = useAsync(() => listUsers(filters), [filters.from, filters.to, filters.page]);
  useFirstLoadReadiness(users.loading, users.error);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<UserAccount | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const rows = (users.data?.data ?? []).filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  async function save(form: FormData) {
    const name = String(form.get('name')).trim(), role = form.get('role') as Role, password = String(form.get('password') ?? '');
    try {
      if (editing === 'new') {
        await createUser({ name, email: String(form.get('email')).trim().toLowerCase(), password, role });
        toast.show(`${name} added`);
      } else if (editing) {
        const patch: UserPatch = { name, role, ...(password ? { password } : {}) };
        await updateUser(editing._id, patch);
        toast.show(`${name} updated`);
      }
      setEditing(null);
      users.reload();
    } catch (error) {
      toast.show(userErrorMessage(error, M.SAVE_ACCOUNT));
    }
  }
  async function toggle(user: UserAccount) {
    setBusy(user._id);
    try {
      await updateUser(user._id, { isActive: !user.isActive });
      toast.show(user.isActive ? `${user.name} locked` : `${user.name} unlocked`);
      users.reload();
    } catch (error) {
      toast.show(userErrorMessage(error, M.SAVE_ACCOUNT));
    } finally {
      setBusy(null);
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">User Accounts</h1>
        <p className="sub">Create, edit and lock accounts. The list shows accounts created between the selected days.</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" strokeWidth={2.4}/>Add User</button>
      </div>
    </div>

    <div className="card card-flush">
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <label className="input-icon grow" style={{ maxWidth: 340, flexBasis: 220 }}>
          <Icon name="search"/>
          <input type="text" className="input sm" placeholder="Search this page by name or email…" aria-label="Search users" value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
        <DateRangeFields value={filters} onChange={next => setFilters({ ...next, page: 1 })}/>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th className="t-right">Action</th></tr></thead>
          <tbody>
            {users.loading && <tr className="empty-row"><td colSpan={6}><LoadingIndicator scope="inline"/></td></tr>}
            {users.error && <tr className="empty-row"><td colSpan={6} role="alert">{userErrorMessage(users.error, M.LOAD_FAILED)}</td></tr>}
            {users.data && !rows.length && <tr className="empty-row"><td colSpan={6}>No users match these filters.</td></tr>}
            {rows.map(u => <tr key={u._id}>
              <td className="strong">{u.name}</td>
              <td className="text-2">{u.email}</td>
              <td><span className={u.role === 'admin' ? 'badge b-dark' : 'badge b-neutral'}>{u.role === 'admin' ? 'Admin' : 'User'}</span></td>
              <td><span className={`status ${u.isActive ? 'ok' : 'off'}`}>{u.isActive ? 'Active' : 'Locked'}</span></td>
              <td>{formatDateTime(u.createdAt)}</td>
              <td className="t-right"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === u._id} onClick={() => toggle(u)}>{u.isActive ? 'Lock' : 'Unlock'}</button>
              </span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={users.data?.meta} noun="users" onPage={page => setFilters({ ...filters, page })}/>
    </div>

    {editing && <Modal title={editing === 'new' ? 'Add User' : `Edit ${editing.name}`} submitLabel={editing === 'new' ? 'Create Account' : 'Save Changes'} onClose={() => setEditing(null)} onSubmit={event => save(new FormData(event.currentTarget))}>
      <div className="modal-body">
        <div className="field"><label className="label" htmlFor="u-name">Full name</label><input id="u-name" name="name" className="input sm" required minLength={2} maxLength={100} defaultValue={editing === 'new' ? '' : editing.name}/></div>
        <div className="field"><label className="label" htmlFor="u-email">Email</label><input id="u-email" name="email" type="email" className="input sm" required readOnly={editing !== 'new'} defaultValue={editing === 'new' ? '' : editing.email}/></div>
        <div className="field"><label className="label" htmlFor="u-role">Role</label><select id="u-role" name="role" className="input sm" defaultValue={editing === 'new' ? 'user' : editing.role}><option value="user">User</option><option value="admin">Admin</option></select></div>
        <div className="field"><label className="label" htmlFor="u-password">{editing === 'new' ? 'Password' : 'New password (optional)'}</label><input id="u-password" name="password" type="password" autoComplete="new-password" className="input sm" required={editing === 'new'} minLength={12} maxLength={128}/>
          <span className="hint">At least 12 characters.</span></div>
      </div>
    </Modal>}
    {toast.element}
  </main>;
}
