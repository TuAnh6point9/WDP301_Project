import { inputFlag, USER_MESSAGES } from '@wqi/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputInstance } from 'react-native';
import { displayText, msg, useLocale } from '@/i18n';
import { errorText, messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { aiWaking, getAiStatus } from '@/features/predictions/api';
import { flagHint, flagLabel } from '@/features/predictions/flags';
import { checkInputs, EMPTY_INPUTS, submitFailure, type FieldErrors } from '@/features/predictions/formRules';
import { INPUT_FIELDS } from '@/features/predictions/inputFields';
import type { Inputs } from '@/features/predictions/types';
import { usePolledAsync } from '@/lib/usePolledAsync';
import { Guide, type GuideStep } from '../../Guide';
import { Icon } from '../../Icon';
import { ExcelPick } from '../../ExcelPick';
import { submitPrediction } from '../../predict';
import { C, S } from '../../theme';
import { Button, Callout, Card, Screen, Title, ui } from '../../ui';

const STEPS: GuideStep[] = [
  { title: 'guide.welcomeTitle', body: 'guide.welcomeBody' },
  { title: 'guide.inputsTitle', body: 'guide.inputsBody', extra: () => INPUT_FIELDS.map(field => <Text key={field.key} style={ui.text}><Text style={{ fontWeight: '700' }}>{displayText(field.label)}: </Text>{msg(`guide.field${field.key}`)}</Text>) },
  { title: 'guide.calculateTitle', body: 'mobile.guideCalculateBody', extra: () => <Text style={ui.muted}>{msg('guide.resetNote')}</Text> },
  { title: 'guide.resultsTitle', body: 'guide.resultsBody', extra: () => (['guide.resultScore', 'guide.resultInputs', 'guide.resultHistory'] as const).map(key => <Text key={key} style={ui.text}>• {msg(key)}</Text>) },
];

/** FR-05: the web form's six fields with its rules (shared formRules), the AI status and, for accounts, the Excel upload. */
export default function CalculateScreen() {
  useLocale();
  const router = useRouter();
  const { user, status: authStatus, sessionEpoch } = useAuth();
  const session = useRef(sessionEpoch);
  session.current = sessionEpoch;
  const aiStatus = usePolledAsync(getAiStatus, aiWaking);
  const { data: ai, loading: checking, waiting: waking, reload } = aiStatus;
  const statusError = waking ? null : aiStatus.error;
  const [values, setValues] = useState(EMPTY_INPUTS);
  const [touched, setTouched] = useState<Partial<Record<keyof Inputs, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState('');
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const inputs = useRef<(TextInputInstance | null)[]>([]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const { candidate, errors, firstInvalid } = checkInputs(values, ai?.inputDomain);
  const blocked = uploading || checking || waking || Boolean(statusError) || !ai?.available || authStatus === 'loading';

  async function submit() {
    if (sending || blocked) return;
    setSubmitted(true); setServerErrors({}); setFailure('');
    const started = sessionEpoch;
    setSending(true);
    try {
      const outcome = await submitPrediction(values, Boolean(user), ai?.inputDomain);
      if (!mounted.current || started !== session.current) return;
      if (outcome.kind === 'invalid') inputs.current[outcome.firstInvalid]?.focus();
      else if (outcome.kind === 'saved') router.push({ pathname: '/result', params: { id: outcome.id } });
      else router.push('/result-preview');
    } catch (error) {
      if (!mounted.current || started !== session.current) return;
      const result = submitFailure(error, Boolean(user));
      setServerErrors(result.fieldErrors); setFailure(result.failure);
    } finally { if (mounted.current) setSending(false); }
  }
  function reset() { if (sending) return; setValues(EMPTY_INPUTS); setTouched({}); setSubmitted(false); setServerErrors({}); setFailure(''); }
  function change(key: keyof Inputs, text: string) { setValues(previous => ({ ...previous, [key]: text })); setServerErrors(previous => ({ ...previous, [key]: undefined })); }
  return <Screen>
    <View style={[ui.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
      <View style={{ flex: 1 }}><Title hint={msg('predictions.calculateHint')}>{msg('predictions.calculateTitle')}</Title></View>
      <Guide id="calculate" title="guide.title" steps={STEPS} ready={!sending && !uploading}/>
    </View>
    <Card>
      {INPUT_FIELDS.map((field, index) => {
        // Same lock as the web (03/11): a field opens once every field before it is valid; no red text under a locked field.
        const locked = firstInvalid >= 0 && index > firstInvalid;
        const shown = touched[field.key] || submitted;
        const issue = locked ? undefined : serverErrors[field.key] || (shown ? errors[field.key] : undefined);
        const noted = shown && !issue && !locked;
        const flag = noted ? inputFlag(field.key, candidate[field.key]) : null;
        const hint = issue ? messageText(issue) : flag ? `${flagLabel(flag)}: ${flagHint(flag)}` : displayText(field.referenceHint);
        const tone = issue ? C.danger : flag === 'likely-typo' ? C.danger : flag ? C.warn : C.muted;
        return <View key={field.key} style={{ gap: S.xs, opacity: locked ? .5 : 1 }}>
          <Text style={ui.label} nativeID={`${field.key}-label`}>{displayText(field.label)}{field.referenceUnit ? <Text style={ui.small}>  ({field.referenceUnit})</Text> : null}</Text>
          {/* Number pad only, so the web's "<x" (below detection) cannot be typed here; the user dropped the "<" button (07/11). */}
          <TextInput ref={element => { inputs.current[index] = element; }} accessibilityLabel={displayText(field.label)} accessibilityLabelledBy={`${field.key}-label`} accessibilityHint={hint}
            style={[ui.input, issue ? { borderColor: C.danger, borderWidth: 2 } : flag ? { borderColor: tone, borderWidth: 2 } : null, locked && { backgroundColor: C.bg }]}
            keyboardType="decimal-pad" autoComplete="off" autoCorrect={false} editable={!sending && !locked} value={values[field.key]}
            returnKeyType={index < INPUT_FIELDS.length - 1 ? 'next' : 'done'} onSubmitEditing={() => inputs.current[index + 1]?.focus()}
            onChangeText={text => change(field.key, text)} onBlur={() => setTouched(previous => ({ ...previous, [field.key]: true }))}/>
          <Text style={[ui.small, { color: tone }, (issue || flag) && { fontWeight: '600' }]} accessibilityLiveRegion={issue ? 'polite' : 'none'}>{hint}</Text>
        </View>;
      })}
      {failure ? <Callout tone="warn">{messageText(failure)}</Callout> : null}
      {(checking || waking || statusError || !ai?.available) && <Callout tone={checking || waking ? 'info' : 'warn'}
        action={<Button small variant="secondary" icon="refresh" label={msg('predictions.checkAgain')} onPress={reload} disabled={checking || sending}/>}>
        {`${msg('predictions.aiService')} ${waking ? msg('predictions.aiStarting') : checking ? msg('predictions.checking') : statusError ? `${messageText(USER_MESSAGES.STATUS_UNAVAILABLE)} ${errorText(statusError, USER_MESSAGES.AI_UNAVAILABLE)}` : `${messageText(ai?.configured ? USER_MESSAGES.STATUS_NOT_READY : USER_MESSAGES.STATUS_NOT_CONFIGURED)} ${messageText(USER_MESSAGES.AI_UNAVAILABLE)}`}`}
      </Callout>}
      <Button icon="sparkle" label={sending ? msg('predictions.calculating') : msg('common.calculate')} onPress={() => void submit()} disabled={blocked} busy={sending}/>
      <Button variant="secondary" label={msg('common.reset')} onPress={reset} disabled={sending}/>
    </Card>
    {authStatus !== 'loading' && <Card>
      {user ? <ExcelPick disabled={sending} onBusyChange={setUploading}/> : <>
        <View style={ui.row}><Icon name="user" size={20} color={C.muted}/><Text style={[ui.muted, { flex: 1 }]}>{msg('predictions.guestHint')}</Text></View>
        <View style={ui.row}><Icon name="spreadsheet" size={20} color={C.muted}/><Text style={[ui.muted, { flex: 1 }]}>{msg('predictions.guestExcel')}</Text></View>
        <Button small variant="secondary" icon="user" label={msg('auth.login')} onPress={() => router.push({ pathname: '/login', params: { from: '/calculate' } })}/>
      </>}
    </Card>}
  </Screen>;
}
