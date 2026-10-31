import { localeName, formatNumber } from '@/i18n';
import { dateOf, PARAMS, type ParamKey } from '../series';

// Shared pieces of the Historical Data chart (BatchChart) and its parameter cards.
export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'down' | 'plus';
export type Slot = { key: ParamKey | null; lo: number | null; hi: number | null; on: boolean };
// Series colours validated for colour-blind separation and 3:1 contrast; shapes are a second cue.
// Slots follow the contract order (Coliform, Amoni, pH, Phosphat, DO, COD).
export const SLOT_STYLE: { color: string; shape: Shape }[] = [
  { color: '#C2620E', shape: 'circle' },
  { color: '#0079B0', shape: 'square' },
  { color: '#008300', shape: 'triangle' },
  { color: '#8A4FD0', shape: 'diamond' },
  { color: '#D1477A', shape: 'down' },
  { color: '#9A7B00', shape: 'plus' },
];

export function Marker({ shape, x, y, size, fill, stroke = '#fff', strokeWidth = 1.5 }: { shape: Shape; x: number; y: number; size: number; fill: string; stroke?: string; strokeWidth?: number }) {
  const h = size / 2;
  const paint = { fill, stroke, strokeWidth };
  if (shape === 'square') return <rect x={x - h * .9} y={y - h * .9} width={size * .9} height={size * .9} rx={1.5} {...paint}/>;
  if (shape === 'triangle') return <path d={`M${x},${y - h * 1.1} L${x + h * 1.05},${y + h * .8} L${x - h * 1.05},${y + h * .8} Z`} {...paint}/>;
  if (shape === 'down') return <path d={`M${x},${y + h * 1.1} L${x + h * 1.05},${y - h * .8} L${x - h * 1.05},${y - h * .8} Z`} {...paint}/>;
  if (shape === 'diamond') return <path d={`M${x},${y - h * 1.2} L${x + h * 1.05},${y} L${x},${y + h * 1.2} L${x - h * 1.05},${y} Z`} {...paint}/>;
  if (shape === 'plus') {
    const a = h * 1.1, t = h * .4;
    return <path d={`M${x - t},${y - a}H${x + t}V${y - t}H${x + a}V${y + t}H${x + t}V${y + a}H${x - t}V${y + t}H${x - a}V${y - t}H${x - t}Z`} {...paint}/>;
  }
  return <circle cx={x} cy={y} r={h} {...paint}/>;
}
export function KeySwatch({ index }: { index: number }) {
  const { color, shape } = SLOT_STYLE[index];
  return <svg viewBox="0 0 22 12" aria-hidden="true"><line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round"/><Marker shape={shape} x={11} y={6} size={8} fill={color}/></svg>;
}

export const exceeds = (value: number | null, slot: Slot) => value !== null && ((slot.lo !== null && value < slot.lo) || (slot.hi !== null && value > slot.hi));
export const fmtLong = (i: number) => dateOf(i).toLocaleDateString(localeName(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
export const fmtValue = (v: number | null, key: ParamKey) => v === null ? '—' : formatNumber(v, { minimumFractionDigits: PARAMS[key].dec, maximumFractionDigits: PARAMS[key].dec });

export function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  let step = 10 ** Math.floor(Math.log10(span / count));
  const err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}
