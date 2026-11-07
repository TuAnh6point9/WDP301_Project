import { inputFlag } from '@wqi/contracts';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayText, formatNumber, msg, qualityLabel, useLocale } from '@/i18n';
import { formatDateTime } from '@/lib/format';
import { CLASSIFICATION_COLORS, WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { flagHint, flagLabel } from '@/features/predictions/flags';
import { INPUT_FIELDS } from '@/features/predictions/inputFields';
import { fieldsForSnapshot } from '@/features/predictions/snapshotFields';
import type { PreviewCalculation } from '@/features/predictions/types';
import { Icon } from './Icon';
import { C, R, S } from './theme';
import { Badge, Callout, Card, Screen, ui } from './ui';

/** FR-06: the web ResultView — score, class, 6-band scale, the inputs used, flags, the research note and technical details. */
export function ResultView({ calc, id, actions, notice }: { calc: PreviewCalculation; id?: string; actions: ReactNode; notice?: ReactNode }) {
  useLocale();
  const [technical, setTechnical] = useState(false);
  const currentFields = INPUT_FIELDS.filter(field => Object.hasOwn(calc.inputs, field.key)).map(field => ({ key: field.key, label: field.key === 'do' ? 'DO' : field.label }));
  const historicalFields = fieldsForSnapshot(calc).filter(field => !INPUT_FIELDS.some(current => current.key === field.key));
  const fields = [...currentFields, ...historicalFields];
  const flagged = currentFields.flatMap(field => { const flag = inputFlag(field.key, calc.inputs[field.key]); return flag ? [{ ...field, flag }] : []; });
  return <Screen>
    <Card>
      <Text style={ui.small}>{msg('predictions.calculated')} {formatDateTime(calc.at)}</Text>
      <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]} accessible accessibilityLabel={`${msg('predictions.wqiScore')}: ${calc.wqi} / 100 · ${qualityLabel(calc.qualityClass)}`}>
        {/* Two Texts in a row: a nested 56 px Text inside a default-height Text is clipped on Android. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={styles.score}>{calc.wqi}</Text><Text style={ui.muted}> / 100</Text></View>
        <Badge value={calc.qualityClass} large/>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.track}>{WQI_DISPLAY_BANDS.map((band, index) => <View key={band.label} style={{ flex: (WQI_DISPLAY_BANDS[index + 1]?.min ?? 100) - band.min, backgroundColor: CLASSIFICATION_COLORS[band.label].background }}/>)}</View>
        <View style={[styles.marker, { left: `${Math.min(100, Math.max(0, calc.wqi))}%` }]}/>
      </View>
      <View style={{ gap: 6 }} accessibilityLabel={msg('predictions.displayBands')}>{WQI_DISPLAY_BANDS.map(band => {
        const current = calc.qualityClass === band.label;
        return <View key={band.label} style={[ui.row, current && styles.current]}>
          <View style={[styles.swatch, { backgroundColor: CLASSIFICATION_COLORS[band.label].background }]}/>
          <Text style={[ui.text, { flex: 1 }, current && { fontWeight: '700' }]}>{qualityLabel(band.label)} · {band.min}–{band.max}</Text>
          {current && <Text style={[ui.small, { color: C.brand, fontWeight: '700' }]}>{msg('predictions.current')}</Text>}
        </View>;
      })}</View>
    </Card>
    <Card>
      <Text style={ui.h3}>{msg('predictions.inputValues')}</Text>
      <View style={styles.tiles}>{fields.map(field => <View key={field.key} style={styles.tile}>
        <Text style={ui.small}>{displayText(field.label)}</Text><Text style={[ui.h3, { color: C.ink }]}>{String(calc.inputs[field.key])}</Text>
      </View>)}</View>
      {flagged.length > 0 && <Callout tone="warn">
        <Text style={ui.text}>{msg('flags.checkResult')}</Text>
        {flagged.map(field => <Text key={field.key} style={ui.text}>• <Text style={{ fontWeight: '700' }}>{displayText(field.label)} {String(calc.inputs[field.key])}</Text> — {flagLabel(field.flag)}: {flagHint(field.flag)}</Text>)}
      </Callout>}
      <Text style={ui.small}>{msg('predictions.researchNote')}</Text>
    </Card>
    {notice}
    <View style={{ gap: S.sm }}>{actions}</View>
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: technical }} onPress={() => setTechnical(open => !open)} style={[ui.row, { minHeight: 44, justifyContent: 'space-between' }]}>
        <Text style={ui.label}>{msg('predictions.technical')}</Text><Icon name={technical ? 'chevronDown' : 'chevronRight'} size={20} color={C.muted}/>
      </Pressable>
      {technical && <View style={{ gap: S.xs }}>
        <Text style={ui.text}>{msg('predictions.score')}: {calc.rawWqi === undefined ? msg('common.notRecorded') : formatNumber(calc.rawWqi, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        {id && <Text style={ui.small} selectable>{msg('predictions.recordId')}: {id}</Text>}
      </View>}
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({
  score: { fontSize: 56, lineHeight: 64, fontWeight: '800', color: C.ink },
  track: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden' },
  marker: { position: 'absolute', top: -5, width: 4, height: 26, marginLeft: -2, borderRadius: 2, backgroundColor: C.ink },
  swatch: { width: 18, height: 18, borderRadius: 4 },
  current: { backgroundColor: C.brandSoft, borderRadius: R.sm, paddingHorizontal: S.xs, marginHorizontal: -S.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tile: { width: '31%', flexGrow: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.sm, gap: 2 },
});
