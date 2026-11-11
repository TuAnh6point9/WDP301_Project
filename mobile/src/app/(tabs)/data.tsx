import { getVnWqiQualityClass } from '@wqi/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatNumber, msg, useLocale } from '@/i18n';
import { listStations } from '@/features/stations/api';
import { getQcvnColumn, getSamples } from '@/features/water-records/api';
import type { QcvnChoice } from '@wqi/contracts';
import { CHART_KEYS, MEASUREMENT_KEYS, PARAMS, qcvnLimit, roundLabel, roundPoints, type Round, type Sample } from '@/features/water-records/series';
import { delta, status } from '@/features/water-records/components/ParameterTiles';
import { exceeds, fmtValue, SLOT_STYLE, type Slot } from '@/features/water-records/components/TrendChart';
import { clientPage } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { BatchChart } from '../../BatchChart';
import { Guide, type GuideStep } from '../../Guide';
import { C, R, S } from '../../theme';
import { Badge, Button, Card, H2, Pager, Screen, Select, Status, Title, ui } from '../../ui';

// The six measurements then WQI, as on the web, with the admin's QCVN column; the phone has no limit editor (accepted simplification).
const slotsFor = (column: QcvnChoice): Slot[] => CHART_KEYS.map(key => ({ key, ...qcvnLimit(key, column), on: true }));
const WQI_SLOT = CHART_KEYS.indexOf('WQI');
const STEPS: GuideStep[] = [
  { title: 'guide.chartFiltersTitle', body: 'mobile.guideChartFiltersBody' },
  { title: 'guide.chartRoundsTitle', body: 'guide.chartRoundsBody' },
  { title: 'guide.chartParametersTitle', body: 'mobile.guideChartParametersBody' },
  { title: 'guide.chartPointsTitle', body: 'mobile.guideChartPointsBody' },
  { title: 'guide.chartTableTitle', body: 'mobile.guideChartTableBody' },
];

/** FR-03/FR-04: verified samples by batch code, one parameter charted at a time, and the samples list. */
export default function DataScreen() {
  useLocale();
  const { data, error, loading, reload } = useAsync(() => Promise.all([getSamples(), listStations(), getQcvnColumn()]));
  if (!data) return <Screen>
    <View style={[ui.row, { justifyContent: 'space-between' }]}><Title>{msg('chart.title')}</Title><Guide id="chart" title="guide.chartTitle" steps={STEPS} ready={false}/></View>
    <Status loading={loading} error={error} onRetry={reload}/>
  </Screen>;
  const [{ rounds, samples }, stations, column] = data;
  return <HistoricalData codes={stations.map(s => s.code)} rounds={rounds} samples={samples} column={column} onRefresh={reload}/>;
}

function HistoricalData({ codes, rounds, samples, column, onRefresh }: { codes: string[]; rounds: Round[]; samples: Sample[]; column: QcvnChoice; onRefresh: () => void }) {
  const SLOTS = useMemo(() => slotsFor(column), [column]);
  useLocale();
  const params = useLocalSearchParams<{ station?: string }>();
  const [station, setStation] = useState('all');
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [focus, setFocus] = useState(0);
  const [page, setPage] = useState(1);
  // The map's "data for this station" button lands here with ?station=CODE, also when this tab is already open.
  useEffect(() => {
    if (params.station && codes.includes(params.station)) { setStation(params.station); setRange({ from: null, to: null }); setPage(1); }
  }, [params.station, codes]);

  const stationSamples = useMemo(() => station === 'all' ? samples : samples.filter(sample => sample.station === station), [samples, station]);
  const stationRounds = useMemo(() => { const keys = new Set(stationSamples.map(sample => sample.round)); return rounds.filter(round => keys.has(round.key)); }, [rounds, stationSamples]);
  const position = (key: string | null, fallback: number) => { const at = stationRounds.findIndex(round => round.key === key); return at < 0 ? fallback : at; };
  const first = position(range.from, 0), last = position(range.to, stationRounds.length - 1);
  const shownRounds = stationRounds.slice(Math.min(first, last), Math.max(first, last) + 1);
  const shownKeys = new Set(shownRounds.map(round => round.key));
  const shownSamples = stationSamples.filter(sample => shownKeys.has(sample.round));
  const points = roundPoints(shownRounds, shownSamples);
  /** Same rule as the web: a start after the end (or an end before the start) moves the other end with it. */
  function pickRound(end: 'from' | 'to', key: string) {
    const at = position(key, 0);
    setRange(end === 'from' ? { from: key, to: at > last ? key : range.to } : { to: key, from: at < first ? key : range.from });
    setPage(1);
  }
  const order = new Map(rounds.map((round, i) => [round.key, i]));
  const tableRows = [...shownSamples].sort((a, b) => order.get(b.round)! - order.get(a.round)! || a.station.localeCompare(b.station, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const { rows: shown, meta } = clientPage(tableRows, page);
  const roundOf = new Map(rounds.map(round => [round.key, round]));
  const roundOptions = stationRounds.map(round => ({ value: round.key, label: roundLabel(round) }));
  const mainKey = CHART_KEYS[focus];

  return <Screen onRefresh={onRefresh}>
    <View style={[ui.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
      <View style={{ flex: 1 }}><Title hint={msg('chart.description')}>{msg('chart.title')}</Title></View>
      <Guide id="chart" title="guide.chartTitle" steps={STEPS}/>
    </View>
    <Card>
      <Select label={msg('common.station')} value={station} onChange={value => { setStation(value); setRange({ from: null, to: null }); setPage(1); }}
        options={[{ value: 'all', label: msg('chart.allStations') }, ...codes.map(code => ({ value: code, label: code }))]}/>
      <View style={[ui.row, { gap: S.md, alignItems: 'flex-start' }]}>
        <Select label={msg('chart.fromBatch')} disabled={!roundOptions.length} value={stationRounds[Math.min(first, last)]?.key ?? ''} options={roundOptions} onChange={key => pickRound('from', key)}/>
        <Select label={msg('chart.toBatch')} disabled={!roundOptions.length} value={stationRounds[Math.max(first, last)]?.key ?? ''} options={roundOptions} onChange={key => pickRound('to', key)}/>
      </View>
      {shownRounds.length < stationRounds.length && <Button small variant="ghost" icon="refresh" label={msg('chart.allBatches')} onPress={() => { setRange({ from: null, to: null }); setPage(1); }}/>}
    </Card>

    <Card>
      <View style={{ gap: 2 }}>
        <H2>{station === 'all' ? msg('chart.multiSite') : msg('chart.singleSite', { station })}</H2>
        <Text style={ui.small}>{points.length ? `${points[0].label} – ${points.at(-1)!.label} · ` : ''}{msg('chart.batchCount', { count: points.length })} · {msg('chart.sampleCount', { count: tableRows.length })}</Text>
      </View>
      <View style={styles.tiles} accessibilityLabel={msg('chart.selectParameter')}>
        {SLOTS.map((slot, index) => {
          const key = CHART_KEYS[index], values = points.map(p => p.mean[key]).filter((v): v is number => v !== null);
          const latest = values.at(-1) ?? null, state = status(latest, slot), on = index === focus;
          const change = latest !== null && values.length > 1 ? delta(latest, values.at(-2)!, points.at(-2)!.label, key) : null;
          return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFocus(index)} android_ripple={{ color: '#0E6E8C22' }}
            style={[styles.tile, on && { borderColor: SLOT_STYLE[index].color, borderWidth: 2, backgroundColor: C.brandSoft }]}>
            <View style={ui.row}><View style={[styles.swatch, { backgroundColor: SLOT_STYLE[index].color }]}/><Text style={ui.label}>{PARAMS[key].name}</Text></View>
            <Text style={styles.value}>{fmtValue(latest, key)}</Text>
            <Text style={[ui.small, change?.tone === 'good' && { color: C.ok }, change?.tone === 'bad' && { color: C.danger }]} numberOfLines={2}>{change?.text ?? (latest !== null ? msg('chart.inBatch', { code: points.at(-1)!.label }) : msg('chart.noSamplesPeriod'))}</Text>
            {/* WQI has no QCVN limit: its card gives the quality class of the latest batch, as on the web. */}
            {key === 'WQI' && latest !== null && slot.lo === null && slot.hi === null
              ? <View style={ui.row}><Badge value={getVnWqiQualityClass(latest)}/></View>
              : <Text style={[ui.small, { fontWeight: '700', color: state.tone === 'bad' ? C.danger : state.tone === 'ok' ? C.ok : C.muted }]}>{state.text}</Text>}
          </Pressable>;
        })}
      </View>
      <Text style={ui.h3}>{PARAMS[mainKey].name}{PARAMS[mainKey].unit !== PARAMS[mainKey].name ? <Text style={ui.muted}> ({PARAMS[mainKey].unit})</Text> : null}</Text>
      <BatchChart key={`${station}-${focus}`} points={points} slot={SLOTS[focus]} index={focus}/>
      <Text style={ui.small}>{msg('mobile.chartDataNote')}</Text>
    </Card>

    <Card>
      <H2>{msg('mobile.samples')}</H2>
      {!shown.length && <Text style={ui.muted}>{msg('chart.emptyRange')}</Text>}
      {shown.map(sample => <View key={sample.id} style={styles.sample}>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.label}>{roundLabel(roundOf.get(sample.round)!)} · {sample.station}</Text>
          {sample.wqi === null ? <Text style={ui.muted}>WQI —</Text> : <View style={ui.row}><Text style={[ui.label, focus === WQI_SLOT && { color: C.ink, fontWeight: '800' }]}>WQI {formatNumber(sample.wqi)}</Text><Badge value={getVnWqiQualityClass(sample.wqi)}/></View>}
        </View>
        <View style={styles.values}>{MEASUREMENT_KEYS.map((key, n) => {
          const over = exceeds(sample.values[key], SLOTS[n]);
          return <Text key={key} style={[ui.small, styles.cell, n === focus && { fontWeight: '700', color: C.ink }, over && { color: C.danger, fontWeight: '700' }]}>
            {PARAMS[key].name}: {formatNumber(sample.values[key])}{over ? ' ⚠' : ''}
          </Text>;
        })}</View>
      </View>)}
      <Pager meta={meta} onPage={setPage}/>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tile: { width: '48%', flexGrow: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: 4, overflow: 'hidden' },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  value: { fontSize: 24, fontWeight: '800', color: C.ink },
  sample: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, gap: S.sm },
  values: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  cell: { width: '50%' },
});
