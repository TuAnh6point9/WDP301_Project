import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { createUser, listUsers, updateUser } from '../api';
import type { UserAccount, UserInput } from '../types';

const STATUS: Record<UserAccount['status'], [string, string]> = { active: ['ok', 'Active'], off: ['off', 'Inactive'], pending: ['warn', 'Pending Invite'] };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';

export function AdminUsersPage() {
  const { data, error, loading, reload } = useAsync(listUsers);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.length ? 'ready' : 'empty');
  if (!data) return <PageStatus admin error={error} onRetry={reload}/>;
  return <UserAccounts initial={data}/>;
}

function UserAccounts({ initial }: { initial: UserAccount[] }) {
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [platform, setPlatform] = useState('');
  const [editing, setEditing] = useState<UserAccount | 'new' | null>(null);

  const q = query.trim().toLowerCase();
  const rows = list.filter(u => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!role || u.role === role) && (!platform || u.platform === platform));

  async function save(form: FormData) {
    const name = String(form.get('name')).trim(), email = String(form.get('email')).trim().toLowerCase();
    const next: UserInput = { name, email, initials: initials(name), role: form.get('role') as UserAccount['role'], platform: form.get('platform') as UserAccount['platform'], status: form.get('status') as UserAccount['status'] };
    try {
      if (editing === 'new') {
        if (list.some(u => u.email === email)) { toast.show(M.EMAIL_EXISTS); return; }
        const created = await createUser(next);
        setList(previous => [...previous, created]);
        toast.show(next.status === 'pending' ? `Invitation sent to ${email}` : `${name} added`);
      } else if (editing) {
        const saved = await updateUser(next);
        setList(previous => previous.map(u => u.email === editing.email ? { ...u, ...saved } : u));
        toast.show(`${name} updated`);
      }
      setEditing(null);
    } catch (error) {
      toast.show(userErrorMessage(error, M.SAVE_ACCOUNT));
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">User Accounts</h1>
        <p className="sub">Manage who can access the Web and Mobile applications.</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" strokeWidth={2.4}/>Add User</button>
      </div>
    </div>

    <div className="grid cols-4">
      <div className="card card-pad-sm stat"><span className="stat-label">Total Users</span><span className="stat-value">{list.length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Admins</span><span className="stat-value">{list.filter(u => u.role === 'Admin').length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Active</span><span className="stat-value c-brand">{list.filter(u => u.status === 'active').length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Pending Invites</span><span className="stat-value c-warn">{list.filter(u => u.status === 'pending').length}</span></div>
    </div>

    <div className="card card-flush">
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <label className="input-icon grow" style={{ maxWidth: 340, flexBasis: 220 }}>
          <Icon name="search"/>
          <input type="text" className="input sm" placeholder="Search by name or email…" aria-label="Search users" value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
        <select className="input sm" style={{ width: 'auto' }} aria-label="Role" value={role} onChange={e => setRole(e.target.value)}><option value="">All Roles</option><option>Admin</option><option>User</option></select>
        <select className="input sm" style={{ width: 'auto' }} aria-label="Platform" value={platform} onChange={e => setPlatform(e.target.value)}><option value="">All Platforms</option><option>Web</option><option>Mobile</option></select>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Platform</th><th>Last Active</th><th>Status</th><th className="t-right">Action</th></tr></thead>
          <tbody>
            {!rows.length && <tr className="empty-row"><td colSpan={7}>No users match these filters.</td></tr>}
            {rows.map(u => <tr key={u.email}>
              <td><span className="cell-user"><span className={u.avatar === 'warn' || u.status === 'pending' ? 'avatar sm warn' : 'avatar sm'}>{u.initials}</span>{u.name}</span></td>
              <td className="text-2">{u.email}</td>
              <td><span className={u.role === 'Admin' ? 'badge b-dark' : 'badge b-neutral'}>{u.role}</span></td>
              <td>{u.platform}</td>
              <td className={u.lastActive ? undefined : 'muted'}>{u.lastActive || '—'}</td>
              <td><span className={`status ${STATUS[u.status][0]}`}>{STATUS[u.status][1]}</span></td>
              <td className="t-right">{u.status === 'pending'
                ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => toast.show(`Invitation resent to ${u.email}`)}>Resend</button>
                : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="small muted">Showing {rows.length} of {list.length} users</span>
        <div className="pager">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous page" disabled>‹</button>
          <button type="button" className="btn btn-secondary btn-sm is-current" aria-current="page">1</button>
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Next page" disabled>›</button>
        </div>
      </div>
    </div>

    {editing && <Modal title={editing === 'new' ? 'Add User' : `Edit ${editing.name}`} submitLabel={editing === 'new' ? 'Send Invite' : 'Save Changes'} onClose={() => setEditing(null)} onSubmit={event => save(new FormData(event.currentTarget))}>
      <div className="modal-body">
        <div className="field"><label className="label" htmlFor="u-name">Full name</label><input id="u-name" name="name" className="input sm" required minLength={2} defaultValue={editing === 'new' ? '' : editing.name}/></div>
        <div className="field"><label className="label" htmlFor="u-email">Email</label><input id="u-email" name="email" type="email" className="input sm" required readOnly={editing !== 'new'} defaultValue={editing === 'new' ? '' : editing.email}/></div>
        <div className="field"><label className="label" htmlFor="u-role">Role</label><select id="u-role" name="role" className="input sm" defaultValue={editing === 'new' ? 'User' : editing.role}><option>User</option><option>Admin</option></select></div>
        <div className="field"><label className="label" htmlFor="u-platform">Platform</label><select id="u-platform" name="platform" className="input sm" defaultValue={editing === 'new' ? 'Web' : editing.platform}><option>Web</option><option>Mobile</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="u-status">Status</label>
          <select id="u-status" name="status" className="input sm" defaultValue={editing === 'new' ? 'pending' : editing.status}><option value="pending">Pending invite</option><option value="active">Active</option><option value="off">Inactive</option></select>
          <span className="hint">New users receive an email invitation to set their own password.</span></div>
      </div>
    </Modal>}
    {toast.element}
  </main>;
}
