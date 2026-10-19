# Goong + Leaflet station maps

The public map, home preview and station administration use Leaflet + React Leaflet. The Goong street basemap is rendered inside Leaflet through `@maplibre/maplibre-gl-leaflet`. The implementation in `MapBits.tsx` is the unchanged shared `map-only.patch` supplied by the project lead.

## Basemaps and setup

- **Map with a key:** Goong vector street style.
- **No key or a Goong error:** Esri World Topo raster tiles.
- **Satellite:** Esri World Imagery, unchanged by the Goong migration.

Place a browser **Maptiles Key**, not a REST API Key, in ignored `client/.env`:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_GOONG_MAPTILES_KEY=your_maptiles_key
```

Create/restrict keys at [Goong Keys](https://account.goong.io/keys). Limit the key to local and deployed website domains. Frontend `VITE_*` values are public in the browser bundle; do not commit actual keys. Restart Vite after changing variables, or rebuild/redeploy production.

Run `npm ci` followed by `npm run dev:web` for frontend development. The existing full-system command is `npm run dev`. Stop the servers when testing is complete.

The shared patch remembers the first Goong failure until a page reload. On a subsequent Goong map mount, Esri Topo is used. It does not implement a separate error banner or Goong Retry button. A WebGL-capable browser and internet access are required for Goong.

Google Maps credentials, Map ID and billing are not used. The previous `react-map-gl` renderer and `basemaps.ts` helper have been removed. Existing cloud accounts/resources are not modified.

## Region toggle

`AreaPreference.tsx` is independent of Leaflet. It preserves the existing `wqi.map.show-an-kim-hai-area` localStorage key, defaults on and synchronizes across tabs. If storage is unavailable, it works in-session.

The public map and admin station page provide a switch. Home preview has no switch but respects the same saved preference. Each caller conditionally renders `AreaOverlay`; the shared `MapBits.tsx` patch is not modified to add toggle behavior. Boundary, glow, outside mask and custom river labels disappear together without removing markers, changing filters or moving the map.

The outline remains the project's approximate OpenStreetMap-derived geometry, not an official boundary. Provider attribution remains visible. Goong and Esri hosting have their own plans/terms and are not unlimited merely because Leaflet/MapLibre are open source.

## Compatibility and scope

Six protected patch files remain exactly equal to the supplied patch result: `MapBits.tsx`, `client/package.json`, `package-lock.json`, both Vercel configs and `client/.env.example`. `MapPage.tsx` adds only the switch import/state/conditional overlay and switch placement; its null-safe pH/DO/BOD5 lines remain as supplied.

Work stays on `quandeptrai` at the user's request. No separate patch-only commit or Co-authored-by trailer is created. Existing unrelated branch history and local database scripts are retained, not reset or included as new map edits.

MongoDB, station data and measurement records are not modified. The frontend station API on this main baseline is still an empty-list/create-update stub. UI tests use explicit station fixtures and mocked saves. Live Atlas station integration is not claimed by this work.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build:web`.

Tests cover shared preference persistence, storage failures/cross-tab events, overlay removal, station controls, null-safe measurements, Goong initialization, missing/error-key Esri fallback and satellite cleanup. Real browser checks must additionally confirm Goong tiles, missing-key fallback, rejected-key fallback, Esri satellite and region persistence on all three screens. Browser checks do not save stations or alter the shared Atlas database.
