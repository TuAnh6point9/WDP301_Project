import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { changeLocale, currentLocale, msg, useLocale } from '@/i18n';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon, type IconName } from '../../Icon';
import { C } from '../../theme';

const TABS: { name: string; title: Parameters<typeof msg>[0]; tab?: Parameters<typeof msg>[0]; icon: IconName }[] = [
  { name: 'index', title: 'common.home', icon: 'home' },
  { name: 'map', title: 'common.map', icon: 'pin' },
  // Five tabs share a phone's width: the data tab gets a short name, its screen keeps the full title.
  { name: 'data', title: 'common.historicalData', tab: 'mobile.dataTab', icon: 'chart' },
  { name: 'calculate', title: 'common.predict', icon: 'sparkle' },
  { name: 'history', title: 'common.history', icon: 'clock' },
];

/** VI/EN and the account button, on every tab like the web's top bar. */
function HeaderActions() {
  const locale = useLocale();
  const router = useRouter();
  const { user, status, pending, signOut } = useAuth();
  const next = locale === 'vi' ? 'en' : 'vi';
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={msg('mobile.switchLanguage', { language: next === 'en' ? 'English' : 'Tiếng Việt' })} onPress={() => changeLocale(next)}
      android_ripple={{ color: '#ffffff40', borderless: true }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
      <Icon name="globe" size={20} color="#fff"/><Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{currentLocale().toUpperCase()}</Text>
    </Pressable>
    {status !== 'loading' && <Pressable accessibilityRole="button" accessibilityLabel={user ? `${msg('auth.logout')} · ${msg('mobile.signedInAs', { name: user.name })}` : msg('auth.login')}
      disabled={pending} onPress={() => { if (user) void signOut(); else router.push('/login'); }}
      android_ripple={{ color: '#ffffff40', borderless: true }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 6 }}>
      <Icon name={user ? 'logout' : 'user'} size={20} color="#fff"/><Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{user ? msg('auth.logout') : msg('auth.login')}</Text>
    </Pressable>}
  </View>;
}

export default function TabsLayout() {
  useLocale();
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: C.brand }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' },
    headerRight: () => <HeaderActions/>,
    tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.muted, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    tabBarStyle: { minHeight: 64, paddingTop: 6 },
  }}>
    {TABS.map(tab => <Tabs.Screen key={tab.name} name={tab.name} options={{
      title: msg(tab.tab ?? tab.title), headerTitle: tab.name === 'index' ? 'WQI An Kim Hải' : msg(tab.title),
      tabBarIcon: ({ color }) => <Icon name={tab.icon} size={24} color={String(color)}/>,
    }}/>)}
  </Tabs>;
}
