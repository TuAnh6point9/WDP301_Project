import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputInstance } from 'react-native';
import { msg, useLocale } from '@/i18n';
import { errorText, messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { C, S } from '../theme';
import { Button, Callout, Card, Screen, Title, ui } from '../ui';

/** FR-07 sign-in (accounts are created by the admin; there is no sign-up). Admins stay on the user side: the app has no admin pages. */
export default function LoginScreen() {
  useLocale();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { signIn, pending, status, error: sessionError, refreshSession } = useAuth();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [failure, setFailure] = useState('');
  const submitting = useRef(false);
  const passwordInput = useRef<TextInputInstance>(null);
  async function submit() {
    if (submitting.current || pending || status === 'loading') return;
    submitting.current = true; setFailure('');
    try {
      await signIn({ email: email.trim(), password });
      setPassword('');
      if (from?.startsWith('/') && !from.startsWith('//') && !from.startsWith('/admin')) router.replace(from as never);
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (error) { setFailure(userErrorMessage(error, M.LOGIN_FAILED)); }
    finally { submitting.current = false; }
  }
  const off = pending || status === 'loading' || status === 'error';
  return <Screen>
    <Title hint={msg('auth.welcomeHint')}>{msg('auth.welcome')}</Title>
    {from?.startsWith('/result-preview') && <Callout>{msg('auth.saveResultHint')}</Callout>}
    <Card>
      <View style={{ gap: S.xs }}>
        <Text style={ui.label} nativeID="email-label">{msg('auth.email')}</Text>
        <TextInput style={ui.input} accessibilityLabelledBy="email-label" accessibilityLabel={msg('auth.email')} value={email} onChangeText={setEmail} editable={!pending}
          keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" maxLength={254} placeholder="you@ankimhai.gov.vn" placeholderTextColor={C.faint}
          returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()}/>
      </View>
      <View style={{ gap: S.xs }}>
        <Text style={ui.label} nativeID="password-label">{msg('auth.password')}</Text>
        <TextInput ref={passwordInput} style={ui.input} accessibilityLabelledBy="password-label" accessibilityLabel={msg('auth.password')} value={password} onChangeText={setPassword} editable={!pending}
          secureTextEntry autoCapitalize="none" autoComplete="current-password" maxLength={128} returnKeyType="go" onSubmitEditing={() => void submit()}/>
      </View>
      {(failure || sessionError) && <Callout tone="warn">{failure ? messageText(failure) : errorText(sessionError, M.SESSION_RESTORE)}</Callout>}
      {status === 'error' && <Button variant="secondary" icon="refresh" label={msg('auth.retryConnection')} onPress={() => void refreshSession()}/>}
      <Button icon="user" label={pending ? msg('auth.loggingIn') : status === 'loading' ? msg('auth.checkingSession') : msg('auth.login')} onPress={() => void submit()} disabled={off || !email.trim() || !password} busy={pending}/>
    </Card>
    <Text style={[ui.small, { textAlign: 'center' }]}>{msg('auth.provisioned')} {msg('auth.contact')} admin@ankimhai.gov.vn {msg('auth.forAccess')}</Text>
  </Screen>;
}
