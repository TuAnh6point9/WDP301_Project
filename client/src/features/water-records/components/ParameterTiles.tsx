import type { CSSProperties } from 'react';
import { dateOf, PARAMS, type ParamKey, type SeriesReader } from '../series';
import { exceeds, fmtValue, SLOT_STYLE, type Slot } from './TrendChart';

const fmtDay = (i: number) => dateOf(i).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Latest sample against its QCVN limit: icon + label, never colour alone. */
function status(v: number | null, slot: Slot) {
  if (v === null) return { tone: 'none', text: 'No data' };
  if (slot.lo !== null && v < slot.lo) return { tone: 'bad', text: `▼ Below ${slot.lo}` };
  if (slot.hi !== null && v > slot.hi) return { tone: 'bad', text: `▲ Above ${slot.hi}` };
  if (slot.lo === null && slot.hi === null) return { tone: 'none', text: 'No limit set' };
  return { tone: 'ok', text: '✓ Within limit' };
}

/** Change since the previous sample, coloured by whether that direction means cleaner water. */
function delta(latest: [number, number] | undefined, previous: [number, number] | undefined, key: ParamKey) {
  if (!latest || !previous) return null;
  const change = latest[1] - previous[1];
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '→';
  const better = PARAMS[key].better;
  const tone = !change || !better ? 'flat' : (change > 0) === (better === 'up') ? 'good' : 'bad';
  return { tone, text: `${arrow} ${fmtValue(Math.abs(change), key)} vs ${fmtDay(previous[0])}` };
}

function Sparkline({ pts, from, to, color }: { pts: [number, number][]; from: number; to: number; color: string }) {
  if (pts.length < 2) return <svg className="pt-spark" aria-hidden="true"/>;
  const values = pts.map(([, v]) => v), min = Math.min(...values), max = Math.max(...values);
  const sx = (i: number) => ((i - from) / Math.max(1, to - from) * 100).toFixed(2);
  const sy = (v: number) => (max === min ? 14 : 26 - (v - min) / (max - min) * 24).toFixed(2);
  const line = pts.map(([i, v]) => `${sx(i)},${sy(v)}`).join(' ');
  return <svg className="pt-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
    <polygon points={`${sx(pts[0][0])},28 ${line} ${sx(pts[pts.length - 1][0])},28`} fill={color} fillOpacity=".1"/>
    <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

/** One card per parameter slot; the pressed cards are drawn on the large chart below. */
export function ParameterTiles({ slots, series, station, from, to, onSelect }: { slots: Slot[]; series: SeriesReader; station: string; from: number; to: number; onSelect: (index: number) => void }) {
  return <div className="param-tiles" role="group" aria-label="Parameters (select one to chart)">
    {slots.map((slot, index) => {
      if (!slot.key) return null;
      const key = slot.key, data = series(station, key);
      const pts: [number, number][] = [];
      for (let i = from; i <= to; i++) { const v = data[i]; if (v !== null) pts.push([i, v]); }
      const latest = pts[pts.length - 1], state = status(latest?.[1] ?? null, slot), change = delta(latest, pts[pts.length - 2], key);
      const over = pts.filter(([, v]) => exceeds(v, slot)).length;
      const color = SLOT_STYLE[index].color;
      return <button key={index} type="button" className="param-tile" aria-pressed={slot.on} style={{ '--tile-color': color } as CSSProperties} onClick={() => onSelect(index)}>
        <span className="pt-head"><i/>{PARAMS[key].name}{PARAMS[key].unit !== PARAMS[key].name && <span className="pt-unit">{PARAMS[key].unit}</span>}</span>
        <span className="pt-value">{fmtValue(latest?.[1] ?? null, key)}</span>
        <span className={`pt-delta ${change?.tone ?? 'flat'}`}>{change?.text ?? (latest ? `Sampled ${fmtDay(latest[0])}` : 'No samples in period')}</span>
        <span className="pt-foot">
          <span className={`pt-status ${state.tone}`}>{state.text}</span>
          {over > 0 && <span className="pt-over">{over}/{pts.length} over</span>}
        </span>
        <Sparkline pts={pts} from={from} to={to} color={color}/>
      </button>;
    })}
  </div>;
}
