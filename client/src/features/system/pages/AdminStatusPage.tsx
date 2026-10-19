import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
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
  const health = useAsync(getSystemHealth);
  const [filters, setFilters] = useState<DateRange & { action: string; page: number }>(() => ({ ...defaultRange(), action: '', page: 1 }));
  const logs = useAsync(() => listAuditLogs({ ...filters, limit: 20 }), [filters.from, filters.to, filters.action, filters.page]);
  useFirstLoadReadiness(health.loading, null);
  const down = health.data ? COMPONENTS.filter(name => health.data!.components[name] === 'down') : [];

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">System Status</h1>
        <p className="sub">Live state of the services behind the web app, and the activity log (kept for 90 days).</p>
      </div>
      <div className="page-actions">
        <span className="small muted">Last check: {health.data ? formatDateTime(health.data.checkedAt) : '—'}</span>
        <button type="button" className="btn btn-primary" onClick={health.reload} disabled={health.loading}><Icon name="refresh"/>{health.loading ? 'Checking…' : 'Run Health Check'}</button>
      </div>
    </div>
    {health.data && <div className={down.length ? 'banner warn' : 'banner ok'} role="status">
      <Icon name={down.length ? 'warn' : 'check'}/>
      <span>{down.length ? `Not responding: ${down.join(', ')}` : 'All components are operational'}</span>
    </div>}
    <section className="card card-flush" aria-labelledby="components-title">
      <div className="card-head"><h2 className="h3" id="components-title">Components</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Component</th><th>Check</th><th>Status</th></tr></thead>
          <tbody>
            {health.loading && <tr className="empty-row"><td colSpan={3}><LoadingIndicator scope="inline"/></td></tr>}
            {health.data && COMPONENTS.map(name => <tr key={name}>
              <td className="strong">{name}</td>
              <td className="small text-2 mono">{DESCRIPTIONS[name]}</td>
              <td><span className={`status ${health.data!.components[name] === 'ok' ? 'ok' : 'warn'}`}>{health.data!.components[name] === 'ok' ? 'Operational' : 'Down'}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="card card-flush" aria-labelledby="log-title">
      <div className="card-head"><h2 className="h3" id="log-title">Activity Log</h2></div>
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <DateRangeFields value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
        <select className="input sm" style={{ width: 'auto' }} aria-label="Action" value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value, page: 1 })}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>Time</th><th>Action</th><th>Account</th><th>Target</th><th>Result</th><th>Request ID</th></tr></thead>
          <tbody>
            {logs.loading && <tr className="empty-row"><td colSpan={6}><LoadingIndicator scope="inline"/></td></tr>}
            {logs.error && <tr className="empty-row"><td colSpan={6} role="alert">{userErrorMessage(logs.error, M.LOAD_FAILED)}</td></tr>}
            {logs.data && !logs.data.data.length && <tr className="empty-row"><td colSpan={6}>No activity matches these filters.</td></tr>}
            {logs.data?.data.map(log => <tr key={log._id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{ACTION_LABELS[log.action] ?? log.action}</td>
              <td>{log.actorId ? <span className="stack-4"><span>{log.actorId.name}</span><span className="xs muted">{log.actorId.email}</span></span> : <span className="muted">—</span>}</td>
              <td className="small mono">{log.target ?? '—'}</td>
              <td><span className={`status ${log.outcome === 'success' ? 'ok' : 'warn'}`}>{log.outcome === 'success' ? 'Success' : 'Failed'} · {log.status}</span></td>
              <td className="xs mono muted">{log.requestId}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={logs.data?.meta} noun="entries" onPage={page => setFilters({ ...filters, page })}/>
    </section>
  </main>;
}
