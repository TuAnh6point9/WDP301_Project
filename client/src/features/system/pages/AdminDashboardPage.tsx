import { errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M } from '@wqi/contracts';
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
  useLocale();
  const [range, setRange] = useState<DateRange>(defaultRange);
  const summary = useAsync(() => getDashboardSummary(range), [range.from, range.to]);
  const health = useAsync(getSystemHealth);
  const activity = useAsync(() => listAuditLogs({ ...range, page: 1, limit: 5 }), [range.from, range.to]);
  useFirstLoadReadiness(summary.loading, summary.error);
  const data = summary.data;
  const stat = (label: string, value: number | undefined, sub?: string, tone = '') => <div className="card card-pad-sm stat">
    <span className="stat-label">{displayText(label)}</span>
    <span className={`stat-value ${tone}`}>{value ?? '…'}</span>
    {sub && <span className="xs muted">{sub}</span>}
  </div>;

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('common.dashboard')}</h1>
        <p className="sub">{msg('admin.countHint')}</p>
      </div>
      <div className="page-actions" style={{ gap: 8 }}>
        <DateRangeFields value={range} onChange={setRange}/>
        <Link to="/admin/import" className="btn btn-primary"><Icon name="upload"/>{msg('admin.importExcelAction')}</Link>
      </div>
    </div>
    {summary.error && <div className="callout callout-warn" role="alert">{errorText(summary.error, M.LOAD_FAILED)} <button type="button" className="link" onClick={summary.reload}>{msg('common.retry')}</button></div>}
    {summary.loading && <LoadingIndicator scope="inline"/>}
    <div className="grid cols-3">
      {stat(msg('admin.userAccounts'), data?.users.total, data && msg('admin.usersSummary', { active: data.users.active, admins: data.users.admins }))}
      {stat(msg('admin.activeStations'), data?.stations.active)}
      {stat(msg('admin.importBatches'), data?.imports.batches, data && msg('admin.rawRows', { count: data.imports.rows }))}
      {stat(msg('admin.pendingRecords'), data?.records.pending, undefined, 'c-warn')}
      {stat(msg('admin.verifiedRecords'), data?.records.verified, data && msg('admin.rejectedCount', { count: data.records.rejected }), 'c-brand')}
      {stat(msg('admin.wqiCalculations'), data?.predictions)}
    </div>
    <div className="split stretch">
      <section className="card card-pad stack" aria-labelledby="status-title">
        <div className="row-between">
          <h2 className="h3" id="status-title">{msg('admin.componentStatus')}</h2>
          <Link to="/admin/status" className="link small">{msg('common.details')}</Link>
        </div>
        <div>
          {health.loading && <LoadingIndicator scope="inline"/>}
          {health.error && <p role="alert">{errorText(health.error, M.HEALTH_FAILED)}</p>}
          {health.data && COMPONENTS.map(name => <div className="list-row" key={name}>
            <span style={{ fontSize: 13.5 }}>{displayText(name)}</span>
            <span className={`status ${health.data!.components[name] === 'ok' ? 'ok' : 'warn'}`}>{displayText(STATUS_LABEL[health.data!.components[name]])}</span>
          </div>)}
        </div>
        {health.data && <span className="xs muted">{msg('admin.checkedAt')}{' '}{formatDateTime(health.data.checkedAt)}</span>}
      </section>
      <section className="card card-pad stack" aria-labelledby="activity-title">
        <div className="row-between">
          <h2 className="h3" id="activity-title">{msg('admin.recentActivity')}</h2>
          <Link to="/admin/status" className="link small">{msg('admin.allActivity')}</Link>
        </div>
        <div>
          {activity.loading && <LoadingIndicator scope="inline"/>}
          {activity.error && <p role="alert">{errorText(activity.error, M.LOAD_FAILED)}</p>}
          {activity.data && !activity.data.data.length && <p className="small muted">{msg('admin.noActivity')}</p>}
          {activity.data?.data.map(log => <div className="list-row" key={log._id}>
            <span className="stack-4">
              <b style={{ fontSize: 13.5 }}>{displayText(ACTION_LABELS[log.action] ?? log.action)}</b>
              <span className="xs muted">{formatDateTime(log.createdAt)} · {log.actorId?.name ?? msg('admin.unknownAccount')}</span>
            </span>
            <span className={`status ${log.outcome === 'success' ? 'ok' : 'warn'}`}>{log.outcome === 'success' ? msg('common.success') : msg('admin.failedStatus', { status: log.status })}</span>
          </div>)}
        </div>
      </section>
    </div>
  </main>;
}
