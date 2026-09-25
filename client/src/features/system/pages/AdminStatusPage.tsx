import { useState, type CSSProperties } from 'react';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Modal';
import { getSystemHealth } from '../api';
import type { SystemHealth } from '../types';

// The services behind the Web and Mobile apps; their health comes from getSystemHealth().
const COMPONENTS = [
  { name: 'Backend API', desc: 'REST API for Web & Mobile' },
  { name: 'AI Service', desc: 'WQI prediction model server' },
  { name: 'Database', desc: 'MongoDB' },
  { name: 'Map Service', desc: 'OpenStreetMap tiles' },
];
const LABEL: Record<string, string> = { ok: 'Operational', warn: 'Degraded', down: 'Down', '': 'Operational' };
const NO_HISTORY: ('' | 'warn' | 'down')[] = Array(30).fill('');

export function AdminStatusPage() {
  const { data, error, reload } = useAsync(getSystemHealth);
  if (!data) return <PageStatus admin error={error} onRetry={reload}/>;
  return <SystemStatus initial={data}/>;
}

function SystemStatus({ initial }: { initial: SystemHealth }) {
  const toast = useToast();
  const [health, setHealth] = useState(initial);
  const [busy, setBusy] = useState(false);
  const statuses = COMPONENTS.map(c => health.components[c.name]?.status);
  const degraded = COMPONENTS.filter((_, i) => statuses[i] === 'warn' || statuses[i] === 'down');

  async function check() {
    setBusy(true);
    try {
      const next = await getSystemHealth();
      setHealth(next);
      const ok = COMPONENTS.filter(c => next.components[c.name]?.status === 'ok').length;
      toast.show(`Health check complete · ${ok} of ${COMPONENTS.length} operational`);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Health check failed');
    } finally {
      setBusy(false);
    }
  }

  const model = health.model;
  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">System Status</h1>
        <p className="sub">Health of the services behind the Web and Mobile apps. Checks run every 5 minutes.</p>
      </div>
      <div className="page-actions">
        <span className="small muted">Last check: {health.checkedAt ? formatDateTime(health.checkedAt) : '—'}</span>
        <button type="button" className="btn btn-primary" onClick={check} disabled={busy}><Icon name="refresh"/>{busy ? 'Checking…' : 'Run Health Check'}</button>
      </div>
    </div>

    {degraded.length > 0 && <div className="banner warn">
      <Icon name="warn"/>
      <span>Partial degradation — {degraded.map(c => c.name).join(', ')}. All other services are operational.</span>
    </div>}

    <div className="grid cols-2">
      {COMPONENTS.map(c => {
        const h = health.components[c.name];
        const days = h?.days ?? NO_HISTORY;
        return <section className="card card-pad comp" key={c.name} aria-labelledby={`c-${c.name}`}>
          <div className="comp-head">
            <div className="stack-4"><h2 className="h3" id={`c-${c.name}`}>{c.name}</h2><span className="xs muted">{c.desc}</span></div>
            {h ? <span className={`status ${h.status}`}>{LABEL[h.status]}</span> : <span className="status off">Unknown</span>}
          </div>
          <div className="uptime" role="img" aria-label={`${c.name}: ${days.filter(Boolean).length} incident days in the last 30 days`}>
            {days.map((d, i) => <i key={i} className={d || undefined} title={`${30 - i} days ago · ${h ? LABEL[d] : 'No data'}`}/>)}
          </div>
          <div className="row-between xs muted"><span>30 days ago</span><span>Today</span></div>
          <div className="comp-meta"><span>Uptime <b>{h?.uptime ?? '—'}</b></span><span>Response <b>{h?.response ?? '—'}</b></span><span>Version <b>{h?.version ?? '—'}</b></span></div>
        </section>;
      })}
    </div>

    <div className="split stretch" style={{ '--split': 'minmax(0, 1fr) minmax(0, 1fr)' } as CSSProperties}>
      <section className="card card-pad stack" aria-labelledby="ai-title">
        <div className="row-between">
          <h2 className="h3" id="ai-title">AI Model</h2>
          {model ? <span className="badge b-good">In production</span> : <span className="badge b-neutral">Not connected</span>}
        </div>
        <div className="grid cols-2" style={{ gap: 12 }}>
          {([['Model', model?.name], ['Last trained', model?.trainedAt], ['Accuracy (test set)', model?.accuracy], ['Mean abs. error', model?.meanError], ['Input parameters', model?.inputs], ['Predictions today', model?.predictionsToday]] as const)
            .map(([label, value]) => <div className="tile" key={label}><span className="tile-label">{label}</span><span className="tile-value">{value ?? '—'}</span></div>)}
        </div>
      </section>
      <section className="card card-pad stack" aria-labelledby="inc-title">
        <h2 className="h3" id="inc-title">Incident Log</h2>
        {!health.incidents.length && <p className="small muted">No incidents recorded.</p>}
        <div className="timeline">
          {health.incidents.map(item => <div key={item.at + item.title}><span className="small muted">{formatDateTime(item.at)}</span><span className="stack-4"><b className="small">{item.title}</b><span className="small text-2">{item.text}</span></span></div>)}
        </div>
      </section>
    </div>
    {toast.element}
  </main>;
}
