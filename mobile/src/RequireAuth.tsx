import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { msg, useLocale } from '@/i18n';
import { useAuth } from '@/features/auth/AuthContext';
import { Button, Callout, Screen, Status } from './ui';

/** The web's RequireAuth: these screens belong to an account. A guest is asked to log in and comes back here after. */
export function RequireAuth({ from, children }: { from: string; children: ReactNode }) {
  useLocale();
  const router = useRouter();
  const { status, error, refreshSession } = useAuth();
  if (status === 'authenticated') return <>{children}</>;
  if (status === 'loading') return <Screen><Status loading/></Screen>;
  if (status === 'error') return <Screen><Status error={error} onRetry={() => void refreshSession()}/></Screen>;
  return <Screen><Callout action={<Button icon="user" label={msg('auth.login')} onPress={() => router.push({ pathname: '/login', params: { from } })}/>}>{msg('mobile.historyLogin')}</Callout></Screen>;
}
