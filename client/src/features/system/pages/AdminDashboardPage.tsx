import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { Link } from 'react-router-dom';
import { useAsync } from '@/lib/useAsync';
import { getDashboardSummary, getSystemHealth } from '../api';
import { listUsers } from '@/features/users/api';
import { PageStatus } from '@/components/PageStatus';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

const STATUS_LABEL = { ok: 'Operational', warn: 'Degraded', down: 'Down' } as const;
const COMPONENTS = ['Backend API', 'AI Service', 'Database', 'Map Service'];

export function AdminDashboardPage() {
  const { data: summary, loading, error, reload } = useAsync(getDashboardSummary);
  const { data: health, loading: healthLoading, error: healthError } = useAsync(getSystemHealth);
  const { data: users = [], loading: usersLoading, error: usersError } = useAsync(listUsers);
  usePageReadiness(error ? 'error' : loading ? 'pending' : 'ready');
  const ai = health?.components['AI Service'];
  const count = (value: number | null | undefined) => value ?? '—';
  if (loading || error) return <PageStatus admin error={error} onRetry={reload}/>;
  return <>
    <main className="admin-body">
      <h1 className="h1">Dashboard</h1>
      <div className="grid cols-4">
        <div className="card card-pad-sm stat">
          <span className="stat-label">
            <span className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>
                <circle cx="12" cy="10" r="2.5"/>
              </svg>
            </span>
            Stations
          </span>
          <span className="stat-value">{count(summary?.stations)}</span>
        </div>
        <div className="card card-pad-sm stat">
          <span className="stat-label">
            <span className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="8" ry="3"/>
                <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/>
                <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>
              </svg>
            </span>
            Data Records
          </span>
          <span className="stat-value">{count(summary?.records)}</span>
        </div>
        <div className="card card-pad-sm stat">
          <span className="stat-label">
            <span className="stat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="3" width="14" height="18" rx="2"/>
                <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>
              </svg>
            </span>
            WQI Calculations Today
          </span>
          <span className="stat-value c-brand">{count(summary?.calculationsToday)}</span>
        </div>
        <div className="card card-pad-sm stat">
          <span className="stat-label">
            <span className="stat-icon" style={{ background: "#E3F5EA", color: "var(--ok)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>
            </span>
            AI Service
          </span>
          <span className="stat-value sm" style={{ paddingBlock: "4px" }}><span className={`status ${ai?.status ?? 'off'}`} style={{ font: "inherit" }}>{ai ? STATUS_LABEL[ai.status] : 'Unknown'}</span></span>
        </div>
      </div>
      <div className="split stretch">
        {/* IMPORT */}
        <section className="card card-pad stack" id="import">
          <div className="row-between">
            <h2 className="h3">Import Historical Data from Excel</h2>
            <Link to="/admin/import" className="link small">Open import page</Link>
          </div>
          <Link to="/admin/import" className="dropzone">
            <span className="dropzone-ic">
              <svg className="i-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5"/>
                <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>
              </svg>
            </span>
            <b style={{ fontSize: "14px" }}>Drag and drop an .xlsx file here</b>
            <span className="xs muted">or</span>
            <span className="btn btn-primary btn-sm" style={{ padding: "0 14px" }}>Choose File</span>
          </Link>
          <p className="small text-2">Validate an .xlsx file and import its valid rows from the import page. Results and error reports appear there.</p>
          <Link to="/admin/import" className="btn btn-primary">Open Import Page</Link>
        </section>
        <div className="stack-24">
          {/* USERS */}
          <section className="card card-pad stack">
            <div className="row-between">
              <h2 className="h3">Recent Users</h2>
              <Link to="/admin/users" className="link small">View all</Link>
            </div>
            <div>
              {usersLoading ? <LoadingIndicator scope="inline"/> : usersError ? <p role="alert">{userErrorMessage(usersError, M.LOAD_FAILED)}</p> : !users.length && <p className="small muted">No user accounts yet.</p>}
              {users.slice(0, 3).map(user => <div className="list-row" key={user.email}>
                <span className="row">
                  <span className="avatar sm">{user.initials}</span>
                  <b style={{ fontSize: "13.5px" }}>{user.name}</b>
                </span>
                {user.role === 'Admin'
                  ? <span className="badge b-dark" style={{ fontSize: "11px" }}>Admin · {user.platform}</span>
                  : <span className="xs muted">User · {user.platform}</span>}
              </div>)}
            </div>
          </section>
          {/* STATUS */}
          <section className="card card-pad stack grow" id="status">
            <div className="row-between">
              <h2 className="h3">System Component Status</h2>
              <Link to="/admin/status" className="link small">Details</Link>
            </div>
            <div>
              {healthLoading && <LoadingIndicator scope="inline"/>}
              {healthError && <p role="alert">{userErrorMessage(healthError, M.LOAD_FAILED)}</p>}
              {COMPONENTS.map(name => {
                const h = health?.components[name];
                return <div className="list-row" key={name}>
                  <span style={{ fontSize: "13.5px" }}>{name}</span>
                  {h ? <span className={`status ${h.status}`}>{STATUS_LABEL[h.status]}</span> : <span className="status off">Unknown</span>}
                </div>;
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  </>;
}
