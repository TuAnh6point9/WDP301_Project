import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { displayText, formatNumber, msg, useLocale } from '@/i18n';
import { PARAMS, paramLabel, type ParamKey, type RoundPoint } from '@/features/water-records/series';
import { exceeds, fmtValue, niceTicks, SLOT_STYLE, type Slot } from '@/features/water-records/components/TrendChart';
import { C, R, S } from './theme';
import { ui } from './ui';

const H = 260, M = { l: 48, r: 16, t: 20, b: 44 };
const fmtTick = (t: number) => formatNumber(t, Math.abs(t) >= 1e5 ? { notation: 'compact', maximumFractionDigits: 1 } : undefined);

/**
 * The web's BatchChart for one parameter on a phone: batch codes oldest first, the mean of each batch as a line,
 * the lowest–highest sample as a band, the QCVN limit as a dashed line. Tapping a batch shows its numbers below.
 */
export function BatchChart({ points, slot, index }: { points: RoundPoint[]; slot: Slot; index: number }) {
  useLocale();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const key = slot.key as ParamKey, color = SLOT_STYLE[index].color, n = points.length;
  if (!n) return <Text style={[ui.muted, { paddingVertical: 32, textAlign: 'center' }]}>{msg('chart.noBatches')}</Text>;
  const shown = active !== null && active < n ? active : null;

  const plotH = H - M.t - M.b, bottom = M.t + plotH, pw = Math.max(1, width - M.l - M.r), step = pw / n;
  const x = (k: number) => M.l + (k + .5) * step;
  const values = points.map(p => p.mean[key]), band = points.map(p => p.range[key]);
  const domain: number[] = [];
  values.forEach(v => { if (v !== null) domain.push(v); });
  band.forEach(b => { if (b) domain.push(b[0], b[1]); });
  [slot.lo, slot.hi].forEach(v => { if (v !== null) domain.push(v); });
  let mn = domain.length ? Math.min(...domain) : 0, mx = domain.length ? Math.max(...domain) : 1;
  const pad = (mx - mn || Math.abs(mx) || 1) * .08;
  mn = Math.max(0, mn - pad); mx += pad;
  const nt = niceTicks(mn, mx, 4);
  const y = (v: number) => bottom - (v - nt.lo) / (nt.hi - nt.lo || 1) * plotH;

  let path = '', open = false;
  values.forEach((v, k) => { if (v === null) { open = false; return; } path += `${open ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`; open = true; });
  const bandPts = band.flatMap((b, k) => b ? [[k, b[0], b[1]] as const] : []);
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 72)));
  const point = shown === null ? null : points[shown], value = point ? point.mean[key] : null, range = shown === null ? null : band[shown];
  const flagged = value !== null && exceeds(value, slot);

  return <View style={{ gap: S.sm }}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <Svg width={width} height={H}>
        {shown !== null && <Rect x={x(shown) - step / 2} y={M.t} width={step} height={plotH} fill={C.brandSoft}/>}
        {nt.ticks.map(t => <G key={t}><Line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} stroke={C.line} strokeWidth={1}/><SvgText x={M.l - 6} y={y(t) + 4} fontSize={11} fill={C.muted} textAnchor="end">{fmtTick(t)}</SvgText></G>)}
        <SvgText x={2} y={M.t - 8} fontSize={11} fill={C.muted}>{displayText(PARAMS[key].unit)}</SvgText>
        {([['lo', slot.lo], ['hi', slot.hi]] as const).map(([bound, v]) => v === null ? null
          : <Line key={bound} x1={M.l} x2={width - M.r} y1={y(v)} y2={y(v)} stroke={C.danger} strokeWidth={1.5} strokeDasharray="6 4"/>)}
        {bandPts.length > 1 && <Polygon fill={color} fillOpacity={.15}
          points={[...bandPts.map(([k, , hi]) => `${x(k).toFixed(1)},${y(hi).toFixed(1)}`), ...bandPts.slice().reverse().map(([k, lo]) => `${x(k).toFixed(1)},${y(lo).toFixed(1)}`)].join(' ')}/>}
        {path ? <Path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/> : null}
        {values.map((v, k) => v === null ? null
          : <Circle key={k} cx={x(k)} cy={y(v)} r={k === shown ? 7 : 5} fill={exceeds(v, slot) ? C.danger : color} stroke="#fff" strokeWidth={2}/>)}
        <Line x1={M.l} x2={width - M.r} y1={bottom} y2={bottom} stroke={C.control} strokeWidth={1}/>
        {points.map((p, k) => (n - 1 - k) % every === 0 && <SvgText key={p.round.key} x={x(k)} y={bottom + 18} fontSize={11} fontWeight={k === shown ? '700' : '400'} fill={k === shown ? C.brand : C.text} textAnchor="middle">{p.label}</SvgText>)}
      </Svg>}
      {/* One tap target per batch over the plot (at least 24 px wide even with many batches). */}
      <View style={{ position: 'absolute', left: M.l, top: M.t, width: pw, height: plotH + 28, flexDirection: 'row' }}>
        {points.map((p, k) => <Pressable key={p.round.key} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${paramLabel(key)} · ${msg('chart.batchTitle', { code: p.label })}`} accessibilityState={{ selected: k === shown }} onPress={() => setActive(current => current === k ? null : k)}/>)}
      </View>
    </View>
    <View style={[ui.row, { flexWrap: 'wrap', gap: S.md }]}>
      <Key color={color} text={msg('chart.batchMean')}/>
      <Key color={color} band text={msg('chart.sampleRange')}/>
      {/* WQI has no limit, so neither key applies to it. */}
      {(slot.lo !== null || slot.hi !== null) && <><Key color={C.danger} dashed text={msg('chart.limitLine')}/><Key color={C.danger} dot text={msg('chart.overLimit')}/></>}
    </View>
    {point ? <View style={{ backgroundColor: C.bg, borderRadius: R.md, padding: S.md, gap: 4 }} accessibilityLiveRegion="polite">
      <Text style={ui.label}>{msg('chart.batchTitle', { code: point.label })}</Text>
      <Text style={ui.small}>{point.stations.join(', ')} · {point.count > 1 ? msg('chart.meanOfSamples', { count: point.count }) : msg('chart.oneSample')}</Text>
      <Text style={[ui.text, { fontWeight: '700', color: flagged ? C.danger : C.ink }]}>{paramLabel(key)}: {fmtValue(value, key)}</Text>
      {range && <Text style={ui.small}>{msg('chart.samplesPrefix')} {fmtValue(range[0], key)} – {fmtValue(range[1], key)}</Text>}
      {flagged && <Text style={[ui.small, { color: C.danger }]}>{slot.lo !== null && value! < slot.lo ? msg('chart.belowLimit', { value: formatNumber(slot.lo) }) : msg('chart.aboveLimit', { value: formatNumber(slot.hi!) })}</Text>}
    </View> : <Text style={ui.small}>{msg('mobile.tapPoint')}</Text>}
  </View>;
}

function Key({ color, text, band = false, dashed = false, dot = false }: { color: string; text: string; band?: boolean; dashed?: boolean; dot?: boolean }) {
  return <View style={ui.row}>
    {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}/>
      : band ? <View style={{ width: 18, height: 10, borderRadius: 2, backgroundColor: color, opacity: .25 }}/>
        : <View style={{ width: 18, height: 0, borderTopWidth: 2.5, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}/>}
    <Text style={ui.small}>{text}</Text>
  </View>;
}
