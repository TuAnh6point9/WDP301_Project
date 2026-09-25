import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { listCalculations } from '../api';
import type { Calculation } from '../types';

const PAGE = 6;

export function HistoryPage() {
  const { data, error, reload } = useAsync(listCalculations);
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  return <HistoryView all={data}/>;
}

function HistoryView({ all }: { all: Calculation[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const rows = all.filter(item => (!from || item.at.slice(0, 10) >= from) && (!to || item.at.slice(0, 10) <= to));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const average = rows.length ? (rows.reduce((sum, item) => sum + item.wqi, 0) / rows.length).toFixed(1) : '—';
  const goodShare = rows.length ? `${Math.round(rows.filter(item => item.wqi >= 76).length / rows.length * 100)}%` : '—';
  const last = all[0];

  function exportCsv() {
    downloadCsv('wqi-calculation-history.csv', [['Calculated At', 'Station', 'pH', 'DO', 'BOD5', 'COD', 'Ammonium', 'Coliforms', 'WQI', 'Classification'],
      ...rows.map(item => [item.at.replace('T', ' '), item.station, item.inputs.ph, item.inputs.do, item.inputs.bod5, item.inputs.cod, item.inputs.nh4, item.inputs.coliform, item.wqi, quality(item.wqi).label])]);
  }

  return <main className="container page">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">WQI Calculation History</h1>
        <p className="sub">All WQI calculations performed, including input parameters and results.</p>
      </div>
      <div className="toolbar" style={{ alignItems: 'center', gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} className="input sm" style={{ width: 150 }} aria-label="From date"/>
          <span className="small muted">to</span>
          <input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} className="input sm" style={{ width: 150 }} aria-label="To date"/>
        </div>
        <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!rows.length}><Icon name="download"/>Export Excel</button>
      </div>
    </div>

    <div className="grid cols-4">
      <div className="card card-pad-sm stat">
        <span className="stat-label"><span className="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></svg></span>Total Calculations</span>
        <span className="stat-value">{rows.length}</span>
      </div>
      <div className="card card-pad-sm stat">
        <span className="stat-label"><span className="stat-icon"><Icon name="drop"/></span>Average WQI</span>
        <span className="stat-value c-brand">{average}</span>
      </div>
      <div className="card card-pad-sm stat">
        <span className="stat-label"><span className="stat-icon" style={{ background: '#E3F5EA', color: 'var(--ok)' }}><Icon name="check"/></span>&quot;Good&quot; or Above</span>
        <span className="stat-value c-ok">{goodShare}</span>
      </div>
      <div className="card card-pad-sm stat">
        <span className="stat-label"><span className="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>Last Calculation</span>
        <span className="stat-value sm" style={{ paddingBlock: 4 }}>{last ? formatDateTime(last.at) : '—'}</span>
      </div>
    </div>

    <div className="card card-flush">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Calculated At</th><th>Station</th><th>pH</th><th>DO</th><th>BOD5</th><th>COD</th><th>Ammonium</th><th>Coliforms</th><th>WQI</th><th>Classification</th><th className="t-right">Action</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 28 }}>No calculations in this date range.</td></tr>}
            {shown.map(item => {
              const q = quality(item.wqi);
              return <tr key={item.id}>
                <td>{formatDateTime(item.at)}</td>
                <td>{item.station}</td>
                <td>{item.inputs.ph}</td><td>{item.inputs.do}</td><td>{item.inputs.bod5}</td><td>{item.inputs.cod}</td><td>{item.inputs.nh4}</td><td>{item.inputs.coliform}</td>
                <td className="strong">{item.wqi}</td>
                <td><span className={`badge b-${q.key}`}>{q.label}</span></td>
                <td className="t-right"><Link to={`/result?id=${item.id}`} className="link small">View</Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="small muted">Showing {rows.length ? (current - 1) * PAGE + 1 : 0}–{Math.min(current * PAGE, rows.length)} of {rows.length} calculations</span>
        <div className="pager">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
          {Array.from({ length: pages }, (_, index) => <button key={index} type="button" className={index + 1 === current ? 'btn btn-secondary btn-sm is-current' : 'btn btn-secondary btn-sm'} aria-current={index + 1 === current ? 'page' : undefined} onClick={() => setPage(index + 1)}>{index + 1}</button>)}
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>
    </div>
  </main>;
}
