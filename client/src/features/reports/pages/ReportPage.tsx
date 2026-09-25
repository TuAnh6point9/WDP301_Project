import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { formatDate, isoDaysAgo } from '@/lib/format';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { listCalculations } from '@/features/predictions/api';
import type { Calculation } from '@/features/predictions/types';
import { listStations } from '@/features/stations/api';
import type { Station } from '@/features/stations/types';
import { Brand } from '@/components/Brand';

const TYPES = ['Calculation history summary', 'Single WQI result', 'Historical data range'];
const SECTIONS = [['trend', 'WQI trend chart', true], ['table', 'Input parameters table', true], ['summary', 'Classification summary', true], ['tips', 'Recommendations', false]] as const;
const CLASS_COLOR: Record<string, string> = { exc: '#1E5FA8', good: 'var(--ok)', fair: '#8A6A00', poor: 'var(--warn)', vpoor: 'var(--danger)' };

export function ReportPage() {
  const { data, error, reload } = useAsync(() => Promise.all([listCalculations(), listStations()]));
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  return <ReportBuilder calculations={data[0]} stations={data[1]}/>;
}

function ReportBuilder({ calculations, stations }: { calculations: Calculation[]; stations: Station[] }) {
  const [type, setType] = useState(TYPES[0]);
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [station, setStation] = useState('');
  const [include, setInclude] = useState<Record<string, boolean>>(Object.fromEntries(SECTIONS.map(([key, , on]) => [key, on])));
  const rows = calculations.filter(item => (!station || item.station === station) && item.at.slice(0, 10) >= from && item.at.slice(0, 10) <= to);
  const average = rows.length ? (rows.reduce((sum, item) => sum + item.wqi, 0) / rows.length).toFixed(1) : '—';
  const goodShare = rows.length ? `${Math.round(rows.filter(item => item.wqi >= 76).length / rows.length * 100)}%` : '—';
  const series = [...rows].reverse().map(item => item.wqi);
  const pts = series.map((v, i) => `${series.length === 1 ? 266 : (i / (series.length - 1) * 532).toFixed(1)},${(115 - v / 100 * 105).toFixed(1)}`);

  return <main className="container page">
    <div className="stack-4">
      <Link to="/history" className="back-link"><Icon name="back"/>History</Link>
      <h1 className="h1">Export Report</h1>
      <p className="sub">Build a WQI report from calculation history or historical data, then download as PDF or Excel.</p>
    </div>
    <div className="report-layout">
      {/* OPTIONS PANEL */}
      <aside className="card card-pad stack-24 report-options">
        <div className="stack-8" role="radiogroup" aria-label="Report type">
          <span className="label-caps">Report type</span>
          {TYPES.map(item => <div key={item} role="radio" tabIndex={0} aria-checked={type === item} className={type === item ? 'opt active' : 'opt'} onClick={() => setType(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setType(item); } }}>{item}</div>)}
        </div>
        <div className="stack-8">
          <span className="label-caps">Date range</span>
          <div className="grid cols-2" style={{ gap: 8 }}>
            <input type="date" value={from} onChange={event => setFrom(event.target.value)} className="input sm" aria-label="From date"/>
            <input type="date" value={to} onChange={event => setTo(event.target.value)} className="input sm" aria-label="To date"/>
          </div>
        </div>
        <div className="stack-8">
          <label className="label-caps" htmlFor="station">Station</label>
          <select id="station" className="input sm" value={station} onChange={event => setStation(event.target.value)}>
            <option value="">All Stations</option>
            {stations.map(item => <option key={item.code}>{item.code}</option>)}
          </select>
        </div>
        <div className="stack-12">
          <span className="label-caps">Include in report</span>
          {SECTIONS.map(([key, label]) => <label key={key} className="check"><input type="checkbox" checked={include[key]} onChange={event => setInclude(previous => ({ ...previous, [key]: event.target.checked }))}/>{label}</label>)}
        </div>
        <hr className="divider"/>
        <div className="stack-8">
          <span className="label-caps">Download</span>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}><Icon name="download"/>PDF</button>
            <button type="button" className="btn btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('wqi-report.csv', [['Date', 'Station', 'WQI', 'Class'], ...rows.map(item => [item.at.slice(0, 10), item.station, item.wqi, quality(item.wqi).label])])}><Icon name="download"/>Excel</button>
          </div>
        </div>
      </aside>

      {/* PREVIEW PANEL */}
      <section className="preview-stage" aria-label="Report preview">
        <article className="paper">
          <div className="row-between" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16 }}>
            <div className="brand" style={{ fontSize: 14 }}><Brand small/>WQI An Kim Hai</div>
            <span className="muted" style={{ fontSize: 11 }}>Generated {formatDate(new Date().toISOString())}</span>
          </div>
          <div className="stack-4">
            <h2 className="num" style={{ fontSize: 20 }}>{type === TYPES[0] ? 'WQI Calculation History Report' : type === TYPES[1] ? 'WQI Result Report' : 'Historical Data Report'}</h2>
            <p className="small text-2">{formatDate(from)} – {formatDate(to)} · {station || 'All Stations'} · {rows.length} calculations</p>
          </div>
          {include.summary && <div className="tiles">
            <div className="tile"><span className="tile-label">Average WQI</span><span className="num c-brand" style={{ fontSize: 20 }}>{average}</span></div>
            <div className="tile"><span className="tile-label">&quot;Good&quot; or Above</span><span className="num c-ok" style={{ fontSize: 20 }}>{goodShare}</span></div>
            <div className="tile"><span className="tile-label">Total Records</span><span className="num" style={{ fontSize: 20 }}>{rows.length}</span></div>
          </div>}
          {include.trend && series.length > 0 && <div className="stack-8">
            <h3 className="h4">WQI Trend</h3>
            <svg className="chart" viewBox="0 0 532 120" preserveAspectRatio="none" style={{ height: 120 }} role="img" aria-label="WQI trend">
              <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E6E8C" stopOpacity=".18"/><stop offset="1" stopColor="#0E6E8C" stopOpacity="0"/></linearGradient></defs>
              <path className="area" d={`M${pts.join(' L')} L532,120 L0,120 Z`}/>
              <polyline className="line" style={{ strokeWidth: 2.5 }} points={pts.join(' ')}/>
            </svg>
          </div>}
          {include.table && <div className="stack-8">
            <h3 className="h4">Recent Calculations</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Station</th><th>WQI</th><th>Class</th></tr></thead>
                <tbody>
                  {!rows.length && <tr><td colSpan={4} className="muted">No calculations for these filters.</td></tr>}
                  {rows.slice(0, 8).map(item => {
                    const q = quality(item.wqi);
                    return <tr key={item.id}><td>{formatDate(item.at)}</td><td>{item.station}</td><td className="strong">{item.wqi}</td><td className="strong" style={{ color: CLASS_COLOR[q.key] }}>{q.label}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>}
          {include.tips && <div className="stack-8">
            <h3 className="h4">Recommendations</h3>
            <p className="small text-2">Continue monitoring stations with WQI below 76 and review Ammonium values above 0.3 mg/l.</p>
          </div>}
          <hr className="divider"/>
          <p className="muted" style={{ fontSize: 10.5, textAlign: 'center' }}>WQI An Kim Hai · Historical data — no real-time sensor connection · Page 1 of 1</p>
        </article>
      </section>
    </div>
  </main>;
}
