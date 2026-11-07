import { USER_MESSAGES as M } from '@wqi/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { msg, useLocale } from '@/i18n';
import { messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { getCalculation } from '@/features/predictions/api';
import { useAsync } from '@/lib/useAsync';
import { RequireAuth } from '../RequireAuth';
import { ResultView } from '../ResultView';
import { Button, Screen, Status } from '../ui';

/** A saved calculation, read back from the signed-in user's history. */
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RequireAuth from={`/result?id=${encodeURIComponent(id ?? '')}`}><Saved id={id ?? null}/></RequireAuth>;
}

function Saved({ id }: { id: string | null }) {
  useLocale();
  const router = useRouter();
  const { user, sessionEpoch } = useAuth();
  const { data: calc, error, loading, reload } = useAsync(() => getCalculation(id), [id, user?._id, sessionEpoch]);
  if (loading || error) return <Screen><Status loading={loading} error={error} onRetry={reload}/></Screen>;
  if (!calc) return <Screen><Status empty={messageText(M.RESULT_NOT_FOUND)}/></Screen>;
  return <ResultView calc={calc} id={calc.id} actions={<>
    <Button icon="sparkle" label={msg('predictions.again')} onPress={() => router.dismissTo('/calculate')}/>
    <Button variant="secondary" icon="clock" label={msg('predictions.viewHistory')} onPress={() => router.dismissTo('/history')}/>
  </>}/>;
}
