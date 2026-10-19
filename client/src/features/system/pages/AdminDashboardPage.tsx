import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { defaultRange, getDashboardSummary, getSystemHealth, listAuditLogs } from '../api';
import { COMPONENTS, type DateRange } from '../types';
import { ACTION_LABELS, DateRangeFields, useFirstLoadReadiness } from '../components/AdminControls';

const STATUS_LABEL = { ok: 'Operational', down: 'Down' } as const;

export function AdminDashboardPage() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const summary = useAsync(() => getDashboardSummary(range), [range.from, range.to]);
  const health = useAsync(getSystemHealth);
  const activity = useAsync(() => listAuditLogs({ ...range, page: 1, limit: 5 }), [range.from, range.to]);
  useFirstLoadReadiness(summary.loading, summary.error);
  const data = summary.data;
  const stat = (label: string, value: number | undefined, sub?: string, tone = '') => <div className="card card-pad-sm stat">
    <span className="stat-label">{label}</span>
    <span className={`stat-value ${tone}`}>{value ?? '…'}</span>
    {sub && <span className="xs muted">{sub}</span>}
  </div>;

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">Dashboard</h1>
        <p className="sub">Counts of items created between the selected days (inclusive).</p>
      </div>
      <div className="page-actions" style={{ gap: 8 }}>
        <DateRangeFields value={range} onChange={setRange}/>
        <Link to="/admin/import" className="btn btn-primary"><Icon name="upload"/>Import Excel</Link>
      </div>
    </div>
    {summary.error && <div className="callout callout-warn" role="alert">{userErrorMessage(summary.error, M.LOAD_FAILED)} <button type="button" className="link" onClick={summary.reload}>Retry</button></div>}
    {summary.loading && <LoadingIndicator scope="inline"/>}
    <div className="grid cols-3">
      {stat('User Accounts', data?.users.total, data && `${data.users.active} active · ${data.users.admins} admin`)}
      {stat('Active Stations', data?.stations.active)}
      {stat('Import Batches', data?.imports.batches, data && `${data.imports.rows} raw rows`)}
      {stat('Records Pending Review', data?.records.pending, undefined, 'c-warn')}
      {stat('Records Verified', data?.records.verified, data && `${data.records.rejected} rejected`, 'c-brand')}
      {stat('WQI Calculations', data?.predictions)}
    </div>
    <div className="split stretch">
      <section className="card card-pad stack" aria-labelledby="status-title">
        <div className="row-between">
          <h2 className="h3" id="status-title">System Component Status</h2>
          <Link to="/admin/status" className="link small">Details</Link>
        </div>
        <div>
          {health.loading && <LoadingIndicator scope="inline"/>}
          {health.error && <p role="alert">{userErrorMessage(health.error, M.HEALTH_FAILED)}</p>}
          {health.data && COMPONENTS.map(name => <div className="list-row" key={name}>
            <span style={{ fontSize: 13.5 }}>{name}</span>
            <span className={`status ${health.data!.components[name] === 'ok' ? 'ok' : 'warn'}`}>{STATUS_LABEL[health.data!.components[name]]}</span>
          </div>)}
        </div>
        {health.data && <span className="xs muted">Checked at {formatDateTime(health.data.checkedAt)}</span>}
      </section>
      <section className="card card-pad stack" aria-labelledby="activity-title">
        <div className="row-between">
          <h2 className="h3" id="activity-title">Recent Activity</h2>
          <Link to="/admin/status" className="link small">All activity</Link>
        </div>
        <div>
          {activity.loading && <LoadingIndicator scope="inline"/>}
          {activity.error && <p role="alert">{userErrorMessage(activity.error, M.LOAD_FAILED)}</p>}
          {activity.data && !activity.data.data.length && <p className="small muted">No activity in this period.</p>}
          {activity.data?.data.map(log => <div className="list-row" key={log._id}>
            <span className="stack-4">
              <b style={{ fontSize: 13.5 }}>{ACTION_LABELS[log.action] ?? log.action}</b>
              <span className="xs muted">{formatDateTime(log.createdAt)} · {log.actorId?.name ?? 'Unknown account'}</span>
            </span>
            <span className={`status ${log.outcome === 'success' ? 'ok' : 'warn'}`}>{log.outcome === 'success' ? 'Success' : `Failed (${log.status})`}</span>
          </div>)}
        </div>
      </section>
    </div>
  </main>;
}
