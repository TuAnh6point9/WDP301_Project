import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { msg, qualityLabel, useLocale } from '@/i18n';
import { CLASSIFICATION_COLORS, WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { Icon, type IconName } from '../../Icon';
import { C, R, S, T } from '../../theme';
import { Button, Card, H2, Screen, ui } from '../../ui';

const STEPS: [IconName, Parameters<typeof msg>[0], Parameters<typeof msg>[0]][] = [
  ['sparkle', 'home.enterParameters', 'home.enterHint'],
  ['check', 'home.validate', 'home.validateHint'],
  ['chart', 'home.inference', 'home.inferenceHint'],
  ['clock', 'home.results', 'home.resultsHint'],
];

/** FR-01: what the system is, the WQI scale, the four steps and a way to the map (no hero video on the phone). */
export default function Home() {
  useLocale();
  const router = useRouter();
  return <Screen>
    <View style={styles.hero}>
      <Text style={styles.heroTitle} accessibilityRole="header">{msg('home.heroLead')}{' '}<Text style={{ color: '#9FE3F5' }}>{msg('home.heroAccent')}</Text></Text>
      <Text style={styles.heroText}>{msg('home.introduction')}</Text>
      <View style={{ gap: S.sm }}>
        <Button label={msg('home.ctaCalculate')} icon="sparkle" onPress={() => router.navigate('/calculate')} variant="secondary"/>
        <Button label={msg('home.ctaMap')} icon="pin" onPress={() => router.navigate('/map')} variant="secondary"/>
      </View>
    </View>
    <Card>
      <H2>{msg('home.whatIsWqi')}</H2>
      <Text style={ui.text}>{msg('home.wqiDescription')}</Text>
      <View style={styles.scale} accessibilityElementsHidden>{WQI_DISPLAY_BANDS.map(band => <View key={band.label} style={{ flex: band.max - band.min + 1, backgroundColor: CLASSIFICATION_COLORS[band.label].background }}/>)}</View>
      <View style={{ gap: S.sm }}>{[...WQI_DISPLAY_BANDS].reverse().map(band => <View key={band.label} style={ui.row}>
        <View style={[styles.swatch, { backgroundColor: CLASSIFICATION_COLORS[band.label].background }]}/>
        <Text style={[ui.text, { flex: 1 }]}>{qualityLabel(band.label)}</Text><Text style={ui.muted}>{band.min}–{band.max}</Text>
      </View>)}</View>
    </Card>
    <Card>
      <H2>{msg('home.process')}</H2>
      <Text style={ui.muted}>{msg('home.processHint')}</Text>
      {STEPS.map(([icon, title, hint], index) => <View key={title} style={styles.step}>
        <View style={styles.stepIcon}><Icon name={icon} size={22} color={C.brand}/></View>
        <View style={{ flex: 1, gap: 2 }}><Text style={ui.h3}>{index + 1}. {msg(title)}</Text><Text style={ui.muted}>{msg(hint)}</Text></View>
      </View>)}
    </Card>
    <Card>
      <H2>{msg('home.mapTitle')}</H2>
      <Text style={ui.muted}>{msg('home.mapHint')}</Text>
      <Button label={msg('home.fullMap')} icon="pin" onPress={() => router.navigate('/map')}/>
    </Card>
    <View style={{ gap: S.xs, paddingHorizontal: S.xs }}>
      <Text style={ui.small}>{msg('home.footerDescription')}</Text>
      <Text style={ui.small}>{msg('home.copyright')}</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { backgroundColor: C.brand, borderRadius: R.lg, padding: S.xl, gap: S.lg },
  heroTitle: { color: '#fff', fontSize: 28, lineHeight: 36, fontWeight: '800' },
  heroText: { color: '#DCEFF5', fontSize: T.body, lineHeight: 24 },
  scale: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden' },
  swatch: { width: 18, height: 18, borderRadius: 4 },
  step: { flexDirection: 'row', gap: S.md, alignItems: 'flex-start' },
  stepIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
});
