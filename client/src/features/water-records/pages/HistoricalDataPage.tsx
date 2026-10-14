import { USER_MESSAGES as M } from '@wqi/contracts';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { DAYS, dateOf, indexOf, isoOf, PARAM_KEYS, PARAMS, seriesReader, type ParamKey } from '../series';
import { exceeds, fmtLong, KeySwatch, TrendChart, type Slot } from '../components/TrendChart';
import { Icon } from '@/components/Icon';
import { getDailySeries } from '../api';
import { listStations } from '@/features/stations/api';

const SAVE_KEY = 'wqi-trend-config';
const defaultSlots = (): Slot[] => (['DO', 'BOD5', 'COD'] as ParamKey[]).map(key => ({ key, lo: PARAMS[key].lo, hi: PARAMS[key].hi, on: true }));
const PAGE = 7;

type Config = { station: string; from: number; to: number; refs: boolean; slots: Slot[] };
function initialConfig(station: string | null, codes: string[]): Config {
  const fallback: Config = { station: 'all', from: DAYS - 90, to: DAYS - 1, refs: true, slots: defaultSlots() };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Config | null;
    if (saved && Array.isArray(saved.slots)) Object.assign(fallback, saved);
  } catch { /* storage unavailable */ }
  if (station && codes.includes(station)) fallback.station = station;
  if (fallback.station !== 'all' && !codes.includes(fallback.station)) fallback.station = 'all';
  return fallback;
}

export function HistoricalDataPage() {
  const { data, error, loading, reload } = useAsync(() => Promise.all([getDailySeries(), listStations()]));
  usePageReadiness(error ? 'error' : loading ? 'pending' : 'ready');
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  const [set, stations] = data;
  return <HistoricalData codes={stations.map(s => s.code).sort()} series={seriesReader(set)}/>;
}

function HistoricalData({ codes, series }: { codes: string[]; series: ReturnType<typeof seriesReader> }) {
  const [params] = useSearchParams();
  const [config, setConfig] = useState<Config>(() => initialConfig(params.get('station'), codes));
  const [draft, setDraft] = useState({ station: config.station, from: isoOf(config.from), to: isoOf(config.to) });
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(1);
  const { station, from, to, refs, slots } = config;
  const len = to - from + 1;
  const period = to === DAYS - 1 && [30, 90, 180, 365].includes(len) ? String(len) : 'custom';

  function notify(message: string) { setToast(message); setTimeout(() => setToast(''), 1800); }
  function update(patch: Partial<Config>) { setConfig(previous => ({ ...previous, ...patch })); }
  function updateSlot(n: number, patch: Partial<Slot>) { setConfig(previous => ({ ...previous, slots: previous.slots.map((slot, i) => i === n ? { ...slot, ...patch } : slot) })); }
  function setRange(a: number, b: number) {
    a = Math.max(0, Math.min(DAYS - 1, a)); b = Math.max(0, Math.min(DAYS - 1, b));
    if (a > b) [a, b] = [b, a];
    update({ from: a, to: b }); setDraft(previous => ({ ...previous, from: isoOf(a), to: isoOf(b) })); setPage(1);
  }
  function search() {
    const a = indexOf(draft.from), b = indexOf(draft.to);
    update({ station: draft.station }); setPage(1);
    if (Number.isFinite(a) && Number.isFinite(b)) setRange(a, b);
  }
  function exportCsv() {
    const active = slots.filter((slot): slot is Slot & { key: ParamKey } => slot.key !== null);
    const rows: (string | number | null)[][] = [['Date', 'Station', ...active.map(slot => `${PARAMS[slot.key].name} (${PARAMS[slot.key].unit})`)]];
    for (let i = from; i <= to; i++) rows.push([isoOf(i), station === 'all' ? 'All (mean)' : station, ...active.map(slot => series(station, slot.key)[i])]);
    downloadCsv(`wqi-${station}-${isoOf(from)}_${isoOf(to)}.csv`, rows);
    notify('Exported CSV');
  }

  // Table: newest samples first within the selected range.
  const tableStations = station === 'all' ? codes : [station];
  const tableRows: { i: number; st: string }[] = [];
  for (let i = to; i >= from; i--) tableStations.forEach(st => { if (series(st, 'pH')[i] !== null) tableRows.push({ i, st }); });
  const pages = Math.max(1, Math.ceil(tableRows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = tableRows.slice((current - 1) * PAGE, current * PAGE);
  const pageButtons = Array.from({ length: Math.min(3, pages) }, (_, k) => Math.min(Math.max(1, current - 1), Math.max(1, pages - 2)) + k);

  const activeSlots = slots.map((slot, n) => ({ slot, n })).filter(({ slot }) => slot.key && slot.on);
  const cell = (st: string, key: ParamKey, i: number) => { const v = series(st, key)[i]; return v === null ? '—' : v; };

  return <main className="container page">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">Historical Water Quality Data</h1>
        <p className="sub">Water quality samples imported from Excel by the administrator.</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={exportCsv}><Icon name="download"/>Export Excel</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}><Icon name="file"/>Export PDF</button>
      </div>
    </div>

    {/* FILTERS */}
    <div className="card card-pad-sm toolbar">
      <div className="field">
        <label className="label" htmlFor="station">Station</label>
        <select id="station" className="input sm" style={{ width: 180 }} value={draft.station} onChange={event => setDraft({ ...draft, station: event.target.value })}>
          <option value="all">All Stations</option>
          {codes.map(code => <option key={code}>{code}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="from">From</label>
        <input id="from" type="date" value={draft.from} min={isoOf(0)} max={isoOf(DAYS - 1)} onChange={event => setDraft({ ...draft, from: event.target.value })} className="input sm" style={{ width: 160 }}/>
      </div>
      <div className="field">
        <label className="label" htmlFor="to">To</label>
        <input id="to" type="date" value={draft.to} min={isoOf(0)} max={isoOf(DAYS - 1)} onChange={event => setDraft({ ...draft, to: event.target.value })} className="input sm" style={{ width: 160 }}/>
      </div>
      <div className="grow"/>
      <button type="button" className="btn btn-primary" onClick={search}><Icon name="search"/>Search</button>
    </div>

    {/* TREND CHART */}
    <section className="card trend" aria-labelledby="trend-title">
      <div className="trend-main">
        <div className="trend-head">
          <div className="stack-4">
            <h2 className="h3" id="trend-title">{station === 'all' ? 'Multi Site: all stations (daily mean)' : `Single Site: ${station}`}</h2>
            <p className="small muted">{fmtLong(from)} – {fmtLong(to)} · {len} days</p>
          </div>
          <div className="trend-legend" aria-label="Series (click to show or hide)">
            {slots.map((slot, n) => slot.key && <button key={n} type="button" className="legend-item" aria-pressed={slot.on} onClick={() => updateSlot(n, { on: !slot.on })}>
              <KeySwatch index={n}/>{PARAMS[slot.key].name} ({PARAMS[slot.key].unit})
            </button>)}
          </div>
        </div>
        <TrendChart series={series} station={station} from={from} to={to} refs={refs} slots={slots} label={`Trend chart for ${station === 'all' ? 'all stations' : station}`}/>
        <div className="trend-foot">
          <div className="trend-summary small text-2">
            {activeSlots.map(({ slot, n }) => {
              const data = series(station, slot.key!);
              let total = 0, count = 0;
              for (let i = from; i <= to; i++) if (data[i] !== null) { total++; if (exceeds(data[i], slot)) count++; }
              return <span key={n}><KeySwatch index={n}/>{PARAMS[slot.key!].name}: <b style={count ? undefined : { color: 'var(--ok)' }}>{count}</b> of {total} samples outside limits</span>;
            })}
          </div>
          <p className="xs muted trend-note">Note: a value of 0 may indicate a result below the method detection limit (MDL). Hover or use ← → keys to read values.</p>
        </div>
      </div>

      <aside className="trend-panel" aria-label="Chart settings">
        <div className="field">
          <label className="label" htmlFor="period">Time Period</label>
          <select id="period" className="input sm" value={period} onChange={event => { if (event.target.value !== 'custom') setRange(DAYS - Number(event.target.value), DAYS - 1); }}>
            <option value="30">Past month</option>
            <option value="90">Past 3 months</option>
            <option value="180">Past 6 months</option>
            <option value="365">Past 12 months</option>
            <option value="custom" hidden>Custom range</option>
          </select>
        </div>
        <label className="check"><input type="checkbox" checked={refs} onChange={event => update({ refs: event.target.checked })}/>Draw reference lines</label>
        <div className="stack-12">
          {slots.map((slot, n) => <div className="param-block" key={n}>
            <label className="label" htmlFor={`p${n}`}><KeySwatch index={n}/>Parameter {n + 1}</label>
            <select id={`p${n}`} className="input sm" value={slot.key || ''} onChange={event => {
              const key = (event.target.value || null) as ParamKey | null;
              updateSlot(n, { key, on: true, lo: key ? PARAMS[key].lo : null, hi: key ? PARAMS[key].hi : null });
            }}>
              <option value="">— None —</option>
              {PARAM_KEYS.map(key => <option key={key} value={key}>{PARAMS[key].name} ({PARAMS[key].unit})</option>)}
            </select>
            <div className="limits">
              {(['lo', 'hi'] as const).map(bound => <div className="field" key={bound}>
                <label className="xs muted" htmlFor={`${bound}${n}`}>{bound === 'lo' ? 'Lower limit' : 'Upper limit'}</label>
                <input id={`${bound}${n}`} type="number" step="any" className="input sm" value={slot[bound] ?? ''} onChange={event => updateSlot(n, { [bound]: event.target.value === '' ? null : Number(event.target.value) })}/>
              </div>)}
            </div>
          </div>)}
        </div>
        <p className="xs muted">Default limits follow QCVN 08-MT:2015/BTNMT (column A2) and can be edited.</p>
        <div className="seg" role="group" aria-label="Chart actions">
          <button type="button" className="on" onClick={() => notify('Chart updated')}><Icon name="chart"/>Chart</button>
          <button type="button" onClick={() => {
            try { localStorage.setItem(SAVE_KEY, JSON.stringify(config)); notify('Chart settings saved'); } catch { notify(M.SAVE_BROWSER); }
          }}><Icon name="save"/>Save</button>
          <button type="button" onClick={exportCsv}><Icon name="download"/>Export</button>
        </div>
      </aside>
    </section>

    {/* TABLE */}
    <div className="card card-flush">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>Station</th><th>pH</th><th>DO</th><th>BOD5</th><th>COD</th><th>Ammonium</th><th>WQI</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 28 }}>No samples in this range.</td></tr>}
            {shown.map(({ i, st }) => {
              return <tr key={`${st}-${i}`}>
                <td>{dateOf(i).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</td>
                <td>{st}</td>
                <td>{cell(st, 'pH', i)}</td><td>{cell(st, 'DO', i)}</td><td>{cell(st, 'BOD5', i)}</td><td>{cell(st, 'COD', i)}</td><td>{cell(st, 'NH4', i)}</td>
                {/* TODO(BE): WQI per sample comes with GET /water-records */}
                <td><span className="muted">—</span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="small muted">Showing {tableRows.length ? (current - 1) * PAGE + 1 : 0}–{Math.min(current * PAGE, tableRows.length)} of {tableRows.length} records</span>
        <div className="pager">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
          {pageButtons.map(p => <button key={p} type="button" className={p === current ? 'btn btn-secondary btn-sm is-current' : 'btn btn-secondary btn-sm'} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>)}
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>
    </div>
    <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">{toast}</div>
  </main>;
}
