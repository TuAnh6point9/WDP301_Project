# WQI An Kim Hải — Android app

Expo (SDK 58) / React Native app with the user-side features of the web app (no `/admin`). It imports the web code in `../client/src` (API client, i18n, form rules) instead of copying it, so build the contracts first: `npm run build -w @wqi/contracts` from the repo root.

This folder is not a root npm workspace and has its own `package-lock.json`, so Vercel and Render never install it.

## Setup

1. `cd mobile && npm install`
2. Copy `.env.example` to `.env` and fill it in (`.env` is git-ignored; its values are compiled into the APK).
   - `EXPO_PUBLIC_API_URL`: `https://wqi-project.vercel.app/api/v1`, or `http://10.0.2.2:5055/api/v1` for a local server seen from the emulator.
   - `EXPO_PUBLIC_GOONG_MAPTILES_KEY`: same value as `VITE_GOONG_MAPTILES_KEY`; empty uses the Esri base map.

MapLibre is native code, so Expo Go cannot run this app.

## Run on the emulator (debug)

`npm run android` builds, installs and starts Metro. Later runs only need `npx expo start` with the app already installed.

## Release APK

From `mobile/`, with `JAVA_HOME` set to Android Studio's `jbr` (JDK 21):

```bash
npx expo prebuild -p android --no-install
cd android && ./gradlew.bat assembleRelease
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`, signed with the debug key (fine to install, not for the Play Store).

Windows notes: paths over 260 characters break the native build. `react-native.config.js` keeps three unused native modules out of the build and `app.config.ts` shortens CMake object paths; do not build from a `subst` drive.

## Tests

The app's logic tests run with the root suite: `npm test` from the repo root. `npm run typecheck` here checks the app's types.
