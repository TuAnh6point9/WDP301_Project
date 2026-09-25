import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dateOf, PARAMS, type ParamKey, type SeriesReader } from '../series';

export type Shape = 'circle' | 'square' | 'triangle';
export type Slot = { key: ParamKey | null; lo: number | null; hi: number | null; on: boolean };
// Series colours validated for colour-blind separation and 3:1 contrast; shapes are a second cue.
export const SLOT_STYLE: { color: string; shape: Shape }[] = [
  { color: '#0079B0', shape: 'circle' },
  { color: '#C2620E', shape: 'square' },
  { color: '#8A4FD0', shape: 'triangle' },
];

export function Marker({ shape, x, y, size, fill, stroke = '#fff', strokeWidth = 1.5 }: { shape: Shape; x: number; y: number; size: number; fill: string; stroke?: string; strokeWidth?: number }) {
  const h = size / 2;
  if (shape === 'square') return <rect x={x - h * .9} y={y - h * .9} width={size * .9} height={size * .9} rx={1.5} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>;
  if (shape === 'triangle') return <path d={`M${x},${y - h * 1.1} L${x + h * 1.05},${y + h * .8} L${x - h * 1.05},${y + h * .8} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>;
  return <circle cx={x} cy={y} r={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>;
}
export function KeySwatch({ index }: { index: number }) {
  const { color, shape } = SLOT_STYLE[index];
  return <svg viewBox="0 0 22 12" aria-hidden="true"><line x1="1" y1="6" x2="21" y2="6" stroke={color} strokeWidth="2" strokeDasharray="3 3"/><Marker shape={shape} x={11} y={6} size={8} fill={color}/></svg>;
}

export const exceeds = (value: number | null, slot: Slot) => value !== null && ((slot.lo !== null && value < slot.lo) || (slot.hi !== null && value > slot.hi));
const fmtShort = (i: number) => dateOf(i).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtLong = (i: number) => dateOf(i).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const fmtValue = (v: number | null, key: ParamKey) => v === null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: PARAMS[key].dec, maximumFractionDigits: PARAMS[key].dec });

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  let step = 10 ** Math.floor(Math.log10(span / count));
  const err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}

type Active = { slot: Slot; index: number; key: ParamKey };

export function TrendChart({ series, station, from, to, refs, slots, label }: { series: SeriesReader; station: string; from: number; to: number; refs: boolean; slots: Slot[]; label: string }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(320, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visible: Active[] = slots.flatMap((slot, index) => slot.key && slot.on ? [{ slot, index, key: slot.key }] : []);
  const len = to - from + 1;
  if (!visible.length) return <div className="trend-plot" ref={plotRef}><p className="muted" style={{ padding: '80px 0', textAlign: 'center' }}>Select or enable a parameter to draw the chart.</p></div>;

  // One panel per unit: series share an axis only when they share a unit.
  const units = [...new Set(visible.map(v => PARAMS[v.key].unit))];
  const M = { l: 52, r: width < 600 ? 64 : 96, t: 14, b: 30 }, gapY = 26;
  const panelH = units.length > 1 ? 190 : width < 600 ? 300 : 470;
  const H = M.t + M.b + units.length * panelH + (units.length - 1) * gapY;
  const pw = width - M.l - M.r;
  const x = (i: number) => M.l + (len === 1 ? pw / 2 : (i - from) / (len - 1) * pw);

  const panels = units.map((unit, u) => {
    const top = M.t + u * (panelH + gapY), bottom = top + panelH;
    const members = visible.filter(v => PARAMS[v.key].unit === unit);
    let values: number[] = [];
    members.forEach(({ key, slot }) => {
      const data = series(station, key);
      for (let i = from; i <= to; i++) { const v = data[i]; if (v !== null) values.push(v); }
      if (refs) [slot.lo, slot.hi].forEach(v => { if (v !== null) values.push(v); });
    });
    if (!values.length) values = [0, 1];
    let mn = Math.min(...values), mx = Math.max(...values);
    const pad = (mx - mn || 1) * .08;
    mn = Math.max(0, mn - pad); mx += pad;
    const nt = niceTicks(mn, mx, panelH > 250 ? 6 : 4);
    const y = (v: number) => bottom - (v - nt.lo) / (nt.hi - nt.lo) * panelH;
    return { unit, top, bottom, members, nt, y };
  });

  const target = Math.max(3, Math.floor(pw / 90));
  const stepDays = [1, 2, 7, 14, 30, 61, 91].find(d => len / d <= target) || 91;
  const xTicks: number[] = [];
  if (stepDays >= 30) { for (let i = from; i <= to; i++) { const d = dateOf(i); if (d.getUTCDate() === 1 && d.getUTCMonth() % (Math.floor(stepDays / 30) || 1) === 0) xTicks.push(i); } }
  else for (let i = to; i >= from; i -= stepDays) xTicks.unshift(i);
  const last = panels[panels.length - 1];

  function pointer(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = (event.clientX - box.left) * (width / box.width);
    setHover(Math.min(to, Math.max(from, Math.round(from + (px - M.l) / pw * (len - 1)))));
  }
  function keys(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') { setHover(null); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? 7 : 1;
    setHover(Math.min(to, Math.max(from, (hover ?? to) + (event.key === 'ArrowRight' ? step : -step))));
  }
  const active = hover !== null && hover >= from && hover <= to ? hover : null;
  const tipLeft = active === null ? 0 : x(active) * (plotRef.current ? plotRef.current.clientWidth / width : 1);
  const tipFlip = plotRef.current && tipLeft + 220 > plotRef.current.clientWidth;

  return <div className="trend-plot" ref={plotRef}>
    <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" tabIndex={0} aria-label={`${label}. Hover or use the left and right arrow keys to read values.`} onKeyDown={keys} onFocus={() => setHover(hover ?? to)} onBlur={() => setHover(null)}>
      {panels.map(P => <g key={P.unit}>
        {P.nt.ticks.map(t => <g key={t}><line className="tc-grid" x1={M.l} x2={width - M.r} y1={P.y(t)} y2={P.y(t)}/><text className="tc-tick" x={M.l - 8} y={P.y(t) + 4} textAnchor="end">{t.toLocaleString('en-US')}</text></g>)}
        {xTicks.map(i => <line key={i} className="tc-grid" x1={x(i)} x2={x(i)} y1={P.top} y2={P.bottom}/>)}
        <line className="tc-axis" x1={M.l} x2={M.l} y1={P.top} y2={P.bottom}/>
        <line className="tc-axis" x1={M.l} x2={width - M.r} y1={P.bottom} y2={P.bottom}/>
        <text className="tc-unit" transform={`translate(12 ${(P.top + P.bottom) / 2}) rotate(-90)`} textAnchor="middle">{P.unit}</text>
        {(() => {
          const ends: { y: number; text: string; x: number; cls: string }[] = [];
          const marks = P.members.map(({ slot, index, key }) => {
            const style = SLOT_STYLE[index];
            const refLines = refs ? ([['lo', '≥'], ['hi', '≤']] as const).flatMap(([bound, sign]) => {
              const v = slot[bound];
              if (v === null || v < P.nt.lo || v > P.nt.hi) return [];
              ends.push({ y: P.y(v), text: `${PARAMS[key].name} ${sign} ${v}`, x: width - M.r, cls: 'tc-ref-label' });
              return [<line key={bound} x1={M.l} x2={width - M.r} y1={P.y(v)} y2={P.y(v)} stroke={style.color} strokeWidth="1.5" strokeDasharray="7 5" opacity=".85"/>];
            }) : [];
            const data = series(station, key);
            const pts: [number, number][] = [];
            for (let i = from; i <= to; i++) { const v = data[i]; if (v !== null) pts.push([i, v]); }
            if (!pts.length) return <g key={key}>{refLines}</g>;
            const dense = pts.length > 130, size = dense ? 5 : 8;
            const lastPoint = pts[pts.length - 1];
            ends.push({ y: P.y(lastPoint[1]), text: fmtValue(lastPoint[1], key), x: x(lastPoint[0]), cls: 'tc-end' });
            return <g key={key}>
              {refLines}
              <polyline points={pts.map(([i, v]) => `${x(i).toFixed(1)},${P.y(v).toFixed(1)}`).join(' ')} fill="none" stroke={style.color} strokeWidth="1.6" strokeDasharray="3 3" strokeLinejoin="round" opacity=".7"/>
              {pts.map(([i, v]) => {
                const flagged = refs && exceeds(v, slot);
                if (dense && !flagged) return null;
                return <g key={i}>
                  {flagged && <circle cx={x(i)} cy={P.y(v)} r={size / 2 + 3} fill="none" stroke="var(--danger)" strokeWidth="1.5"/>}
                  <Marker shape={style.shape} x={x(i)} y={P.y(v)} size={size} fill={style.color}/>
                </g>;
              })}
            </g>;
          });
          ends.sort((a, b) => a.y - b.y);
          for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;
          return <>{marks}{ends.map((e, k) => <text key={k} className={e.cls} x={e.x + 9} y={e.y + 4}>{e.text}</text>)}</>;
        })()}
      </g>)}
      {xTicks.map(i => <text key={i} className="tc-tick" x={x(i)} y={last.bottom + 18} textAnchor="middle">{fmtShort(i)}</text>)}
      {active !== null && <g>
        <line className="tc-cross" x1={x(active)} x2={x(active)} y1={panels[0].top} y2={last.bottom}/>
        {panels.flatMap(P => P.members.map(({ key, index }) => {
          const v = series(station, key)[active];
          return v === null ? null : <Marker key={key} shape={SLOT_STYLE[index].shape} x={x(active)} y={P.y(v)} size={11} fill={SLOT_STYLE[index].color} strokeWidth={2}/>;
        }))}
      </g>}
      <rect x={M.l} y={M.t} width={pw} height={last.bottom - M.t} fill="transparent" onPointerMove={pointer} onPointerLeave={() => setHover(null)}/>
    </svg>
    {active !== null && <div className="tc-tip show" style={{ transform: `translate(${tipFlip ? tipLeft - 214 : tipLeft + 14}px, 8px)` }}>
      <div className="tip-date">{fmtLong(active)}</div>
      {visible.map(({ key, index, slot }) => {
        const v = series(station, key)[active];
        const flag = refs && exceeds(v, slot);
        return <div className="tip-row" key={key}>
          <i style={{ background: SLOT_STYLE[index].color }}/>
          <b>{fmtValue(v, key)}</b>
          <span>{PARAMS[key].name} ({PARAMS[key].unit}){v === null ? ' · no sample' : ''}</span>
          {flag && v !== null && <div className="tip-flag">{slot.lo !== null && v < slot.lo ? `▼ Below lower limit ${slot.lo}` : `▲ Above upper limit ${slot.hi}`}</div>}
        </div>;
      })}
    </div>}
  </div>;
}
