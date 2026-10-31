import { msg, useLocale, formatNumber } from '@/i18n';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { dateOf, PARAMS, paramLabel, type Batch, type ParamKey, type SeriesReader } from '../series';
import { exceeds, fmtLong, fmtValue, Marker, niceTicks, SLOT_STYLE, type Slot } from './TrendChart';

const TIP_W = 256;
const pad2 = (v: number) => String(v).padStart(2, '0');
/** dd/mm in both languages: the axis is read against Vietnamese field sheets. */
const fmtDayMonth = (day: number) => { const d = dateOf(day); return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`; };
const fmtTick = (t: number) => formatNumber(t, Math.abs(t) >= 1e5 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined);
/** Moves labels at least 14px apart, pushing down first and then back up from the plot bottom. */
function spread(labels: { y: number }[], top: number, bottom: number) {
  labels.sort((a, b) => a.y - b.y);
  for (let k = 0; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, k ? labels[k - 1].y + 14 : top);
  for (let k = labels.length - 1; k >= 0; k--) labels[k].y = Math.min(labels[k].y, k === labels.length - 1 ? bottom : labels[k + 1].y - 14);
}

/** Whether the chart can show real values on one axis: every charted parameter has the same unit. */
export const sharesUnit = (keys: ParamKey[]) => new Set(keys.map(key => PARAMS[key].unit)).size <= 1;

/**
 * Sampling rounds on the x axis, every charted parameter in one plot. One parameter, or several with the
 * same unit, read on a real axis. Parameters with different units (Coliform and Amoni differ by four
 * orders of magnitude) are each scaled to their own lowest–highest value in the period so their trends
 * can be compared; the tooltip always gives the real values of all parameters for the hovered round.
 */
export function BatchChart({ series, station, codes, batches, refs, slots, label }: { series: SeriesReader; station: string; codes: string[]; batches: Batch[]; refs: boolean; slots: Slot[]; label: string }) {
  const locale = useLocale();
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);
  const [tipY, setTipY] = useState<number | null>(null);
  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(300, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visible = slots.flatMap((slot, index) => slot.key && slot.on ? [{ slot, index, key: slot.key }] : []);
  const others = slots.flatMap((slot, index) => slot.key && !slot.on ? [{ slot, index, key: slot.key }] : []);
  const n = batches.length;
  if (!n || !visible.length) return <div className="trend-plot" ref={plotRef}><p className="muted bc-empty">{msg(visible.length ? 'chart.noBatches' : 'chart.selectCard')}</p></div>;

  const single = visible.length === 1, real = sharesUnit(visible.map(v => v.key));
  const narrow = width < 600;
  const M = { l: real ? 52 : 70, r: narrow ? 64 : locale === 'vi' ? 150 : 128, t: 24, b: 44 };
  const plotH = narrow ? 280 : 380, top = M.t, bottom = M.t + plotH, H = bottom + M.b;
  const pw = width - M.l - M.r, step = pw / n;
  const x = (k: number) => M.l + (k + .5) * step;

  // All stations, one parameter: the lowest and highest station of each round as a band.
  const band = (key: ParamKey) => single && station === 'all' && codes.length > 1 ? batches.map(b => {
    const values = codes.map(code => series(code, key)[b.day]).filter((v): v is number => v !== null);
    return values.length > 1 ? [Math.min(...values), Math.max(...values)] as const : null;
  }) : [];

  const lines = visible.map(item => ({ ...item, values: batches.map(b => series(station, item.key)[b.day]), band: band(item.key), style: SLOT_STYLE[item.index] }));

  // Real axis: one scale for every line. Mixed units: each line gets its own 0–1 scale.
  let realScale: { y: (v: number) => number; ticks: number[] } | null = null;
  if (real) {
    let domain: number[] = [];
    lines.forEach(line => {
      line.values.forEach(v => { if (v !== null) domain.push(v); });
      line.band.forEach(b => { if (b) domain.push(b[0], b[1]); });
      if (refs) [line.slot.lo, line.slot.hi].forEach(v => { if (v !== null) domain.push(v); });
    });
    if (!domain.length) domain = [0, 1];
    let mn = Math.min(...domain), mx = Math.max(...domain);
    const pad = (mx - mn || Math.abs(mx) || 1) * .08;
    mn = Math.max(0, mn - pad); mx += pad;
    const nt = niceTicks(mn, mx, narrow ? 4 : 6);
    realScale = { y: v => bottom - (v - nt.lo) / (nt.hi - nt.lo || 1) * plotH, ticks: nt.ticks };
  }
  const yOf = lines.map(line => {
    if (realScale) return realScale.y;
    const values = line.values.filter((v): v is number => v !== null);
    const mn = Math.min(...values), mx = Math.max(...values);
    return (v: number) => bottom - (.06 + .88 * (mx === mn ? .5 : (v - mn) / (mx - mn))) * plotH;
  });

  // Round labels thin out on narrow screens; the latest round is always labelled.
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / (narrow ? 48 : 64))));
  const labelled = (k: number) => (n - 1 - k) % every === 0;

  function pointer(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = (event.clientX - box.left) * (width / box.width);
    setHover(Math.min(n - 1, Math.max(0, Math.floor((px - M.l) / step))));
    setTipY(event.clientY - box.top);
  }
  function keys(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') { setHover(null); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setTipY(null);
    setHover(current => Math.min(n - 1, Math.max(0, (current ?? n - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
  }

  const ends: { y: number; text: string; cls: string }[] = [];
  const zones: ReactElement[] = [], limits: ReactElement[] = [];
  if (realScale && refs) lines.forEach(({ slot, key, index, style }) => ([['lo', '≥'], ['hi', '≤']] as const).forEach(([bound, sign]) => {
    const v = slot[bound];
    if (v === null) return;
    const at = realScale.y(v);
    ends.push({ y: at, text: narrow ? `${sign} ${formatNumber(v)}` : single ? msg('chart.limit', { sign, value: formatNumber(v) }) : `${PARAMS[key].name} ${sign} ${formatNumber(v)}`, cls: 'tc-ref-label' });
    if (single) {
      zones.push(<rect key={bound} className="tc-zone" x={M.l} y={bound === 'hi' ? top : at} width={pw} height={Math.max(0, bound === 'hi' ? at - top : bottom - at)}/>);
      limits.push(<line key={bound} className="bc-limit" x1={M.l} x2={width - M.r} y1={at} y2={at}/>);
    } else limits.push(<line key={`${index}${bound}`} x1={M.l} x2={width - M.r} y1={at} y2={at} stroke={style.color} strokeWidth="1.25" strokeDasharray="6 4" opacity=".8"/>);
  }));

  const active = hover !== null && hover < n ? hover : null;
  const scale = plotRef.current ? plotRef.current.clientWidth / width : 1;
  const plotWidth = plotRef.current?.clientWidth ?? width;
  const tipLeft = active === null ? 0 : (() => {
    const right = (x(active) + step / 2) * scale + 8, left = (x(active) - step / 2) * scale - 8 - TIP_W;
    return Math.max(0, Math.min(right + TIP_W <= plotWidth ? right : left, plotWidth - TIP_W));
  })();
  const tipTop = tipY === null ? 0 : Math.max(0, Math.min(tipY - 40, H - 120 - slots.length * 26));
  const batch = active === null ? null : batches[active];

  return <div className="trend-plot" ref={plotRef}>
    <svg viewBox={`0 0 ${width} ${H}`} height={H} role="img" tabIndex={0} aria-label={msg('chart.accessibleBatches', { label })} onKeyDown={keys} onFocus={() => { setTipY(null); setHover(hover ?? n - 1); }} onBlur={() => setHover(null)}>
      {active !== null && <rect className="bc-column" x={x(active) - step / 2} y={top} width={step} height={plotH}/>}
      {zones}
      {realScale
        ? realScale.ticks.map(t => <g key={t}><line className="tc-grid" x1={M.l} x2={width - M.r} y1={realScale.y(t)} y2={realScale.y(t)}/><text className="tc-tick" x={M.l - 8} y={realScale.y(t) + 4} textAnchor="end">{fmtTick(t)}</text></g>)
        : [0, .5, 1].map(s => { const at = bottom - (.06 + .88 * s) * plotH; return <line key={s} className="tc-grid" x1={M.l} x2={width - M.r} y1={at} y2={at}/>; })}
      {!realScale && <>
        <text className="tc-tick" x={M.l - 8} y={bottom - .94 * plotH + 4} textAnchor="end">{msg('chart.highest')}</text>
        <text className="tc-tick" x={M.l - 8} y={bottom - .06 * plotH + 4} textAnchor="end">{msg('chart.lowest')}</text>
      </>}
      <text className="tc-unit" x={4} y={top - 10}>{realScale ? PARAMS[visible[0].key].unit : msg('chart.relativeScale')}</text>
      <line className="tc-axis" x1={M.l} x2={width - M.r} y1={bottom} y2={bottom}/>
      {limits}
      {lines.map(({ slot, key, index, values, band: rows, style }, l) => {
        const y = yOf[l];
        // A round without a sample of this parameter breaks the line.
        let path = '', open = false;
        values.forEach((v, k) => {
          if (v === null) { open = false; return; }
          path += `${open ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`;
          open = true;
        });
        const lastK = values.map((v, k) => v === null ? -1 : k).filter(k => k >= 0).pop();
        if (lastK !== undefined) ends.push({ y: y(values[lastK]!), text: single || narrow ? fmtValue(values[lastK], key) : `${PARAMS[key].name} ${fmtValue(values[lastK], key)}`, cls: 'tc-end' });
        const bandPts = rows.flatMap((b, k) => b ? [[k, b[0], b[1]] as const] : []);
        return <g key={index}>
          {bandPts.length > 1 && <polygon points={[...bandPts.map(([k, , hi]) => `${x(k).toFixed(1)},${y(hi).toFixed(1)}`), ...bandPts.slice().reverse().map(([k, lo]) => `${x(k).toFixed(1)},${y(lo).toFixed(1)}`)].join(' ')} fill={style.color} fillOpacity=".13"/>}
          {path && <path d={path} fill="none" stroke={style.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>}
          {values.map((v, k) => {
            if (v === null) return null;
            const flagged = refs && exceeds(v, slot), big = k === active;
            return <g key={k}>
              {flagged && !single && <circle cx={x(k)} cy={y(v)} r={big ? 9 : 7} fill="none" stroke="var(--danger)" strokeWidth="1.5"/>}
              <Marker shape={single ? 'circle' : style.shape} x={x(k)} y={y(v)} size={big ? 12 : 8} fill={flagged && single ? 'var(--danger)' : style.color} strokeWidth={2}/>
            </g>;
          })}
        </g>;
      })}
      {(() => {
        // Line ends and limit labels can share a height; spread them so none overlap.
        spread(ends, top + 6, bottom - 4);
        return ends.map((e, k) => <text key={k} className={e.cls} x={width - M.r + 8} y={e.y + 4}>{e.text}</text>);
      })()}
      {active !== null && <line className="tc-cross" x1={x(active)} x2={x(active)} y1={top} y2={bottom}/>}
      {batches.map((b, k) => labelled(k) && <g key={b.day}>
        <text className={k === active ? 'bc-round is-active' : 'bc-round'} x={x(k)} y={bottom + 20} textAnchor="middle">{msg('chart.batchShort', { number: b.number })}</text>
        <text className="tc-tick" x={x(k)} y={bottom + 34} textAnchor="middle">{fmtDayMonth(b.day)}</text>
      </g>)}
      <rect x={M.l} y={top} width={pw} height={plotH} fill="transparent" onPointerMove={pointer} onPointerDown={pointer} onPointerLeave={() => setHover(null)}/>
    </svg>
    {batch && <div className="tc-tip show bc-tip" style={{ width: TIP_W, transform: `translate(${tipLeft}px, ${tipTop}px)` }}>
      <div className="tip-date">{msg('chart.batch', { number: batch.number, year: batch.year })}</div>
      <div className="tip-sub">{msg('chart.measuredOn', { date: fmtLong(batch.day) })} · {station === 'all' ? msg('chart.meanOfStations', { count: codes.length }) : station}</div>
      {lines.map(({ key, index, slot, band: rows }) => {
        const v = series(station, key)[batch.day];
        const flag = refs && v !== null && exceeds(v, slot);
        const range = rows[active!];
        return <div className="tip-row" key={index}>
          <i style={{ background: SLOT_STYLE[index].color }}/>
          <span className="tip-name">{paramLabel(key)}</span>
          <b className={flag ? 'tip-bad' : undefined}>{fmtValue(v, key)}</b>
          {range && <div className="tip-note">{msg('chart.stationsPrefix')} {fmtValue(range[0], key)} – {fmtValue(range[1], key)}</div>}
          {flag && <div className="tip-flag">{slot.lo !== null && v < slot.lo ? msg('chart.belowLimit', { value: formatNumber(slot.lo) }) : msg('chart.aboveLimit', { value: formatNumber(slot.hi!) })}</div>}
        </div>;
      })}
      {others.length > 0 && <div className="tip-others">
        {others.map(({ key, index, slot }) => {
          const v = series(station, key)[batch.day];
          return <div className="tip-row" key={index}>
            <i style={{ background: SLOT_STYLE[index].color }}/>
            <span className="tip-name">{paramLabel(key)}</span>
            <b className={refs && exceeds(v, slot) ? 'tip-bad' : undefined}>{fmtValue(v, key)}</b>
          </div>;
        })}
      </div>}
    </div>}
  </div>;
}
