import { msg, useLocale, formatNumber } from '@/i18n';
import { getVnWqiQualityClass } from '@wqi/contracts';
import type { CSSProperties } from 'react';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { PARAMS, type ParamKey, type RoundPoint } from '../series';
import { exceeds, fmtValue, SLOT_STYLE, type Slot } from './TrendChart';

/** Latest round against its QCVN limit: icon + label, never colour alone. */
export function status(v: number | null, slot: Slot) {
  if (v === null) return { tone: 'none', text: msg('common.noData') };
  if (slot.lo !== null && v < slot.lo) return { tone: 'bad', text: msg('chart.below', { value: formatNumber(slot.lo) }) };
  if (slot.hi !== null && v > slot.hi) return { tone: 'bad', text: msg('chart.above', { value: formatNumber(slot.hi) }) };
  if (slot.lo === null && slot.hi === null) return { tone: 'none', text: msg('chart.noLimit') };
  return { tone: 'ok', text: msg('chart.withinLimit') };
}

/** Change since the previous round, coloured by whether that direction means cleaner water. */
export function delta(latest: number, previous: number, label: string, key: ParamKey) {
  const change = latest - previous;
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '→';
  const better = PARAMS[key].better;
  const tone = !change || !better ? 'flat' : (change > 0) === (better === 'up') ? 'good' : 'bad';
  const value = fmtValue(Math.abs(change), key);
  // The card is narrow: "vs previous", with the batch code in the tooltip.
  return { tone, text: msg('chart.deltaPrevious', { arrow, value }), title: msg('chart.delta', { arrow, value, date: label }) };
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg className="pt-spark" aria-hidden="true"/>;
  const min = Math.min(...values), max = Math.max(...values);
  const sx = (i: number) => (i / (values.length - 1) * 100).toFixed(2);
  const sy = (v: number) => (max === min ? 14 : 26 - (v - min) / (max - min) * 24).toFixed(2);
  const line = values.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
  return <svg className="pt-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
    <polygon points={`0,28 ${line} 100,28`} fill={color} fillOpacity=".1"/>
    <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

/**
 * One card per parameter, in display order, WQI last; a click charts that parameter. The card of the charted one is pressed.
 * WQI has no QCVN limit, so without one set its card gives the quality class of the latest round instead.
 */
export function ParameterTiles({ slots, points, focus, onSelect }: { slots: Slot[]; points: RoundPoint[]; focus: number; onSelect: (index: number) => void }) {
  useLocale();
  return <div className="param-tiles" role="group" aria-label={msg('chart.selectParameter')}>
    {slots.map((slot, index) => {
      if (!slot.key) return null;
      const key = slot.key, values = points.map(p => p.mean[key]).filter((v): v is number => v !== null);
      const latest = values.at(-1) ?? null, state = status(latest, slot);
      const change = latest !== null && values.length > 1 ? delta(latest, values.at(-2)!, points.at(-2)!.label, key) : null;
      const over = values.filter(v => exceeds(v, slot)).length;
      const color = SLOT_STYLE[index].color;
      return <button key={index} type="button" className="param-tile" aria-pressed={index === focus} style={{ '--tile-color': color } as CSSProperties} onClick={() => onSelect(index)}>
        <span className="pt-head"><i/>{PARAMS[key].name}{PARAMS[key].unit !== PARAMS[key].name && <span className="pt-unit">{PARAMS[key].unit}</span>}</span>
        <span className="pt-value">{fmtValue(latest, key)}</span>
        <span className={`pt-delta ${change?.tone ?? 'flat'}`} title={change?.title}>{change?.text ?? (latest !== null ? msg('chart.inBatch', { code: points.at(-1)!.label }) : msg('chart.noSamplesPeriod'))}</span>
        <span className="pt-foot">
          {key === 'WQI' && latest !== null && slot.lo === null && slot.hi === null
            ? <ClassificationBadge value={getVnWqiQualityClass(latest)}/>
            : <span className={`pt-status ${state.tone}`}>{state.text}</span>}
          {over > 0 && <span className="pt-over">{over}/{values.length} {msg('chart.over')}</span>}
        </span>
        <Sparkline values={values} color={color}/>
      </button>;
    })}
  </div>;
}
