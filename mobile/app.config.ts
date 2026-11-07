import type { ExpoConfig } from 'expo/config';
import { withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins';

// EXPO_PUBLIC_* values come from mobile/.env and are compiled into the APK (like VITE_* in the web bundle).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'https://wqi-project.vercel.app/api/v1';

// Windows paths stop at 260 characters and the C++ object paths of the codegen libraries reach about 320 here.
// CMake shortens an object file name (to a hash) once its full path is longer than this.
const shortObjectPaths: ConfigPlugin = expo => withAppBuildGradle(expo, gradle => {
  if (!gradle.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) gradle.modResults.contents = gradle.modResults.contents.replace(
    /defaultConfig \{\r?\n/, 'defaultConfig {\n        externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=250" } }\n');
  return gradle;
});

const config: ExpoConfig = {
  name: 'WQI An Kim Hải',
  slug: 'wqi-ankimhai',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'wqiankimhai',
  userInterfaceStyle: 'light',
  android: {
    package: 'vn.ankimhai.wqi',
    adaptiveIcon: {
      backgroundColor: '#0E6E8C',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Files are picked with the system picker and shared from the app cache; the map never shows the user's position.
    // So no storage, overlay or location permission (MapLibre declares location by default).
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#F4F8FA', image: './assets/images/splash-icon.png', imageWidth: 96 }],
    '@maplibre/maplibre-react-native',
    // Plain HTTP only for a test build pointed at a local server (http://10.0.2.2:…).
    ['expo-build-properties', { android: { usesCleartextTraffic: apiUrl.startsWith('http://') } }],
  ],
  // The shared web code is written for plain React; keep the compiler off so it behaves the same.
  // tsconfig paths are for type checking only; metro.config.js resolves the shared code itself.
  experiments: { typedRoutes: false, reactCompiler: false, tsconfigPaths: false },
};

export default shortObjectPaths(config);
