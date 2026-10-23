import { errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { defaultRange, getSystemHealth, listAuditLogs } from '../api';
import { COMPONENTS, type ComponentName, type DateRange } from '../types';
import { ACTION_LABELS, DateRangeFields, Pager, useFirstLoadReadiness } from '../components/AdminControls';

const DESCRIPTIONS: Record<ComponentName, string> = {
  'Backend API': 'GET /health/live', Database: 'GET /health/ready (MongoDB)', 'AI Service': 'GET /predictions/status (WQI model)',
};

export function AdminStatusPage() {
  useLocale();
  const health = useAsync(getSystemHealth);
  const [filters, setFilters] = useState<DateRange & { action: string; page: number }>(() => ({ ...defaultRange(), action: '', page: 1 }));
  const logs = useAsync(() => listAuditLogs({ ...filters, limit: 20 }), [filters.from, filters.to, filters.action, filters.page]);
  useFirstLoadReadiness(health.loading, null);
  const down = health.data ? COMPONENTS.filter(name => health.data!.components[name] === 'down') : [];

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('admin.statusTitle')}</h1>
        <p className="sub">{msg('admin.statusHint')}</p>
      </div>
      <div className="page-actions">
        <span className="small muted">{msg('admin.lastCheck')}{' '}{health.data ? formatDateTime(health.data.checkedAt) : '—'}</span>
        <button type="button" className="btn btn-primary" onClick={health.reload} disabled={health.loading}><Icon name="refresh"/>{health.loading ? msg('predictions.checking') : msg('admin.runHealthCheck')}</button>
      </div>
    </div>
    {health.data && <div className={down.length ? 'banner warn' : 'banner ok'} role="status">
      <Icon name={down.length ? 'warn' : 'check'}/>
      <span>{down.length ? msg('admin.notResponding', { components: down.map(name => displayText(name)).join(', ') }) : msg('admin.allOperational')}</span>
    </div>}
    <section className="card card-flush" aria-labelledby="components-title">
      <div className="card-head"><h2 className="h3" id="components-title">{msg('admin.components')}</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('admin.component')}</th><th>{msg('common.check')}</th><th>{msg('common.status')}</th></tr></thead>
          <tbody>
            {health.loading && <tr className="empty-row"><td colSpan={3}><LoadingIndicator scope="inline"/></td></tr>}
            {health.data && COMPONENTS.map(name => <tr key={name}>
              <td className="strong">{displayText(name)}</td>
              <td className="small text-2 mono">{DESCRIPTIONS[name]}</td>
              <td><span className={`status ${health.data!.components[name] === 'ok' ? 'ok' : 'warn'}`}>{health.data!.components[name] === 'ok' ? msg('admin.operational') : msg('admin.down')}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="card card-flush" aria-labelledby="log-title">
      <div className="card-head"><h2 className="h3" id="log-title">{msg('admin.activityLog')}</h2></div>
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <DateRangeFields value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
        <select className="input sm" style={{ width: 'auto' }} aria-label={msg('common.action')} value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value, page: 1 })}>
          <option value="">{msg('admin.allActions')}</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{displayText(label)}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>{msg('common.time')}</th><th>{msg('common.action')}</th><th>{msg('admin.account')}</th><th>{msg('admin.target')}</th><th>{msg('common.result')}</th><th>{msg('admin.requestId')}</th></tr></thead>
          <tbody>
            {logs.loading && <tr className="empty-row"><td colSpan={6}><LoadingIndicator scope="inline"/></td></tr>}
            {logs.error && <tr className="empty-row"><td colSpan={6} role="alert">{errorText(logs.error, M.LOAD_FAILED)}</td></tr>}
            {logs.data && !logs.data.data.length && <tr className="empty-row"><td colSpan={6}>{msg('admin.noActivityMatches')}</td></tr>}
            {logs.data?.data.map(log => <tr key={log._id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{displayText(ACTION_LABELS[log.action] ?? log.action)}</td>
              <td>{log.actorId ? <span className="stack-4"><span>{log.actorId.name}</span><span className="xs muted">{log.actorId.email}</span></span> : <span className="muted">—</span>}</td>
              <td className="small mono">{log.target ?? '—'}</td>
              <td><span className={`status ${log.outcome === 'success' ? 'ok' : 'warn'}`}>{log.outcome === 'success' ? msg('common.success') : msg('common.failed')} · {log.status}</span></td>
              <td className="xs mono muted">{log.requestId}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={logs.data?.meta} noun="entries" onPage={page => setFilters({ ...filters, page })}/>
    </section>
  </main>;
}
