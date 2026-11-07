import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { i18n, msg, storedLocale, useLocale } from '@/i18n';
import { http } from '@/lib/http';
import { AuthProvider } from '@/features/auth/AuthContext';
import { AreaPreferenceProvider } from '@/components/map/AreaPreference';
import { installStorage } from '../boot';
import { C } from '../theme';

void SplashScreen.preventAutoHideAsync();
// Same API path as the web (the Vercel rewrite), or a local test server; see mobile/.env.example.
http.defaults.baseURL = process.env.EXPO_PUBLIC_API_URL || 'https://wqi-project.vercel.app/api/v1';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void installStorage(AsyncStorage).then(async () => {
      await i18n.changeLanguage(storedLocale());
      setReady(true);
      void SplashScreen.hideAsync();
    });
  }, []);
  // Saved language, guides already seen and the area switch must be read before the first screen.
  if (!ready) return null;
  return <SafeAreaProvider><AreaPreferenceProvider><AuthProvider><Routes/></AuthProvider></AreaPreferenceProvider></SafeAreaProvider>;
}

function Routes() {
  useLocale();
  return <>
    <StatusBar style="light"/>
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.brand }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }}/>
      <Stack.Screen name="result" options={{ title: msg('predictions.resultTitle') }}/>
      <Stack.Screen name="result-preview" options={{ title: msg('predictions.resultTitle') }}/>
      <Stack.Screen name="login" options={{ title: msg('auth.login') }}/>
      <Stack.Screen name="report" options={{ title: msg('report.title') }}/>
      <Stack.Screen name="excel/[id]" options={{ title: msg('excel.title') }}/>
    </Stack>
  </>;
}
