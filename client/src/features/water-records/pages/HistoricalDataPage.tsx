import { messageText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale, localeName, formatNumber } from '@/i18n';
import { USER_MESSAGES as M, getVnWqiQualityClass } from '@wqi/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { batchesOf, DAYS, dateOf, indexOf, isoOf, MEASUREMENT_KEYS, PARAM_KEYS, paramLabel, PARAMS, seriesReader, type ParamKey } from '../series';
import { fmtLong, KeySwatch, SLOT_STYLE, type Slot } from '../components/TrendChart';
import { BatchChart, sharesUnit } from '../components/BatchChart';
import { ParameterTiles } from '../components/ParameterTiles';
import { Icon } from '@/components/Icon';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { listStations } from '@/features/stations/api';
import { getDailySeries } from '../api';
import { printInEnglish } from '@/i18n/printing';

// v2: the chart reads by sampling round over the past year; v1 settings were for a 90-day daily axis.
const SAVE_KEY = 'wqi-trend-config-v2';
// Six slots, one per measurement the model reads; the first one is charted at first.
const defaultSlots = (): Slot[] => MEASUREMENT_KEYS.map((key, index) => ({ key, lo: PARAMS[key].lo, hi: PARAMS[key].hi, on: index === 0 }));
/** Any of the six parameters can be charted together in one plot; at least one stays on. */
function normalize(slots: Slot[]): Slot[] {
  return slots.some(slot => slot.key && slot.on) ? slots : slots.map((slot, i) => ({ ...slot, on: i === slots.findIndex(s => s.key) }));
}
const PAGE = 7;

type Config = { station: string; from: number; to: number; refs: boolean; slots: Slot[] };
function initialConfig(station: string | null, codes: string[]): Config {
  const fallback: Config = { station: 'all', from: 0, to: DAYS - 1, refs: true, slots: defaultSlots() };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Config | null;
    // Settings saved with three slots or retired parameters fall back to the six default slots.
    const current = (slots: unknown) => Array.isArray(slots) && slots.length === MEASUREMENT_KEYS.length && slots.every((slot, i) => slot?.key === MEASUREMENT_KEYS[i]);
    if (saved) Object.assign(fallback, saved, current(saved.slots) ? { slots: normalize(saved.slots) } : { slots: defaultSlots() });
  } catch { /* storage unavailable */ }
  if (station && codes.includes(station)) fallback.station = station;
  if (fallback.station !== 'all' && !codes.includes(fallback.station)) fallback.station = 'all';
  return fallback;
}

export function HistoricalDataPage() {
  useLocale();
  const { data, error, loading, reload } = useAsync(() => Promise.all([getDailySeries(), listStations()]));
  usePageReadiness(error ? 'error' : loading ? 'pending' : 'ready');
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  const [set, stations] = data;
  return <HistoricalData codes={stations.map(s => s.code)} series={seriesReader(set)}/>;
}

function HistoricalData({ codes, series }: { codes: string[]; series: ReturnType<typeof seriesReader> }) {
  useLocale();
  const [params] = useSearchParams();
  const [config, setConfig] = useState<Config>(() => initialConfig(params.get('station'), codes));
  const [draft, setDraft] = useState({ station: config.station, from: isoOf(config.from), to: isoOf(config.to) });
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(1);
  // The settings panel stays folded until asked for, so the chart gets the full width.
  const [panelOpen, setPanelOpen] = useState(false);
  // The toggle hides while the panel (with its own title and close button) is open; focus follows.
  const toggleRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null), panelMoved = useRef(false);
  useEffect(() => {
    if (!panelMoved.current) { panelMoved.current = true; return; }
    (panelOpen ? closeRef : toggleRef).current?.focus();
  }, [panelOpen]);
  const { station, from, to, refs, slots } = config;
  const len = to - from + 1;
  const period = to === DAYS - 1 && [30, 90, 180, 365].includes(len) ? String(len) : 'custom';

  function notify(message: string) { setToast(message); setTimeout(() => setToast(''), 1800); }
  function update(patch: Partial<Config>) { setConfig(previous => ({ ...previous, ...patch })); }
  function updateSlot(n: number, patch: Partial<Slot>) {
    setConfig(previous => ({ ...previous, slots: previous.slots.map((slot, i) => i === n ? { ...slot, ...patch } : slot) }));
  }
  /** A card click adds that parameter to the plot or takes it off; the last charted one stays. */
  function toggle(n: number) {
    setConfig(previous => previous.slots.filter(slot => slot.on).length === 1 && previous.slots[n].on ? previous
      : { ...previous, slots: previous.slots.map((slot, i) => i === n ? { ...slot, on: !slot.on } : slot) });
  }
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
    const rows: (string | number | null)[][] = [['Date', 'Station', ...active.map(slot => paramLabel(slot.key)), 'WQI']];
    for (let i = from; i <= to; i++) rows.push([isoOf(i), station === 'all' ? 'All (mean)' : station, ...active.map(slot => series(station, slot.key)[i]), series(station, 'WQI')[i]]);
    downloadCsv(`wqi-${station}-${isoOf(from)}_${isoOf(to)}.csv`, rows);
    notify('Exported CSV');
  }

  // Table: newest samples first within the selected range.
  const tableStations = station === 'all' ? codes : [station];
  const tableRows: { i: number; st: string }[] = [];
  for (let i = to; i >= from; i--) tableStations.forEach(st => { if (PARAM_KEYS.some(key => series(st, key)[i] !== null)) tableRows.push({ i, st }); });
  const pages = Math.max(1, Math.ceil(tableRows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = tableRows.slice((current - 1) * PAGE, current * PAGE);
  const pageButtons = Array.from({ length: Math.min(3, pages) }, (_, k) => Math.min(Math.max(1, current - 1), Math.max(1, pages - 2)) + k);

  // Rounds are numbered over every station, so round 3 means the same sampling day on every view.
  const allBatches = useMemo(() => batchesOf(codes.flatMap(code => MEASUREMENT_KEYS.flatMap(key => series(code, key).flatMap((v, i) => v === null ? [] : [i])))), [codes, series]);
  const batchOf = new Map(allBatches.map(b => [b.day, b]));
  const batches = allBatches.filter(b => b.day >= from && b.day <= to && (station === 'all' || MEASUREMENT_KEYS.some(key => series(station, key)[b.day] !== null)));
  const charted = slots.flatMap((slot, n) => slot.key && slot.on ? [{ slot, n, key: slot.key }] : []);
  const focus = charted[0];
  const oneUnit = sharesUnit(charted.map(item => item.key));
  const cell = (st: string, key: ParamKey, i: number) => { const v = series(st, key)[i]; return v === null ? '—' : formatNumber(v); };

  return <main className="container page">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('chart.title')}</h1>
        <p className="sub">{msg('chart.description')}</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={exportCsv}><Icon name="download"/>{msg('common.exportExcel')}</button>
        <button type="button" className="btn btn-secondary" onClick={printInEnglish}><Icon name="file"/>{msg('common.exportPdf')}</button>
      </div>
    </div>

    {/* FILTERS */}
    <div className="card card-pad-sm toolbar">
      <div className="field">
        <label className="label" htmlFor="station">{msg('common.station')}</label>
        <select id="station" className="input sm" style={{ width: 180 }} value={draft.station} onChange={event => setDraft({ ...draft, station: event.target.value })}>
          <option value="all">{msg('chart.allStations')}</option>
          {codes.map(code => <option key={code}>{code}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="from">{msg('common.from')}</label>
        <input id="from" type="date" value={draft.from} min={isoOf(0)} max={isoOf(DAYS - 1)} onChange={event => setDraft({ ...draft, from: event.target.value })} className="input sm" style={{ width: 160 }}/>
      </div>
      <div className="field">
        <label className="label" htmlFor="to">{msg('common.to')}</label>
        <input id="to" type="date" value={draft.to} min={isoOf(0)} max={isoOf(DAYS - 1)} onChange={event => setDraft({ ...draft, to: event.target.value })} className="input sm" style={{ width: 160 }}/>
      </div>
      <div className="grow"/>
      <button type="button" className="btn btn-primary" onClick={search}><Icon name="search"/>{msg('common.search')}</button>
    </div>

    {/* TREND CHART */}
    <section className={panelOpen ? 'card trend' : 'card trend panel-closed'} aria-labelledby="trend-title">
      <div className="trend-main">
        <div className="trend-head">
          <div className="stack-4">
            <h2 className="h3" id="trend-title">{station === 'all' ? msg('chart.multiSite') : msg('chart.singleSite', { station })}</h2>
            <p className="small muted">{fmtLong(from)} – {fmtLong(to)} · {msg('chart.batchCount', { count: batches.length })}</p>
          </div>
          <button ref={toggleRef} type="button" className="btn btn-secondary btn-sm" hidden={panelOpen} aria-expanded={panelOpen} aria-controls="trend-panel" onClick={() => setPanelOpen(true)}>
            <Icon name="sliders"/>{msg('chart.settings')}
          </button>
        </div>
        <p className="xs muted tiles-hint">{msg('chart.tilesHint')}</p>
        <ParameterTiles slots={slots} series={series} station={station} from={from} to={to} onSelect={toggle}/>
        {focus && <div className="hero-head">
          <div className="stack-4">
            <h3 className="h3">{charted.map(item => PARAMS[item.key].name).join(' · ')}{oneUnit && PARAMS[focus.key].unit !== PARAMS[focus.key].name && <span className="muted"> ({PARAMS[focus.key].unit})</span>}</h3>
            <div className="bc-legend xs">
              <span><i className="bc-key-line"/>{station === 'all' ? msg('chart.batchMean', { count: codes.length }) : msg('map.stationTitle', { code: station })}</span>
              {charted.length === 1 && station === 'all' && codes.length > 1 && <span><i className="bc-key-band" style={{ background: SLOT_STYLE[focus.n].color }}/>{msg('chart.stationRange')}</span>}
              {refs && oneUnit && <span><i className="bc-key-limit"/>{msg('chart.limitLine')}</span>}
              {refs && <span><i className="bc-key-over"/>{msg('chart.overLimit')}</span>}
            </div>
            {!oneUnit && <p className="xs muted">{msg('chart.relativeNote')}</p>}
          </div>
          {/* Mirrors the cards above: both switch the same parameters on and off. */}
          <div className="hero-compare" role="group" aria-label={msg('chart.compareParameters')}>
            <span className="xs muted">{msg('chart.compare')}</span>
            {slots.map((slot, n) => slot.key && <button key={n} type="button" className="legend-item" aria-pressed={slot.on} aria-label={msg('chart.compareLabel', { name: PARAMS[slot.key].name })} onClick={() => toggle(n)}><KeySwatch index={n}/>{slot.on ? PARAMS[slot.key].name : `+ ${PARAMS[slot.key].name}`}</button>)}
          </div>
        </div>}
        <BatchChart series={series} station={station} codes={codes} batches={batches} refs={refs} slots={slots} label={msg('chart.trendLabel', { parameters: charted.map(item => PARAMS[item.key].name).join(', '), station: station === 'all' ? msg('chart.allStationsLower') : station })}/>
        <div className="trend-foot">
          <p className="xs muted trend-note">{msg('chart.dataNote')}</p>
        </div>
      </div>

      {/* Side column on wide screens; a bottom sheet over a backdrop on narrow ones. */}
      {panelOpen && <div className="trend-backdrop" aria-hidden="true" onClick={() => setPanelOpen(false)}/>}
      <aside className="trend-panel" id="trend-panel" aria-label={msg('chart.settings')} hidden={!panelOpen} onKeyDown={event => { if (event.key === 'Escape') setPanelOpen(false); }}>
        <div className="trend-panel-head">
          <h3 className="trend-panel-title">{msg('chart.settings')}</h3>
          <button ref={closeRef} type="button" className="icon-btn icon-btn-sm" aria-label={msg('common.close')} onClick={() => setPanelOpen(false)}><Icon name="close"/></button>
        </div>
        <div className="trend-panel-body">
          <section className="panel-section" aria-labelledby="panel-display">
            <h4 className="panel-section-title" id="panel-display">{msg('chart.display')}</h4>
            <div className="field">
              <label className="label" htmlFor="period">{msg('chart.timePeriod')}</label>
              <select id="period" className="input sm" value={period} onChange={event => { if (event.target.value !== 'custom') setRange(DAYS - Number(event.target.value), DAYS - 1); }}>
                <option value="30">{msg('chart.month')}</option>
                <option value="90">{msg('chart.months3')}</option>
                <option value="180">{msg('chart.months6')}</option>
                <option value="365">{msg('chart.months12')}</option>
                <option value="custom" hidden>{msg('chart.customRange')}</option>
              </select>
            </div>
            <label className="check"><input type="checkbox" checked={refs} onChange={event => update({ refs: event.target.checked })}/>{msg('chart.referenceLines')}</label>
          </section>

          <section className="panel-section" aria-labelledby="panel-limits">
            <div className="stack-4">
              <h4 className="panel-section-title" id="panel-limits">{msg('chart.allowedLimits')}</h4>
              <p className="xs muted">{msg('chart.defaultLimits')}</p>
            </div>
            {/* One row per parameter: name and unit, then its minimum and maximum. */}
            <div className="param-list" role="group" aria-label={msg('chart.parametersLimits')}>
              <div className="param-row param-head" aria-hidden="true"><span className="param-head-name">{msg('common.parameters')}</span><span>{msg('chart.minimum')}</span><span>{msg('chart.maximum')}</span></div>
              {slots.map((slot, n) => {
                const name = slot.key ? PARAMS[slot.key].name : msg('chart.parameterNumber', { number: n + 1 });
                const unit = slot.key && PARAMS[slot.key].unit !== name ? PARAMS[slot.key].unit : '';
                return <div className="param-row" key={n}>
                  <KeySwatch index={n}/>
                  <span className="param-name">{displayText(name)}{unit && <small>{unit}</small>}</span>
                  {(['lo', 'hi'] as const).map(bound => <input key={bound} type="number" step="any" className="input" placeholder="—" aria-label={msg(bound === 'lo' ? 'common.lowerLabel' : 'common.upperLabel', { name })} value={slot[bound] ?? ''} onChange={event => updateSlot(n, { [bound]: event.target.value === '' ? null : Number(event.target.value) })}/>)}
                </div>;
              })}
            </div>
          </section>
        </div>

        <div className="trend-panel-foot">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfig(previous => ({ ...previous, slots: previous.slots.map(slot => slot.key ? { ...slot, lo: PARAMS[slot.key].lo, hi: PARAMS[slot.key].hi } : slot) }))}>{msg('chart.resetLimits')}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => {
            try { localStorage.setItem(SAVE_KEY, JSON.stringify(config)); notify('Chart settings saved'); } catch { notify(M.SAVE_BROWSER); }
          }}><Icon name="save"/>{msg('chart.saveSettings')}</button>
        </div>
      </aside>
    </section>

    {/* TABLE */}
    <div className="card card-flush">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('chart.batchColumn')}</th><th>{msg('common.date')}</th><th>{msg('common.station')}</th>{MEASUREMENT_KEYS.map(key => <th key={key}>{PARAMS[key].name}</th>)}<th>WQI</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={10} className="muted" style={{ textAlign: 'center', padding: 28 }}>{msg('chart.emptyRange')}</td></tr>}
            {shown.map(({ i, st }) => {
              const wqi = series(st, 'WQI')[i];
              return <tr key={`${st}-${i}`}>
                <td>{batchOf.has(i) ? msg('chart.batch', { number: batchOf.get(i)!.number, year: batchOf.get(i)!.year }) : '—'}</td>
                <td>{dateOf(i).toLocaleDateString(localeName(), { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</td>
                <td>{st}</td>
                {MEASUREMENT_KEYS.map(key => <td key={key}>{cell(st, key, i)}</td>)}
                <td>{wqi === null ? <span className="muted">—</span> : <>{wqi} <ClassificationBadge value={getVnWqiQualityClass(wqi)}/></>}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="small muted">{msg('common.rangeSummary', { start: tableRows.length ? (current - 1) * PAGE + 1 : 0, end: Math.min(current * PAGE, tableRows.length), total: tableRows.length, noun: msg('common.recordsNoun') })}</span>
        <div className="pager">
          <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('common.previous')} disabled={current <= 1} onClick={() => setPage(current - 1)}>‹</button>
          {pageButtons.map(p => <button key={p} type="button" className={p === current ? 'btn btn-secondary btn-sm is-current' : 'btn btn-secondary btn-sm'} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>)}
          <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('common.next')} disabled={current >= pages} onClick={() => setPage(current + 1)}>›</button>
        </div>
      </div>
    </div>
    <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">{messageText(toast)}</div>
  </main>;
}
