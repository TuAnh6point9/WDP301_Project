import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { listStations } from '@/features/stations/api';
import type { Station } from '@/features/stations/types';
import { getCalculation } from '../api';
import { INPUT_FIELDS } from '../inputFields';
import type { Calculation } from '../types';
import { Icon } from '@/components/Icon';

const TILE_LABELS: Record<string, string> = { ph: 'pH', do: 'DO (mg/l)', bod5: 'BOD5 (mg/l)', cod: 'COD (mg/l)', nh4: 'Ammonium (mg/l)', coliform: 'Coliforms' };

export function ResultPage() {
  const id = useSearchParams()[0].get('id');
  const { data, error, reload } = useAsync(() => Promise.all([getCalculation(id), listStations()]), [id]);
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  const [calc, stations] = data;
  if (!calc) return <PageStatus empty="This WQI result was not found. Calculate a new one or open it from your history."/>;
  return <ResultView calc={calc} station={stations.find(item => item.code === calc.station)}/>;
}

function ResultView({ calc, station }: { calc: Calculation; station: Station | undefined }) {
  const q = quality(calc.wqi);
  // Without station history the chart shows only this result as a flat line.
  const trend = station?.trend.length ? station.trend : [calc.wqi, calc.wqi];
  const series = [...trend.slice(0, -1), calc.wqi];
  const delta = calc.wqi - trend[trend.length - 2];
  const max = 100, min = Math.max(0, Math.min(...series) - 10);
  const pts = series.map((v, i) => `${(i / (series.length - 1) * 460).toFixed(1)},${(190 - (v - min) / (max - min) * 170).toFixed(1)}`);
  const warnings = INPUT_FIELDS.filter(field => field.warnAbove !== undefined && calc.inputs[field.key] > field.warnAbove);

  return <main className="container page">
    <div className="page-head">
      <div className="stack-4">
        <Link to="/calculate" className="back-link"><Icon name="back"/>Calculate WQI</Link>
        <h1 className="h1">WQI Result</h1>
      </div>
      <div className="page-actions">
        <Link to="/calculate" className="btn btn-secondary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
          Recalculate
        </Link>
        <Link to="/report" className="btn btn-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>
          Export PDF Report
        </Link>
      </div>
    </div>

    <div className="split stretch">
      {/* SCORE */}
      <section className="card card-pad-lg stack-24">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div className="stack-8">
            <span className="small text-2">Station {calc.station} · Calculated {formatDateTime(calc.at)}</span>
            <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
              <span className="num" style={{ fontSize: 'clamp(56px, 7vw, 76px)', lineHeight: 1, color: 'var(--ink)' }}>{calc.wqi}</span>
              <span className="text-2" style={{ fontSize: 16 }}>/ 100</span>
            </div>
          </div>
          <span className={`badge badge-lg b-${q.key}`}><span className={`dot ${q.key}`}/>{q.label}</span>
        </div>
        <div className="stack-8">
          <div className="scale lg"><i/><i/><i/><i/><i/></div>
          <div className="scale-marker" style={{ '--at': `${calc.wqi}%` } as CSSProperties}/>
          <div className="scale-ticks"><span>0 · Very Poor</span><span>25</span><span>50</span><span>75</span><span>100 · Excellent</span></div>
        </div>
        <hr className="divider"/>
        <div className="stack-12">
          <h2 className="h3">Input Parameters</h2>
          <div className="tiles">
            {INPUT_FIELDS.map(field => <div key={field.key} className={warnings.includes(field) ? 'tile is-warn' : 'tile'}>
              <span className="tile-label">{TILE_LABELS[field.key]}</span>
              <span className="tile-value">{calc.inputs[field.key]}</span>
            </div>)}
          </div>
        </div>
      </section>

      {/* CONTEXT */}
      <div className="stack-24">
        <section className="card card-pad stack">
          <div className="row-between">
            <h2 className="h3">Compared to History at {calc.station}</h2>
            <span className={`badge ${delta >= 0 ? 'b-good' : 'b-poor'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts</span>
          </div>
          <svg className="chart" viewBox="0 0 460 200" preserveAspectRatio="none" style={{ height: 200 }} role="img" aria-label={`WQI history at ${calc.station}`}>
            <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E6E8C" stopOpacity=".2"/><stop offset="1" stopColor="#0E6E8C" stopOpacity="0"/></linearGradient></defs>
            <line className="grid-line" x1="0" y1="30" x2="460" y2="30"/><line className="grid-line" x1="0" y1="90" x2="460" y2="90"/><line className="grid-line" x1="0" y1="150" x2="460" y2="150"/>
            <path className="area" d={`M${pts.join(' L')} L460,200 L0,200 Z`}/>
            <polyline className="line" points={pts.join(' ')}/>
          </svg>
          <div className="scale-ticks"><span>Earlier samples</span><span>This result</span></div>
          <p className="small text-2" style={{ lineHeight: 1.6 }}>
            WQI {delta >= 0 ? 'increased' : 'decreased'} by {Math.abs(delta)} points from the previous measurement, with a <b>{q.label}</b> classification.
          </p>
        </section>
        <section className="card-tint card-pad stack-12">
          <div className="row">
            <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>
            <h2 className="h3">Recommendation</h2>
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {warnings.length
              ? `${warnings.map(field => field.label.split(' — ')[0]).join(', ')} is above the recommended threshold — continued monitoring is advised for upcoming measurements at station ${calc.station}.`
              : `All parameters are within recommended thresholds. Keep the regular monitoring schedule at station ${calc.station}.`}
          </p>
        </section>
      </div>
    </div>
  </main>;
}
