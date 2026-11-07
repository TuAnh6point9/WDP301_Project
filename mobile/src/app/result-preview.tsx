import { USER_MESSAGES as M } from '@wqi/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { msg, useLocale } from '@/i18n';
import { errorText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { calculateWqi, forgetPreview, readPreview } from '@/features/predictions/api';
import type { Inputs } from '@/features/predictions/types';
import { ResultView } from '../ResultView';
import { Button, Callout, Screen, Status } from '../ui';

/** A guest's unsaved result. Saving needs an account; after logging in the save happens by itself (?save=1), like the web. */
export default function PreviewScreen() {
  useLocale();
  const router = useRouter();
  const { user, status } = useAuth();
  const { save: wantsSave } = useLocalSearchParams<{ save?: string }>();
  const [calc] = useState(readPreview);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const started = useRef(false);
  const save = useCallback(async () => {
    if (!calc || started.current) return;
    started.current = true; setSaving(true); setFailure(null);
    try {
      // The server recalculates from the six inputs; a result is never stored from the numbers on the phone.
      const saved = await calculateWqi(calc.inputs as Inputs);
      forgetPreview();
      router.replace({ pathname: '/result', params: { id: saved.id } });
    } catch (error) { started.current = false; setSaving(false); setFailure(error); }
  }, [calc, router]);
  useEffect(() => { if (wantsSave && user && calc) void save(); }, [wantsSave, user, calc, save]);
  if (!calc) return <Screen><Status empty={msg('predictions.noUnsaved')}/></Screen>;
  return <ResultView calc={calc} actions={<>
    {user
      ? <Button icon="save" label={saving ? msg('common.saving') : msg('predictions.saveResult')} onPress={() => void save()} busy={saving}/>
      : <Button icon="save" label={msg('predictions.signInToSave')} disabled={status === 'loading'} onPress={() => router.push({ pathname: '/login', params: { from: '/result-preview?save=1' } })}/>}
    <Button variant="secondary" icon="sparkle" label={msg('predictions.again')} onPress={() => router.dismissTo('/calculate')}/>
  </>} notice={<>
    <Callout>{msg(user ? 'predictions.notSavedYet' : 'predictions.notSavedGuest')}</Callout>
    {failure !== null && <Callout tone="warn">{errorText(failure, M.CALCULATE_FAILED)}</Callout>}
  </>}/>;
}
