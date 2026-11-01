import { errorText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Modal, useToast } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import type { DateRange } from '@/features/system/types';
import { DateRangeFields, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { createUser, listUsers, updateUser } from '../api';
import type { Role, UserAccount, UserPatch } from '../types';

export function AdminUsersPage() {
  useLocale();
  const toast = useToast();
  const [filters, setFilters] = useState<DateRange & { page: number; q: string }>({ from: '', to: '', page: 1, q: '' });
  const users = useAsync(() => listUsers(filters), [filters.from, filters.to, filters.page, filters.q], { keepPrevious: true });
  useFirstLoadReadiness(users.loading, users.error);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<UserAccount | 'new' | null>(null);
  const [locking, setLocking] = useState<UserAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = users.data?.data ?? [];

  // Search once typing pauses, across every account on the server.
  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.q === query.trim() ? previous : { ...previous, q: query.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function save(form: FormData) {
    const name = String(form.get('name')).trim(), role = form.get('role') as Role, password = String(form.get('password') ?? '');
    try {
      if (editing === 'new') {
        await createUser({ name, email: String(form.get('email')).trim().toLowerCase(), password, role });
        toast.show({ key: 'users.addedToast', params: { name } });
      } else if (editing) {
        const patch: UserPatch = { name, role, ...(password ? { password } : {}) };
        await updateUser(editing._id, patch);
        toast.show({ key: 'users.updatedToast', params: { name } });
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
      toast.show({ key: user.isActive ? 'users.lockedToast' : 'users.unlockedToast', params: { name: user.name } });
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
        <h1 className="h1">{msg('admin.accounts')}</h1>
        <p className="sub">{msg('users.description')}</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" strokeWidth={2.4}/>{msg('users.add')}</button>
      </div>
    </div>

    <div className="card card-flush">
      <div className="table-filters">
        <label className="input-icon table-search">
          <Icon name="search"/>
          <input type="text" className="input sm" placeholder={msg('users.searchPlaceholder')} aria-label={msg('users.search')} value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
        <DateRangeFields value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
      </div>
      <div className="table-wrap" aria-busy={users.loading}>
        <table className="table">
          <thead><tr><th>{msg('users.name')}</th><th>{msg('users.role')}</th><th>{msg('common.status')}</th><th>{msg('common.created')}</th><th className="col-action">{msg('common.action')}</th></tr></thead>
          <tbody>
            {users.loading && !users.data && <tr className="empty-row"><td colSpan={5}><LoadingIndicator scope="inline"/></td></tr>}
            {users.error && <tr className="empty-row"><td colSpan={5} role="alert">{errorText(users.error, M.LOAD_FAILED)}</td></tr>}
            {users.data && !rows.length && <tr className="empty-row"><td colSpan={5}>{msg('users.noMatches')}</td></tr>}
            {rows.map(u => <tr key={u._id}>
              <td><span className="stack-4"><b>{u.name}</b><span className="small text-2">{u.email}</span></span></td>
              <td><span className={u.role === 'admin' ? 'badge b-dark' : 'badge b-neutral'}>{u.role === 'admin' ? msg('users.administrator') : msg('users.user')}</span></td>
              <td><span className={`status ${u.isActive ? 'ok' : 'off'}`}>{u.isActive ? msg('users.inUse') : msg('users.locked')}</span></td>
              <td>{formatDateTime(u.createdAt)}</td>
              <td className="col-action"><span className="row" style={{ justifyContent: 'center', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('users.editLabel', { name: u.name })} onClick={() => setEditing(u)}>{msg('common.edit')}</button>
                {u.isActive
                  ? <button type="button" className="btn btn-danger-outline btn-sm" aria-label={msg('users.lockLabel', { name: u.name })} disabled={busy === u._id} onClick={() => setLocking(u)}>{msg('users.lock')}</button>
                  : <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('users.unlockLabel', { name: u.name })} disabled={busy === u._id} onClick={() => void toggle(u)}>{msg('users.unlock')}</button>}
              </span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={users.data?.meta} noun="users" onPage={page => setFilters({ ...filters, page })}/>
    </div>

    {locking && <Modal danger title={msg('users.lockTitle', { name: locking.name })} submitLabel={msg('users.lockConfirm')} onClose={() => setLocking(null)} onSubmit={() => { void toggle(locking); setLocking(null); }}>
      <div className="modal-body"><p className="span-2">{msg('users.lockHint', { name: locking.name })}</p></div>
    </Modal>}
    {editing && <Modal title={editing === 'new' ? msg('users.add') : msg('users.editTitle', { name: editing.name })} submitLabel={editing === 'new' ? msg('users.create') : msg('common.saveChanges')} onClose={() => setEditing(null)} onSubmit={event => save(new FormData(event.currentTarget))}>
      <div className="modal-body">
        <div className="field"><label className="label" htmlFor="u-name">{msg('users.fullName')}</label><input id="u-name" name="name" className="input sm" required minLength={2} maxLength={100} defaultValue={editing === 'new' ? '' : editing.name}/></div>
        <div className="field"><label className="label" htmlFor="u-email">{msg('auth.email')}</label><input id="u-email" name="email" type="email" className="input sm" required readOnly={editing !== 'new'} defaultValue={editing === 'new' ? '' : editing.email}/></div>
        <div className="field"><label className="label" htmlFor="u-role">{msg('users.role')}</label><select id="u-role" name="role" className="input sm" defaultValue={editing === 'new' ? 'user' : editing.role}><option value="user">{msg('users.user')}</option><option value="admin">{msg('common.admin')}</option></select></div>
        <div className="field"><label className="label" htmlFor="u-password">{editing === 'new' ? msg('auth.password') : msg('users.newPassword')}</label><input id="u-password" name="password" type="password" autoComplete="new-password" className="input sm" required={editing === 'new'} minLength={12} maxLength={128}/>
          <span className="hint">{msg('users.passwordHint')}</span></div>
      </div>
    </Modal>}
    {toast.element}
  </main>;
}
