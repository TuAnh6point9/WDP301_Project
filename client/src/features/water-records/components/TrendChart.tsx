import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { dateOf, paramLabel, PARAMS, type ParamKey, type SeriesReader } from '../series';

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'down' | 'plus';
export type Slot = { key: ParamKey | null; lo: number | null; hi: number | null; on: boolean };
// Series colours validated for colour-blind separation and 3:1 contrast; shapes are a second cue.
// Slots 2-5 (DO, COD, Amoni, Phosphat by default) share the mg/L axis when compared, so they
// hold the four colours that stay furthest apart from each other.
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
const fmtShort = (i: number) => dateOf(i).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtLong = (i: number) => dateOf(i).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
export const fmtValue = (v: number | null, key: ParamKey) => v === null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: PARAMS[key].dec, maximumFractionDigits: PARAMS[key].dec });
const fmtTick = (t: number) => t.toLocaleString('en-US', Math.abs(t) >= 1000 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined);

function niceTicks(min: number, max: number, count: number) {
  const span = max - min || 1;
  let step = 10 ** Math.floor(Math.log10(span / count));
  const err = span / count / step;
  if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}
/** Moves labels at least 14px apart, pushing down first and then back up from the panel bottom. */
function spread(labels: { y: number }[], top: number, bottom: number) {
  labels.sort((a, b) => a.y - b.y);
  for (let k = 0; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, k ? labels[k - 1].y + 14 : top);
  for (let k = labels.length - 1; k >= 0; k--) labels[k].y = Math.min(labels[k].y, k === labels.length - 1 ? bottom : labels[k + 1].y - 14);
}

type Active = { slot: Slot; index: number; key: ParamKey };

/**
 * The large trend chart. One parameter reads best: it gets an area wash (single station) or the
 * lowest-highest station band (all stations), and the area beyond its QCVN limit is shaded.
 * Compared parameters share the axis only when they share a unit.
 */
export function TrendChart({ series, station, codes, from, to, refs, slots, label }: { series: SeriesReader; station: string; codes: string[]; from: number; to: number; refs: boolean; slots: Slot[]; label: string }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [tipY, setTipY] = useState<number | null>(null);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(320, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visible: Active[] = slots.flatMap((slot, index) => slot.key && slot.on ? [{ slot, index, key: slot.key }] : []);
  const len = to - from + 1;
  if (!visible.length) return <div className="trend-plot" ref={plotRef}><p className="muted" style={{ padding: '80px 0', textAlign: 'center' }}>Select a parameter card to draw the chart.</p></div>;

  const units = [...new Set(visible.map(v => PARAMS[v.key].unit))];
  const single = visible.length === 1;
  const M = { l: 52, r: width < 600 ? 60 : 92, t: 26, b: 30 }, gapY = 44;
  const panelH = units.length > 1 ? 190 : width < 600 ? 280 : 380;
  const H = M.t + M.b + units.length * panelH + (units.length - 1) * gapY;
  const pw = width - M.l - M.r;
  const x = (i: number) => M.l + (len === 1 ? pw / 2 : (i - from) / (len - 1) * pw);

  // Network view of one parameter: lowest and highest station on each sampled day.
  const stationRange = (key: ParamKey) => {
    if (!single || station !== 'all' || codes.length < 2) return [];
    const columns = codes.map(code => series(code, key));
    const band: [number, number, number][] = [];
    for (let i = from; i <= to; i++) {
      const values = columns.map(column => column[i]).filter((v): v is number => v !== null);
      if (values.length > 1) band.push([i, Math.min(...values), Math.max(...values)]);
    }
    return band;
  };

  const panels = units.map((unit, u) => {
    const top = M.t + u * (panelH + gapY), bottom = top + panelH;
    const lines = visible.filter(v => PARAMS[v.key].unit === unit).map(member => {
      const data = series(station, member.key);
      const pts: [number, number][] = [];
      for (let i = from; i <= to; i++) { const v = data[i]; if (v !== null) pts.push([i, v]); }
      return { ...member, data, pts, band: stationRange(member.key), style: SLOT_STYLE[member.index] };
    });
    let values: number[] = [];
    lines.forEach(({ pts, band, slot }) => {
      pts.forEach(([, v]) => values.push(v));
      band.forEach(([, lo, hi]) => values.push(lo, hi));
      if (refs) [slot.lo, slot.hi].forEach(v => { if (v !== null) values.push(v); });
    });
    if (!values.length) values = [0, 1];
    let mn = Math.min(...values), mx = Math.max(...values);
    const pad = (mx - mn || 1) * .08;
    mn = Math.max(0, mn - pad); mx += pad;
    const nt = niceTicks(mn, mx, panelH > 250 ? 6 : 4);
    const y = (v: number) => bottom - (v - nt.lo) / (nt.hi - nt.lo) * panelH;
    return { unit, top, bottom, lines, nt, y };
  });

  const target = Math.max(3, Math.floor(pw / 90));
  const stepDays = [1, 2, 7, 14, 30, 61, 91].find(d => len / d <= target) || 91;
  const xTicks: number[] = [];
  if (stepDays >= 30) { for (let i = from; i <= to; i++) { const d = dateOf(i); if (d.getUTCDate() === 1 && d.getUTCMonth() % (Math.floor(stepDays / 30) || 1) === 0) xTicks.push(i); } }
  else for (let i = to; i >= from; i -= stepDays) xTicks.unshift(i);
  const last = panels[panels.length - 1];
  // Samples are sparse (about two a month), so reading snaps to the nearest sampled day.
  const sampled = [...new Set(panels.flatMap(P => P.lines.flatMap(line => line.pts.map(([i]) => i))))].sort((a, b) => a - b);
  const nearest = (i: number) => sampled.length ? sampled.reduce((best, s) => Math.abs(s - i) < Math.abs(best - i) ? s : best) : i;

  function pointer(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = (event.clientX - box.left) * (width / box.width);
    setHover(nearest(Math.min(to, Math.max(from, Math.round(from + (px - M.l) / pw * (len - 1))))));
    setTipY(event.clientY - box.top);
  }
  function keys(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') { setHover(null); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setTipY(null);
    const current = hover ?? to, forward = event.key === 'ArrowRight';
    if (sampled.length) setHover((forward ? sampled.find(s => s > current) : [...sampled].reverse().find(s => s < current)) ?? current);
    else setHover(Math.min(to, Math.max(from, current + (forward ? 1 : -1) * (event.shiftKey ? 7 : 1))));
  }
  const active = hover !== null && hover >= from && hover <= to ? hover : null;
  const others = slots.flatMap((slot, index) => slot.key && !slot.on ? [{ slot, index, key: slot.key }] : []);
  const tipLeft = active === null ? 0 : x(active) * (plotRef.current ? plotRef.current.clientWidth / width : 1);
  const tipFlip = plotRef.current && tipLeft + 236 > plotRef.current.clientWidth;
  // The tooltip stays beside the pointer; keyboard reading starts at the top.
  const tipTop = tipY === null ? 8 : Math.max(8, Math.min(tipY - 24, H - 64 - (visible.length + others.length) * 24));

  return <div className="trend-plot" ref={plotRef}>
    <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" tabIndex={0} aria-label={`${label}. Hover or use the left and right arrow keys to read values.`} onKeyDown={keys} onFocus={() => { setTipY(null); setHover(hover ?? sampled[sampled.length - 1] ?? to); }} onBlur={() => setHover(null)}>
      {panels.map(P => {
        const ends: { y: number; text: string; x: number; cls: string }[] = [];
        // A single parameter shades the area beyond its limit; compared ones get a dashed rule each.
        const zones: ReactElement[] = [], limits: ReactElement[] = [];
        if (refs) P.lines.forEach(({ slot, key, index, style }) => ([['lo', '≥'], ['hi', '≤']] as const).forEach(([bound, sign]) => {
          const v = slot[bound];
          if (v === null || v < P.nt.lo || v > P.nt.hi) return;
          const at = P.y(v);
          ends.push({ y: at, text: width < 600 ? `${sign} ${v}` : single ? `Limit ${sign} ${v}` : `${PARAMS[key].name} ${sign} ${v}`, x: width - M.r, cls: 'tc-ref-label' });
          if (single) {
            zones.push(<rect key={bound} className="tc-zone" x={M.l} y={bound === 'hi' ? P.top : at} width={pw} height={Math.max(0, bound === 'hi' ? at - P.top : P.bottom - at)}/>);
            limits.push(<line key={bound} className="tc-limit" x1={M.l} x2={width - M.r} y1={at} y2={at}/>);
          } else limits.push(<line key={`${index}${bound}`} x1={M.l} x2={width - M.r} y1={at} y2={at} stroke={style.color} strokeWidth="1.25" strokeDasharray="6 4" opacity=".8"/>);
        }));
        const empty = P.lines.every(line => !line.pts.length);
        return <g key={P.unit}>
          {zones}
          {P.nt.ticks.map(t => <g key={t}><line className="tc-grid" x1={M.l} x2={width - M.r} y1={P.y(t)} y2={P.y(t)}/><text className="tc-tick" x={M.l - 8} y={P.y(t) + 4} textAnchor="end">{fmtTick(t)}</text></g>)}
          <text className="tc-unit" x={4} y={P.top - 12}>{P.unit}</text>
          <line className="tc-axis" x1={M.l} x2={width - M.r} y1={P.bottom} y2={P.bottom}/>
          {limits}
          {empty && <text className="tc-empty" x={M.l + pw / 2} y={(P.top + P.bottom) / 2} textAnchor="middle">No samples in this period</text>}
          {P.lines.map(({ slot, key, index, pts, band, style }) => {
            if (!pts.length) return null;
            const path = pts.map(([i, v]) => `${x(i).toFixed(1)},${P.y(v).toFixed(1)}`).join(' ');
            const lastPoint = pts[pts.length - 1];
            ends.push({ y: P.y(lastPoint[1]), text: fmtValue(lastPoint[1], key), x: x(lastPoint[0]), cls: 'tc-end' });
            const dense = pts.length > 130;
            return <g key={index}>
              {band.length > 1 && <polygon points={[...band.map(([i, , hi]) => `${x(i).toFixed(1)},${P.y(hi).toFixed(1)}`), ...band.slice().reverse().map(([i, lo]) => `${x(i).toFixed(1)},${P.y(lo).toFixed(1)}`)].join(' ')} fill={style.color} fillOpacity=".13"/>}
              {single && !band.length && pts.length > 1 && <polygon points={`${x(pts[0][0]).toFixed(1)},${P.bottom} ${path} ${x(lastPoint[0]).toFixed(1)},${P.bottom}`} fill={style.color} fillOpacity=".08"/>}
              <polyline points={path} fill="none" stroke={style.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              {pts.map(([i, v]) => {
                const flagged = refs && exceeds(v, slot);
                if (dense && !flagged) return null;
                return <g key={i}>
                  {flagged && !single && <circle cx={x(i)} cy={P.y(v)} r={7} fill="none" stroke="var(--danger)" strokeWidth="1.5"/>}
                  <Marker shape={single ? 'circle' : style.shape} x={x(i)} y={P.y(v)} size={8} fill={flagged && single ? 'var(--danger)' : style.color} strokeWidth={2}/>
                </g>;
              })}
            </g>;
          })}
          {(() => {
            // End values and limit labels are separate columns; each stays inside its own panel.
            for (const cls of ['tc-end', 'tc-ref-label']) spread(ends.filter(e => e.cls === cls), P.top + 6, P.bottom - 4);
            return ends.map((e, k) => <text key={k} className={e.cls} x={e.x + 9} y={e.y + 4}>{e.text}</text>);
          })()}
        </g>;
      })}
      {xTicks.map(i => <text key={i} className="tc-tick" x={x(i)} y={last.bottom + 18} textAnchor="middle">{fmtShort(i)}</text>)}
      {active !== null && <g>
        <line className="tc-cross" x1={x(active)} x2={x(active)} y1={panels[0].top} y2={last.bottom}/>
        {panels.flatMap(P => P.lines.map(({ data, index, style, slot }) => {
          const v = data[active];
          return v === null ? null : <Marker key={index} shape={single ? 'circle' : style.shape} x={x(active)} y={P.y(v)} size={12} fill={single && refs && exceeds(v, slot) ? 'var(--danger)' : style.color} strokeWidth={2.5}/>;
        }))}
      </g>}
      <rect x={M.l} y={M.t} width={pw} height={last.bottom - M.t} fill="transparent" onPointerMove={pointer} onPointerLeave={() => setHover(null)}/>
    </svg>
    {active !== null && <div className="tc-tip show" style={{ transform: `translate(${tipFlip ? tipLeft - 236 : tipLeft + 14}px, ${tipTop}px)` }}>
      <div className="tip-date">{fmtLong(active)}{station === 'all' ? ' · mean of stations' : ` · ${station}`}</div>
      {visible.map(({ key, index, slot }) => {
        const v = series(station, key)[active];
        const flag = refs && exceeds(v, slot);
        const band = panels.flatMap(P => P.lines).find(line => line.index === index)?.band.find(([i]) => i === active);
        return <div className="tip-row" key={index}>
          <i style={{ background: SLOT_STYLE[index].color }}/>
          <b>{fmtValue(v, key)}</b>
          <span>{paramLabel(key)}{v === null ? ' · no sample' : ''}</span>
          {band && <div className="tip-note">Stations: {fmtValue(band[1], key)} – {fmtValue(band[2], key)}</div>}
          {flag && v !== null && <div className="tip-flag">{slot.lo !== null && v < slot.lo ? `▼ Below limit ${slot.lo}` : `▲ Above limit ${slot.hi}`}</div>}
        </div>;
      })}
      {others.length > 0 && <div className="tip-others">
        {others.map(({ key, index, slot }) => {
          const v = series(station, key)[active];
          return <div className="tip-row" key={index}>
            <i style={{ background: SLOT_STYLE[index].color }}/>
            <b className={refs && exceeds(v, slot) ? 'tip-bad' : undefined}>{fmtValue(v, key)}</b>
            <span>{paramLabel(key)}</span>
          </div>;
        })}
      </div>}
    </div>}
  </div>;
}
