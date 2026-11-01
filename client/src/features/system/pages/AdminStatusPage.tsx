import { errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { usePolledAsync } from '@/lib/usePolledAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Pager } from '@/components/Pager';
import { defaultRange, getSystemHealth, healthWaking, listAuditLogs } from '../api';
import { COMPONENTS, type ComponentName, type DateRange } from '../types';
import { ACTION_LABELS, COMPONENT_LABEL, DateRangeFields, HEALTH_LABEL, HEALTH_TONE, useFirstLoadReadiness } from '../components/AdminControls';

// What each part does in plain words; the endpoint and request ID stay as tooltips for whoever has to fix it.
const DESCRIPTIONS: Record<ComponentName, [TranslationKey, string]> = {
  'Backend API': ['admin.describeApi', 'GET /health/live'],
  Database: ['admin.describeDb', 'GET /health/ready (MongoDB)'],
  'AI Service': ['admin.describeAi', 'GET /predictions/status (WQI model)'],
};

export function AdminStatusPage() {
  useLocale();
  const health = usePolledAsync(getSystemHealth, healthWaking);
  const [filters, setFilters] = useState<DateRange & { action: string; page: number }>(() => ({ ...defaultRange(), action: '', page: 1 }));
  const logs = useAsync(() => listAuditLogs({ ...filters, limit: PAGE_SIZE }), [filters.from, filters.to, filters.action, filters.page], { keepPrevious: true });
  useFirstLoadReadiness(health.loading && !health.data, null);
  const components = health.data?.components;
  const named = (state: 'down' | 'starting') => components ? COMPONENTS.filter(name => components[name] === state).map(name => msg(COMPONENT_LABEL[name])).join(', ') : '';
  const down = named('down'), starting = named('starting');

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('admin.systemHealth')}</h1>
        <p className="sub">{msg('admin.statusHint')}</p>
      </div>
      <div className="page-actions">
        <span className="small text-2">{msg('admin.lastCheck')}{' '}{health.data ? formatDateTime(health.data.checkedAt) : '—'}</span>
        <button type="button" className="btn btn-primary" onClick={health.reload} disabled={health.loading}><Icon name="refresh"/>{health.loading ? msg('predictions.checking') : msg('admin.checkNow')}</button>
      </div>
    </div>
    {components && <div className={down ? 'banner warn' : starting ? 'banner wait' : 'banner ok'} role="status">
      <Icon name={down ? 'warn' : starting ? 'clock' : 'check'}/>
      <span>{down ? msg('admin.notResponding', { components: down }) : starting ? msg('admin.healthStarting', { names: starting }) : msg('admin.healthOk')}</span>
    </div>}
    {health.error && <div className="callout callout-warn" role="alert">{errorText(health.error, M.HEALTH_FAILED)}</div>}
    <section className="card card-flush" aria-labelledby="components-title">
      <div className="card-head"><h2 className="h3" id="components-title">{msg('admin.partsTitle')}</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('admin.part')}</th><th>{msg('admin.whatItDoes')}</th><th>{msg('common.status')}</th></tr></thead>
          <tbody>
            {health.loading && !components && <tr className="empty-row"><td colSpan={3}><LoadingIndicator scope="inline"/></td></tr>}
            {components && COMPONENTS.map(name => <tr key={name}>
              <td className="strong">{msg(COMPONENT_LABEL[name])}</td>
              <td className="text-2" title={DESCRIPTIONS[name][1]}>{msg(DESCRIPTIONS[name][0])}</td>
              <td><span className={`status ${HEALTH_TONE[components[name]]}`}>{msg(HEALTH_LABEL[components[name]])}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section className="card card-flush" aria-labelledby="log-title">
      <div className="card-head"><h2 className="h3" id="log-title">{msg('admin.activityLog')}</h2></div>
      <div className="table-filters">
        <DateRangeFields value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
        <select className="input sm table-select" aria-label={msg('common.action')} value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value, page: 1 })}>
          <option value="">{msg('admin.allActions')}</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{displayText(label)}</option>)}
        </select>
      </div>
      <div className="table-wrap" aria-busy={logs.loading}>
        <table className="table">
          <thead><tr><th>{msg('common.time')}</th><th>{msg('common.action')}</th><th>{msg('admin.account')}</th><th>{msg('common.result')}</th></tr></thead>
          <tbody>
            {logs.loading && !logs.data && <tr className="empty-row"><td colSpan={4}><LoadingIndicator scope="inline"/></td></tr>}
            {logs.error && <tr className="empty-row"><td colSpan={4} role="alert">{errorText(logs.error, M.LOAD_FAILED)}</td></tr>}
            {logs.data && !logs.data.data.length && <tr className="empty-row"><td colSpan={4}>{msg('admin.noActivityMatches')}</td></tr>}
            {logs.data?.data.map(log => <tr key={log._id}>
              <td>{formatDateTime(log.createdAt)}</td>
              <td>{displayText(ACTION_LABELS[log.action] ?? log.action)}</td>
              <td>{log.actorId ? <>{log.actorId.name} <span className="text-2 small">{log.actorId.email}</span></> : <span className="muted">—</span>}</td>
              <td title={log.requestId}><span className={`status ${log.outcome === 'success' ? 'ok' : 'warn'}`}>{log.outcome === 'success' ? msg('common.success') : msg('common.failed')}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={logs.data?.meta} noun="entries" onPage={page => setFilters({ ...filters, page })}/>
    </section>
  </main>;
}
