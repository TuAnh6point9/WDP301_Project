import { useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { useAuth } from '@/features/auth/AuthContext';
import { guestPreference, markGuestSeen, preferences, remember, type GuideId } from '@/components/guides/guidePolicy';
import { C, R, S } from './theme';
import { Button, ui } from './ui';

export type GuideStep = { title: TranslationKey; body: TranslationKey; extra?: () => ReactNode };

/**
 * The web's FeatureGuide as a step dialog (no spotlight on the phone). Same rules: a guest sees it once on this phone,
 * an account only when the server says this is its first sign-in; finishing or skipping is remembered per account.
 */
export function Guide({ id, title, steps, ready = true }: { id: GuideId; title: TranslationKey; steps: GuideStep[]; ready?: boolean }) {
  useLocale();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  // Tabs stay mounted behind other screens; a Modal there would cover whatever screen is showing.
  const focused = useIsFocused();
  const [index, setIndex] = useState<number | null>(null);
  const accountId = auth.user?._id;
  const allowed = auth.status === 'anonymous' || (auth.status === 'authenticated' && auth.autoGuides);
  function start() { setIndex(0); if (!accountId) markGuestSeen(id); }
  useEffect(() => {
    if (!allowed || !ready || !focused || index !== null) return;
    const saved = accountId ? preferences(id, accountId) : guestPreference(id);
    if (!saved.dismissed && !saved.completed.includes('overview')) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per account and readiness, like the web
  }, [allowed, ready, focused, accountId, id]);
  function end(skipped: boolean) { if (accountId) remember(id, accountId, 'overview', skipped); setIndex(null); }
  const step = index === null ? null : steps[index];
  return <>
    <Button small variant="secondary" icon="help" label={msg('mobile.guide')} onPress={start} disabled={!ready}/>
    <Modal visible={step !== null && focused} transparent animationType="fade" onRequestClose={() => end(true)}>
      <View style={{ flex: 1, backgroundColor: '#0B142080', justifyContent: 'flex-end' }}>
        {step && <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, padding: S.lg, paddingBottom: insets.bottom + S.lg, gap: S.md, maxHeight: '80%' }} accessibilityViewIsModal>
          <Text style={ui.small}>{msg(title)} · {msg('guide.step', { current: index! + 1, total: steps.length })}</Text>
          <Text style={ui.h2} accessibilityRole="header">{msg(step.title)}</Text>
          <ScrollView contentContainerStyle={{ gap: S.sm }}><Text style={ui.text}>{msg(step.body)}</Text>{step.extra?.()}</ScrollView>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <Button small variant="ghost" label={msg('guide.skip')} onPress={() => end(true)}/>
            <View style={ui.row}>
              {index! > 0 && <Button small variant="secondary" label={msg('guide.back')} onPress={() => setIndex(index! - 1)}/>}
              {index! < steps.length - 1
                ? <Button small label={msg('guide.next')} onPress={() => setIndex(index! + 1)}/>
                : <Button small label={msg('guide.finish')} onPress={() => end(false)}/>}
            </View>
          </View>
        </View>}
      </View>
    </Modal>
  </>;
}
