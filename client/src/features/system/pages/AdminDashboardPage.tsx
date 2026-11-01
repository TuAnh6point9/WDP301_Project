import { errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { formatNumber, msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { usePolledAsync } from '@/lib/usePolledAsync';
import { Icon, type IconName } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { useAuth } from '@/features/auth/AuthContext';
import { defaultRange, getDashboardSummary, getSystemHealth, healthWaking, listAuditLogs } from '../api';
import { COMPONENTS, type DateRange } from '../types';
import { ACTION_LABELS, COMPONENT_LABEL, DateRangeFields, useFirstLoadReadiness } from '../components/AdminControls';

/** What an admin should do next comes first; counts and logs follow. */
export function AdminDashboardPage() {
  useLocale();
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(defaultRange);
  const summary = useAsync(() => getDashboardSummary(range), [range.from, range.to]);
  const health = usePolledAsync(getSystemHealth, healthWaking);
  const activity = useAsync(() => listAuditLogs({ ...range, page: 1, limit: 5 }), [range.from, range.to]);
  useFirstLoadReadiness(summary.loading, summary.error);
  const data = summary.data;
  const n = (value: number) => formatNumber(value);
  const components = health.data?.components;
  const names = (state: 'down' | 'starting') => components ? COMPONENTS.filter(name => components[name] === state).map(name => msg(COMPONENT_LABEL[name])).join(', ') : '';
  const down = names('down'), starting = names('starting');
  const healthTone = health.error || down ? 'warn' : !components || starting ? 'wait' : 'ok';
  const healthText = health.error ? errorText(health.error, M.HEALTH_FAILED)
    : !components ? msg('admin.checkingSystem')
      : down ? msg('admin.healthDown', { names: down })
        : starting ? msg('admin.healthStarting', { names: starting })
          : msg('admin.healthOk');

  const tasks: { icon: IconName; text: string; action: string; to: string }[] = [];
  // The web and the API deploy separately; an API without `queue` simply shows no queued work.
  const queue = data?.queue;
  if (queue?.pendingRecords) tasks.push({ icon: 'database', text: queue.pendingRecords === 1 ? msg('admin.taskPendingOne') : msg('admin.taskPending', { count: n(queue.pendingRecords) }), action: msg('admin.reviewNow'), to: '/admin/data' });
  if (data && !data.stations.active) tasks.push({ icon: 'pin', text: msg('admin.taskNoStation'), action: msg('admin.addStation'), to: '/admin/stations' });

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('admin.hello', { name: user?.name ?? '' })}</h1>
        <p className="sub">{msg('admin.helloHint')}</p>
      </div>
      <div className="page-actions"><Link to="/admin/import" className={tasks.length ? 'btn btn-secondary' : 'btn btn-primary'}><Icon name="upload"/>{msg('admin.importExcelAction')}</Link></div>
    </div>

    <section className={`health-strip ${healthTone}`} role="status" aria-live="polite" aria-label={msg('admin.systemHealth')}>
      <span className="health-dot" aria-hidden="true"/>
      <span className="grow">{healthText}</span>
      {health.data && <span className="xs muted">{msg('admin.checkedAt')}{' '}{formatDateTime(health.data.checkedAt)}</span>}
      <Link to="/admin/status" className="link small">{msg('common.details')}</Link>
    </section>

    <div className="dash-grid">
      <section className="card card-pad stack" aria-labelledby="todo-title">
        <h2 className="h3" id="todo-title">{msg('admin.toDo')}</h2>
        {summary.loading && <LoadingIndicator scope="inline"/>}
        {summary.error && <div className="callout callout-warn" role="alert"><span className="grow">{errorText(summary.error, M.LOAD_FAILED)}</span><button type="button" className="btn btn-secondary btn-sm" onClick={summary.reload}>{msg('common.retry')}</button></div>}
        {data && !tasks.length && <p className="dash-clear"><Icon name="check"/>{msg('admin.nothingWaiting')}</p>}
        {tasks.length > 0 && <ul className="task-list">{tasks.map(task => <li key={task.to}>
          <span className="task-ic"><Icon name={task.icon}/></span>
          <span className="grow">{task.text}</span>
          <Link to={task.to} className="btn btn-primary">{task.action}</Link>
        </li>)}</ul>}
      </section>

      <section className="card card-pad stack" aria-labelledby="quick-title">
        <h2 className="h3" id="quick-title">{msg('admin.quickActions')}</h2>
        <div className="quick-links">
          <Link to="/admin/import" className="quick-link"><Icon name="upload"/><span><b>{msg('imports.title')}</b><span className="xs muted">{msg('admin.quickImport')}</span></span></Link>
          <Link to="/admin/stations" className="quick-link"><Icon name="pin"/><span><b>{msg('common.stations')}</b><span className="xs muted">{msg('admin.quickStations')}</span></span></Link>
          <Link to="/admin/users" className="quick-link"><Icon name="users"/><span><b>{msg('admin.accounts')}</b><span className="xs muted">{msg('admin.quickAccounts')}</span></span></Link>
        </div>
      </section>
    </div>

    <section className="card card-pad stack" aria-labelledby="numbers-title">
      <div className="row-between row-wrap">
        <div className="stack-4">
          <h2 className="h3" id="numbers-title">{msg('admin.numbers')}</h2>
          <p className="xs muted">{msg('admin.numbersHint')}</p>
        </div>
        <div className="row row-wrap" style={{ gap: 8 }}><DateRangeFields value={range} onChange={setRange}/></div>
      </div>
      <dl className="dash-numbers" aria-busy={summary.loading}>
        <div><dt>{msg('admin.accounts')}</dt><dd className="dash-value">{data ? n(data.users.total) : '…'}</dd>{data && <dd className="xs muted">{data.users.admins === 1 ? msg('admin.usersActiveOne', { active: n(data.users.active) }) : msg('admin.usersActive', { active: n(data.users.active), admins: n(data.users.admins) })}</dd>}</div>
        <div><dt>{msg('admin.activeStations')}</dt><dd className="dash-value">{data ? n(data.stations.active) : '…'}</dd></div>
        <div><dt>{msg('admin.excelImported')}</dt><dd className="dash-value">{data ? n(data.imports.batches) : '…'}</dd>{data && <dd className="xs muted">{msg('admin.rowsCount', { count: n(data.imports.rows) })}</dd>}</div>
        <div><dt>{msg('admin.recordsVerified')}</dt><dd className="dash-value">{data ? n(data.records.verified) : '…'}</dd>{data && <dd className="xs muted">{msg('admin.waitingRejected', { waiting: n(data.records.pending), rejected: n(data.records.rejected) })}</dd>}</div>
        <div><dt>{msg('admin.wqiCalculations')}</dt><dd className="dash-value">{data ? n(data.predictions) : '…'}</dd></div>
      </dl>
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
  </main>;
}
