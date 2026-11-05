import { messageText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale, formatNumber } from '@/i18n';
import { USER_MESSAGES as M, getVnWqiQualityClass } from '@wqi/contracts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { clientPage } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Pager } from '@/components/Pager';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { MEASUREMENT_KEYS, paramLabel, PARAMS, roundLabel, roundPoints, type ParamKey, type Round, type Sample } from '../series';
import { exceeds, KeySwatch, SLOT_STYLE, type Slot } from '../components/TrendChart';
import { BatchChart, sharesUnit } from '../components/BatchChart';
import { ParameterTiles } from '../components/ParameterTiles';
import { Icon } from '@/components/Icon';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { listStations } from '@/features/stations/api';
import { getSamples } from '../api';
import { printInEnglish } from '@/i18n/printing';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

// v3: the chart reads by batch code; v2 settings had the old parameter order.
const SAVE_KEY = 'wqi-trend-config-v3';
/** Six slots in display order (Coliform, Amoni, pH, Phosphat, DO, COD); the first one is charted at first. */
const defaultSlots = (): Slot[] => MEASUREMENT_KEYS.map((key, index) => ({ key, lo: PARAMS[key].lo, hi: PARAMS[key].hi, on: index === 0 }));
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `focus` is the slot the cards chart; slots also on are compared with it. `from`/`to` are round keys, null for the first/last round. */
type Config = { station: string; from: string | null; to: string | null; refs: boolean; focus: number; slots: Slot[] };
function initialConfig(station: string | null, codes: string[]): Config {
  const config: Config = { station: 'all', from: null, to: null, refs: true, focus: 0, slots: defaultSlots() };
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<Config> | null;
    const current = Array.isArray(saved?.slots) && saved.slots.length === MEASUREMENT_KEYS.length && saved.slots.every((slot, i) => slot?.key === MEASUREMENT_KEYS[i]);
    if (saved && current) {
      const focus = Number.isInteger(saved.focus) && saved.focus! >= 0 && saved.focus! < MEASUREMENT_KEYS.length ? saved.focus! : 0;
      Object.assign(config, { refs: saved.refs !== false, focus, slots: saved.slots!.map((slot, i) => ({ ...slot, on: i === focus || slot.on })) });
    }
  } catch { /* storage unavailable */ }
  if (station && codes.includes(station)) config.station = station;
  return config;
}

export function HistoricalDataPage() {
  useLocale();
  const { data, error, loading, reload } = useAsync(() => Promise.all([getSamples(), listStations()]));
  usePageReadiness(error ? 'error' : loading ? 'pending' : 'ready');
  if (!data) return <main className="container page">
    <div className="page-head"><h1 className="h1">{msg('chart.title')}</h1><FeatureGuide id="chart" stage="overview" autoStart={false} ready={!loading}/></div>
    <PageStatus inline error={error} onRetry={reload}/>
  </main>;
  const [{ rounds, samples }, stations] = data;
  return <HistoricalData codes={stations.map(s => s.code)} rounds={rounds} samples={samples}/>;
}

function HistoricalData({ codes, rounds, samples }: { codes: string[]; rounds: Round[]; samples: Sample[] }) {
  useLocale();
  const [params] = useSearchParams();
  const [config, setConfig] = useState<Config>(() => initialConfig(params.get('station'), codes));
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(1);
  // The settings panel stays folded until asked for, so the chart gets the full width.
  const [panelOpen, setPanelOpen] = useState(false);
  const panelBeforeGuide = useRef<boolean | undefined>(undefined);
  const guideOwnsPanelFocus = useRef(false);
  function guidePanel(next: boolean) {
    if (next === panelOpen) return;
    guideOwnsPanelFocus.current = true;
    setPanelOpen(next);
  }
  function guideStep(index: number) {
    panelBeforeGuide.current ??= panelOpen;
    guidePanel(index === 4 ? true : panelBeforeGuide.current);
  }
  function guideExit() {
    if (panelBeforeGuide.current !== undefined) guidePanel(panelBeforeGuide.current);
    panelBeforeGuide.current = undefined;
  }
  // The toggle hides while the panel (with its own title and close button) is open; focus follows.
  const toggleRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null), panelMoved = useRef(false);
  useEffect(() => {
    if (!panelMoved.current) { panelMoved.current = true; return; }
    if (guideOwnsPanelFocus.current) { guideOwnsPanelFocus.current = false; return; }
    (panelOpen ? closeRef : toggleRef).current?.focus();
  }, [panelOpen]);
  const { station, refs, slots, focus } = config;

  // Switching parameter slides the new chart in from the side it sits on in the order Coliform → … → COD.
  const stageRef = useRef<HTMLDivElement>(null), shownFocus = useRef(focus);
  useLayoutEffect(() => {
    const previous = shownFocus.current, stage = stageRef.current;
    shownFocus.current = focus;
    if (previous === focus || !stage || typeof stage.animate !== 'function' || reducedMotion()) return;
    const offset = focus > previous ? 48 : -48;
    stage.animate([{ opacity: 0, transform: `translateX(${offset}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }, [focus]);

  // The rounds a station was sampled in; every round for all stations.
  const stationSamples = useMemo(() => station === 'all' ? samples : samples.filter(sample => sample.station === station), [samples, station]);
  const stationRounds = useMemo(() => { const keys = new Set(stationSamples.map(sample => sample.round)); return rounds.filter(round => keys.has(round.key)); }, [rounds, stationSamples]);
  const position = (key: string | null, fallback: number) => { const at = stationRounds.findIndex(round => round.key === key); return at < 0 ? fallback : at; };
  const first = position(config.from, 0), last = position(config.to, stationRounds.length - 1);
  const shownRounds = stationRounds.slice(Math.min(first, last), Math.max(first, last) + 1);
  const narrowed = shownRounds.length < stationRounds.length;
  const shownKeys = new Set(shownRounds.map(round => round.key));
  const shownSamples = stationSamples.filter(sample => shownKeys.has(sample.round));
  const points = roundPoints(shownRounds, shownSamples);

  function notify(message: string) { setToast(message); setTimeout(() => setToast(''), 1800); }
  function update(patch: Partial<Config>) { setConfig(previous => ({ ...previous, ...patch })); setPage(1); }
  function updateSlot(n: number, patch: Partial<Slot>) {
    setConfig(previous => ({ ...previous, slots: previous.slots.map((slot, i) => i === n ? { ...slot, ...patch } : slot) }));
  }
  /** A card charts its parameter alone. */
  function select(n: number) {
    setConfig(previous => ({ ...previous, focus: n, slots: previous.slots.map((slot, i) => ({ ...slot, on: i === n })) }));
  }
  /** A Compare button adds its parameter to the charted one or takes it off. */
  function compare(n: number) {
    setConfig(previous => n === previous.focus ? previous : { ...previous, slots: previous.slots.map((slot, i) => i === n ? { ...slot, on: !slot.on } : slot) });
  }
  /** Picking a start after the end (or an end before the start) moves the other end with it. */
  function pickRound(end: 'from' | 'to', key: string) {
    const at = position(key, 0);
    update(end === 'from' ? { from: key, to: at > last ? key : config.to } : { to: key, from: at < first ? key : config.from });
  }

  // Table: one row per sample, newest round first.
  const order = new Map(rounds.map((round, i) => [round.key, i]));
  const tableRows = [...shownSamples].sort((a, b) => order.get(b.round)! - order.get(a.round)! || a.station.localeCompare(b.station, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const { rows: shown, meta } = clientPage(tableRows, page);
  const roundOf = new Map(rounds.map(round => [round.key, round]));

  function exportCsv() {
    const rows: (string | number | null)[][] = [['Batch', 'Station', ...MEASUREMENT_KEYS.map(paramLabel), 'WQI']];
    for (const sample of tableRows) rows.push([roundLabel(roundOf.get(sample.round)!), sample.station, ...MEASUREMENT_KEYS.map(key => sample.values[key]), sample.wqi]);
    const span = shownRounds.length ? `${roundLabel(shownRounds[0])}_${roundLabel(shownRounds.at(-1)!)}`.replaceAll('/', '-') : 'empty';
    downloadCsv(`wqi-${station}-${span}.csv`, rows);
    notify('Exported CSV');
  }

  const charted = slots.flatMap((slot, n) => slot.key && slot.on ? [{ slot, n, key: slot.key }] : []);
  const main = slots[focus], mainKey = main.key as ParamKey;
  const oneUnit = sharesUnit(charted.map(item => item.key));

  return <main className="container page">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('chart.title')}</h1>
        <p className="sub">{msg('chart.description')}</p>
      </div>
      <div className="page-actions">
        <FeatureGuide id="chart" stage="overview" onStepChange={guideStep} onExit={guideExit}/>
        <button type="button" className="btn btn-secondary" onClick={exportCsv}><Icon name="download"/>{msg('report.csv')}</button>
        <button type="button" className="btn btn-secondary" onClick={printInEnglish}><Icon name="file"/>{msg('common.exportPdf')}</button>
      </div>
    </div>

    {/* FILTERS: every change applies at once. */}
    <div className="card card-pad-sm toolbar" data-tour="chart-filters">
      <div className="field">
        <label className="label" htmlFor="station">{msg('common.station')}</label>
        <select id="station" className="input sm" style={{ width: 180 }} value={station} onChange={event => update({ station: event.target.value, from: null, to: null })}>
          <option value="all">{msg('chart.allStations')}</option>
          {codes.map(code => <option key={code}>{code}</option>)}
        </select>
      </div>
      {(['from', 'to'] as const).map(end => <div className="field" key={end}>
        <label className="label" htmlFor={`${end}-batch`}>{msg(end === 'from' ? 'chart.fromBatch' : 'chart.toBatch')}</label>
        <select id={`${end}-batch`} className="input sm" style={{ width: 180 }} disabled={!stationRounds.length}
          value={stationRounds[end === 'from' ? Math.min(first, last) : Math.max(first, last)]?.key ?? ''} onChange={event => pickRound(end, event.target.value)}>
          {!stationRounds.length && <option value="">{msg('chart.noBatchesShort')}</option>}
          {stationRounds.map(round => <option key={round.key} value={round.key}>{roundLabel(round)}</option>)}
        </select>
      </div>)}
      {narrowed && <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ from: null, to: null })}>{msg('chart.allBatches')}</button>}
    </div>

    {/* TREND CHART */}
    <section className={panelOpen ? 'card trend' : 'card trend panel-closed'} aria-labelledby="trend-title">
      <div className="trend-main">
        <div className="trend-head" data-tour="chart-rounds">
          <div className="stack-4">
            <h2 className="h3" id="trend-title">{station === 'all' ? msg('chart.multiSite') : msg('chart.singleSite', { station })}</h2>
            <p className="small muted">{points.length ? `${points[0].label} – ${points.at(-1)!.label} · ` : ''}{msg('chart.batchCount', { count: points.length })} · {msg('chart.sampleCount', { count: tableRows.length })}</p>
          </div>
          <button ref={toggleRef} type="button" className="btn btn-secondary btn-sm" hidden={panelOpen} aria-expanded={panelOpen} aria-controls="trend-panel" onClick={() => setPanelOpen(true)}>
            <Icon name="sliders"/>{msg('chart.settings')}
          </button>
        </div>
        <div data-tour="chart-parameters"><ParameterTiles slots={slots} points={points} focus={focus} onSelect={select}/></div>
        <div className="bc-stage" ref={stageRef}>
          <div className="hero-head">
            <div className="stack-4">
              <h3 className="h3">{charted.map(item => PARAMS[item.key].name).join(' · ')}{oneUnit && PARAMS[mainKey].unit !== PARAMS[mainKey].name && <span className="muted"> ({PARAMS[mainKey].unit})</span>}</h3>
              <div className="bc-legend xs">
                <span><i className="bc-key-line"/>{msg('chart.batchMean')}</span>
                {charted.length === 1 && <span><i className="bc-key-band" style={{ background: SLOT_STYLE[focus].color }}/>{msg('chart.sampleRange')}</span>}
                {refs && oneUnit && <span><i className="bc-key-limit"/>{msg('chart.limitLine')}</span>}
                {refs && <span><i className="bc-key-over"/>{msg('chart.overLimit')}</span>}
              </div>
              {!oneUnit && <p className="xs muted">{msg('chart.relativeNote')}</p>}
            </div>
            <div className="hero-compare" data-tour="chart-comparison" role="group" aria-label={msg('chart.compareParameters')}>
              <span className="xs muted">{msg('chart.compareWith')}</span>
              {slots.map((slot, n) => slot.key && n !== focus && <button key={n} type="button" className="legend-item" aria-pressed={slot.on} aria-label={msg('chart.compareLabel', { name: PARAMS[slot.key].name })} onClick={() => compare(n)}><KeySwatch index={n}/>{slot.on ? PARAMS[slot.key].name : `+ ${PARAMS[slot.key].name}`}</button>)}
            </div>
          </div>
          <div data-tour="chart-plot"><BatchChart points={points} refs={refs} slots={slots} label={msg('chart.trendLabel', { parameters: charted.map(item => PARAMS[item.key].name).join(', '), station: station === 'all' ? msg('chart.allStationsLower') : station })}/></div>
        </div>
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
        <div className="trend-panel-body" data-tour="chart-settings">
          <section className="panel-section" aria-labelledby="panel-display">
            <h4 className="panel-section-title" id="panel-display">{msg('chart.display')}</h4>
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
            try { localStorage.setItem(SAVE_KEY, JSON.stringify({ refs, focus, slots })); notify('Chart settings saved'); } catch { notify(M.SAVE_BROWSER); }
          }}><Icon name="save"/>{msg('chart.saveSettings')}</button>
        </div>
      </aside>
    </section>

    {/* TABLE: the charted parameter's column is highlighted; values outside their limit are flagged. */}
    <div className="card card-flush" data-tour="chart-table">
      <div className="table-wrap">
        <table className="table hd-table">
          <thead><tr><th>{msg('chart.batchColumn')}</th><th>{msg('common.station')}</th>{MEASUREMENT_KEYS.map((key, n) => <th key={key} className={n === focus ? 'is-focus' : undefined}>{PARAMS[key].name}</th>)}<th>WQI</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 28 }}>{msg('chart.emptyRange')}</td></tr>}
            {shown.map(sample => <tr key={sample.id}>
              <td>{roundLabel(roundOf.get(sample.round)!)}</td>
              <td>{sample.station}</td>
              {MEASUREMENT_KEYS.map((key, n) => {
                const over = refs && exceeds(sample.values[key], slots[n]);
                return <td key={key} className={[n === focus && 'is-focus', over && 'hd-over'].filter(Boolean).join(' ') || undefined}>{over && <span className="sr-only">{msg('chart.overLimit')}: </span>}{formatNumber(sample.values[key])}</td>;
              })}
              <td>{sample.wqi === null ? <span className="muted">—</span> : <>{formatNumber(sample.wqi)} <ClassificationBadge value={getVnWqiQualityClass(sample.wqi)}/></>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={meta} noun="records" onPage={setPage}/>
    </div>
    <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">{messageText(toast)}</div>
  </main>;
}
