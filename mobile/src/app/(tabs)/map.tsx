import { parameterDisplayKeys, parameterLabels } from '@wqi/contracts';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { displayText, formatNumber, msg, qualityLabel, useLocale } from '@/i18n';
import { useAreaVisibility } from '@/components/map/AreaPreference';
import { listStations } from '@/features/stations/api';
import type { Station } from '@/features/stations/types';
import { WQI_REFERENCE_GUIDANCE } from '@/features/predictions/referenceGuidance';
import { WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { useAsync } from '@/lib/useAsync';
import { batchCodeText, tone, TONE } from '@/lib/wqi';
import { Icon } from '../../Icon';
import { StationMap, TONE_COLOR, type StationMapRef } from '../../StationMap';
import { C, R, S } from '../../theme';
import { Button, Status, Toggle, ui } from '../../ui';

/** FR-02: station pins coloured by WQI class, the area outline, and a bottom panel with the list or one station. */
export default function MapScreen() {
  useLocale();
  const router = useRouter();
  const { data: stations, error, loading, reload } = useAsync(listStations);
  const { visible, setVisible } = useAreaVisibility();
  const [selected, setSelected] = useState<Station | null>(null);
  const [legend, setLegend] = useState(false);
  const map = useRef<StationMapRef>(null);
  function choose(station: Station) { setSelected(station); map.current?.focus(station); }
  return <View style={{ flex: 1, backgroundColor: C.bg }}>
    <View style={{ flex: 1 }}>
      <StationMap ref={map} stations={stations ?? []} selected={selected?.code} showArea={visible} onSelect={choose}/>
      <View style={styles.tools}>
        <Round icon="fit" label={msg('map.showAll')} onPress={() => map.current?.showAll()}/>
        <Round icon="info" label={msg('mobile.legend')} onPress={() => setLegend(on => !on)} pressed={legend}/>
      </View>
      {legend && <View style={styles.legend} accessibilityLabel={msg('map.classification')}>
        <Text style={ui.label}>{msg('map.classification')}</Text>
        {[...WQI_DISPLAY_BANDS].reverse().map(band => <View key={band.label} style={ui.row}><View style={[styles.dot, { backgroundColor: TONE_COLOR[TONE[band.label]] }]}/><Text style={ui.small}>{qualityLabel(band.label)} · {band.min}–{band.max}</Text></View>)}
        <View style={ui.row}><View style={[styles.dot, { backgroundColor: TONE_COLOR.none }]}/><Text style={ui.small}>{msg('map.noMeasurements')}</Text></View>
      </View>}
    </View>
    <View style={styles.sheet}>
      <View style={styles.handle}/>
      <Toggle label={msg('map.area')} value={visible} onChange={setVisible}/>
      {loading || error ? <Status loading={loading} error={error} onRetry={reload}/>
        : selected ? <StationDetails station={selected} onBack={() => setSelected(null)} onData={() => router.navigate({ pathname: '/data', params: { station: selected.code } })}/>
          : !stations?.length ? <Status empty={msg('map.noStations')}/>
            : <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: S.sm, paddingBottom: S.md }}>
              <Text style={ui.muted}>{msg('mobile.stationList', { count: stations.length })}</Text>
              {stations.map(station => <Pressable key={station.code} accessibilityRole="button" onPress={() => choose(station)} android_ripple={{ color: '#0E6E8C22' }} style={styles.item}>
                <View style={[styles.dot, { width: 14, height: 14, backgroundColor: TONE_COLOR[tone(station.latest?.wqi)] }]}/>
                <View style={{ flex: 1 }}><Text style={ui.label}>{station.code} · {station.name}</Text><Text style={ui.small}>{station.latest?.wqi == null ? msg('map.noData') : `WQI ${station.latest.wqi} · ${qualityLabel(station.latest.qualityClass ?? '')}`}</Text></View>
                <Icon name="chevronRight" size={20} color={C.muted}/>
              </Pressable>)}
            </ScrollView>}
    </View>
  </View>;
}

function StationDetails({ station, onBack, onData }: { station: Station; onBack: () => void; onData: () => void }) {
  const latest = station.latest;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: S.md, paddingBottom: S.md }}>
    <Button small variant="ghost" icon="back" label={msg('map.all', { count: '' }).replace(/\s*\(\)$/, '')} onPress={onBack}/>
    <View style={{ gap: 2 }}>
      <Text style={ui.h2}>{msg('map.stationTitle', { code: station.code })}</Text>
      <Text style={ui.text}>{station.name}</Text>
      <Text style={ui.small}>{station.lat.toFixed(4)}°N, {station.lng.toFixed(4)}°E</Text>
    </View>
    {latest ? <>
      <View style={[ui.row, { gap: S.md }]}>
        {latest.wqi != null && <Text style={styles.wqi}>{latest.wqi}</Text>}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ui.label}>{latest.wqi == null ? msg('stations.noWqi') : qualityLabel(latest.qualityClass ?? '')}</Text>
          <Text style={ui.small}>{batchCodeText(latest)}</Text>
        </View>
      </View>
      <Text style={ui.label}>{msg('map.parameters')}</Text>
      <View style={styles.tiles}>{parameterDisplayKeys.map(key => <View key={key} style={styles.tile}>
        <Text style={ui.small}>{parameterLabels[key]}</Text>
        <Text style={[ui.h3, { color: C.ink }]}>{formatNumber(latest.parameters[key])}</Text>
        {WQI_REFERENCE_GUIDANCE[key].referenceUnit ? <Text style={ui.small}>{displayText(WQI_REFERENCE_GUIDANCE[key].referenceUnit)}</Text> : null}
      </View>)}</View>
    </> : <Text style={ui.muted}>{msg('map.noMeasurementsHint')}</Text>}
    <Button icon="chart" label={msg('map.stationHistory')} onPress={onData}/>
  </ScrollView>;
}

function Round({ icon, label, onPress, pressed = false }: { icon: 'fit' | 'info'; label: string; onPress: () => void; pressed?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: pressed }} onPress={onPress} android_ripple={{ color: '#0E6E8C33', foreground: true }}
    style={[styles.round, pressed && { backgroundColor: C.brandSoft }]}><Icon name={icon} size={22} color={C.brand}/></Pressable>;
}

const styles = StyleSheet.create({
  tools: { position: 'absolute', right: S.md, top: S.md, gap: S.sm },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.control },
  legend: { position: 'absolute', left: S.md, top: S.md, backgroundColor: C.surface, borderRadius: R.md, padding: S.md, gap: 6, borderWidth: 1, borderColor: C.line },
  dot: { width: 12, height: 12, borderRadius: 7 },
  sheet: { height: '46%', backgroundColor: C.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, paddingHorizontal: S.lg, paddingTop: S.sm, gap: S.sm, elevation: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line },
  item: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingHorizontal: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  wqi: { fontSize: 40, fontWeight: '800', color: C.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tile: { width: '31%', flexGrow: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.sm, gap: 2 },
});
