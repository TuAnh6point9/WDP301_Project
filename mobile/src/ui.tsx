import type { PageMeta } from '@wqi/contracts';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { msg, qualityLabel, useLocale } from '@/i18n';
import { errorText } from '@/i18n/messages';
import { CLASSIFICATION_COLORS } from '@/features/predictions/classificationDisplay';
import { Icon, type IconName } from './Icon';
import { C, R, S, T } from './theme';

export function Screen({ children, onRefresh, refreshing = false }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return <ScrollView style={ui.screen} contentContainerStyle={ui.screenBody} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.brand]}/> : undefined}>{children}</ScrollView>;
}
export function Title({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return <View style={{ gap: S.xs }}><Text style={ui.h1} accessibilityRole="header">{children}</Text>{hint ? <Text style={ui.muted}>{hint}</Text> : null}</View>;
}
export const H2 = ({ children }: { children: ReactNode }) => <Text style={ui.h2} accessibilityRole="header">{children}</Text>;
export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[ui.card, style]}>{children}</View>;

type ButtonProps = { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost'; icon?: IconName; disabled?: boolean; busy?: boolean; small?: boolean; accessibilityHint?: string };
export function Button({ label, onPress, variant = 'primary', icon, disabled = false, busy = false, small = false, accessibilityHint }: ButtonProps) {
  const off = disabled || busy;
  const color = variant === 'primary' ? '#fff' : C.brand;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: off, busy }}
    disabled={off} onPress={onPress} android_ripple={{ color: variant === 'primary' ? '#ffffff40' : '#0E6E8C22' }}
    style={({ pressed }) => [ui.button, small && ui.buttonSmall, variant === 'primary' ? ui.primary : variant === 'secondary' ? ui.secondary : ui.ghost, off && ui.disabled, pressed && { opacity: .85 }]}>
    {busy ? <ActivityIndicator color={color}/> : icon ? <Icon name={icon} size={small ? 18 : 20} color={color}/> : null}
    <Text style={[ui.buttonText, small && { fontSize: 14 }, { color }]}>{label}</Text>
  </Pressable>;
}

export function Badge({ value, large = false, locale }: { value: string; large?: boolean; locale?: 'vi' }) {
  useLocale();
  const colors = CLASSIFICATION_COLORS[value] ?? { background: C.none, color: '#fff' };
  return <View style={[ui.badge, large && ui.badgeLarge, { backgroundColor: colors.background }]}><Text style={[ui.badgeText, large && { fontSize: 16 }, { color: colors.color }]}>{locale === 'vi' ? value : qualityLabel(value)}</Text></View>;
}

export function Callout({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; action?: ReactNode }) {
  const palette = tone === 'info' ? [C.brandSoft, C.brand] : tone === 'warn' ? [C.warnSoft, C.warn] : [C.dangerSoft, C.danger];
  return <View style={[ui.callout, { backgroundColor: palette[0] }]} accessibilityRole={tone === 'info' ? undefined : 'alert'}>
    <View style={{ flexDirection: 'row', gap: S.sm }}><Icon name={tone === 'info' ? 'info' : 'warn'} size={20} color={palette[1]}/><View style={{ flex: 1 }}>{typeof children === 'string' ? <Text style={ui.text}>{children}</Text> : children}</View></View>
    {action}
  </View>;
}

/** Loading, error (with retry) or empty state for a whole screen part. */
export function Status({ loading, error, onRetry, empty, label }: { loading?: boolean; error?: unknown; onRetry?: () => void; empty?: string; label?: string }) {
  useLocale();
  if (loading) return <View style={ui.status} accessibilityLiveRegion="polite"><ActivityIndicator color={C.brand} size="large"/><Text style={ui.muted}>{label ?? msg('common.loading')}</Text></View>;
  if (error) return <Callout tone="warn" action={onRetry ? <Button small variant="secondary" icon="refresh" label={msg('common.tryAgain')} onPress={onRetry}/> : undefined}>{errorText(error)}</Callout>;
  return empty ? <View style={ui.status}><Text style={ui.muted}>{empty}</Text></View> : null;
}

export function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (page: number) => void }) {
  useLocale();
  if (!meta || meta.pages <= 1) return null;
  return <View style={ui.pager}>
    <Button small variant="secondary" icon="chevronLeft" label={msg('common.previous')} disabled={meta.page <= 1} onPress={() => onPage(meta.page - 1)}/>
    <Text style={ui.muted}>{msg('common.pageOf', { page: meta.page, pages: meta.pages })}</Text>
    <Button small variant="secondary" icon="chevronRight" label={msg('common.next')} disabled={meta.page >= meta.pages} onPress={() => onPage(meta.page + 1)}/>
  </View>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <View style={ui.segmented} accessibilityRole="tablist" accessibilityLabel={label}>{options.map(option => {
    const on = option.value === value;
    return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(option.value)} style={[ui.segment, on && ui.segmentOn]}>
      <Text style={[ui.segmentText, on && { color: '#fff' }]}>{option.label}</Text>
    </Pressable>;
  })}</View>;
}

/** A labelled picker that opens a list (native selects are small and hard to tap). */
/** A labelled switch: the whole row is the touch target, so tapping the words works too. */
export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[ui.row, { minHeight: 48, justifyContent: 'space-between' }]}>
    <Text style={ui.label}>{label}</Text>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand }} thumbColor="#fff" importantForAccessibility="no"/>
  </Pressable>;
}

export function Select<T extends string>({ label, value, options, onChange, disabled = false }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find(option => option.value === value)?.label ?? '—';
  return <View style={{ flex: 1, gap: S.xs }}>
    <Text style={ui.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} disabled={disabled} onPress={() => setOpen(true)} style={[ui.select, disabled && ui.disabled]}>
      <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>{current}</Text><Icon name="chevronDown" size={18} color={C.muted}/>
    </Pressable>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={ui.backdrop} onPress={() => setOpen(false)} accessibilityLabel={msg('common.close')}/>
      <View style={[ui.sheet, { paddingBottom: insets.bottom + S.md }]}>
        <Text style={[ui.h2, { padding: S.lg, paddingBottom: S.sm }]}>{label}</Text>
        <ScrollView style={{ maxHeight: 420 }}>{options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: option.value === value }} android_ripple={{ color: '#0E6E8C22' }}
          onPress={() => { onChange(option.value); setOpen(false); }} style={ui.option}>
          <Text style={[ui.text, { flex: 1 }, option.value === value && { color: C.brand, fontWeight: '700' }]}>{option.label}</Text>
          {option.value === value && <Icon name="check" size={20} color={C.brand}/>}
        </Pressable>)}</ScrollView>
      </View>
    </Modal>
  </View>;
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  screenBody: { padding: S.lg, gap: S.lg, paddingBottom: 40 },
  h1: { fontSize: T.h1, fontWeight: '800', color: C.ink },
  h2: { fontSize: T.h2, fontWeight: '700', color: C.ink },
  h3: { fontSize: T.h3, fontWeight: '700', color: C.ink },
  text: { fontSize: T.body, color: C.text, lineHeight: 23 },
  muted: { fontSize: 15, color: C.muted, lineHeight: 21 },
  small: { fontSize: T.small, color: C.muted, lineHeight: 18 },
  label: { fontSize: 15, fontWeight: '600', color: C.text },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: S.lg, gap: S.md },
  button: { minHeight: 48, borderRadius: R.md, paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, overflow: 'hidden' },
  buttonSmall: { minHeight: 44, paddingHorizontal: S.md },
  primary: { backgroundColor: C.brand },
  secondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.brand },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: .45 },
  buttonText: { fontSize: T.body, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeLarge: { paddingHorizontal: 14, paddingVertical: 6 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  callout: { borderRadius: R.md, padding: S.md, gap: S.md },
  status: { alignItems: 'center', justifyContent: 'center', gap: S.md, paddingVertical: 32 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  segmented: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 44, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.sm },
  segmentOn: { backgroundColor: C.brand },
  segmentText: { fontSize: 15, fontWeight: '700', color: C.brand, textAlign: 'center' },
  select: { minHeight: 48, borderWidth: 1, borderColor: C.control, borderRadius: R.md, paddingHorizontal: S.md, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, gap: S.sm },
  backdrop: { flex: 1, backgroundColor: '#0B142066' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg },
  option: { minHeight: 52, paddingHorizontal: S.lg, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.control, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 17, color: C.text, backgroundColor: C.surface },
});
