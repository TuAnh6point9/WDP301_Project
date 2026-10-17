# MapLibre station maps

The home preview, public `/map`, and `/admin/stations` now use `maplibre-gl` with `react-map-gl/maplibre`. No Google Maps SDK, browser key, Map ID, billing account or subscription is needed by this implementation. Google Cloud resources previously created are not deleted or otherwise changed by this migration.

## Run

Run `npm ci`, then `npm run dev:web`, and open `http://localhost:5173/map`. For the whole system use the existing project startup workflow. A WebGL-capable browser and an internet connection to the tile providers are required. Loading errors show a local warning with Retry; initialization/WebGL errors do not hide the station list or coordinate form.

Default base maps:

- **Map:** Esri World Street Map raster service. Provider/source credits, including OpenStreetMap contributors, are always displayed.
- **Satellite:** Esri World Imagery raster service. Provider/source credits are always displayed. This is not Google satellite imagery. Coverage, resolution and availability vary by location.

Default provider URLs are in `client/src/components/map/basemaps.ts`. The worker is built and served by Vite using `?worker&url`; it does not depend on a remote CDN script. The same-origin worker is also emitted into the production build.

## Optional provider configuration

The defaults are ready to use for the project demo. You may override them in ignored `client/.env` or the deployment build environment:

```dotenv
VITE_API_BASE_URL=/api/v1
VITE_MAP_STREET_TILES=
VITE_MAP_STREET_ATTRIBUTION=
VITE_MAP_SATELLITE_TILES=
VITE_MAP_SATELLITE_ATTRIBUTION=
```

Tile templates accept `{z}`, `{x}`, `{y}`. Empty values use defaults. Set the correct attribution when replacing a provider. Restart Vite after changing variables, or rebuild/redeploy production. These are frontend values: never place a private server credential here. Update both Express and Vercel CSP host allowlists if the replacement tile host differs.

The former `VITE_GOOGLE_MAPS_*` variables are no longer read. Do not create more Google credentials or upgrade billing to run these maps.

## Provider terms and deployment

MapLibre is an open-source renderer, not a free unlimited tile-hosting service. Esri remains an external provider with its own terms and limits. The currently public raster endpoints were visually verified without credentials for this project, not just checked for HTTP 200. Check current terms before public/commercial rollout, preserve attribution, and use a licensed plan or self-hosted source when usage requires it. Do not bulk-download imagery or assume a public endpoint grants unlimited redistribution rights. Service source credits can change; recheck metadata before release.

References: [Esri World Street Map service and credits](https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer), [Esri World Imagery service and source credits](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), [Esri World Imagery item and terms](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9), [MapLibre Vite worker/CSP setup](https://maplibre.org/maplibre-gl-js/docs/).

CARTO was evaluated and rejected as a default: its endpoint returned HTTP 200 with an "API key required" image. Do not use HTTP status alone to accept a new raster provider.

## Region overlay and interactions

`An Kim Hai area` defaults to on. The shared browser preference uses `wqi.map.show-an-kim-hai-area`; existing choices survive this migration. If browser storage is blocked, the toggle works for the current session. It controls the boundary/glow, outside mask, and project-added river labels together. It does not filter markers or recenter the camera. The geometry remains the approximate pre-existing OpenStreetMap-derived outline, not an official administrative boundary.

Public map retains Map/Satellite, zoom, fit-to-stations, search and station popups. Home preview is non-interactive, with the region switch outside the preview. Administration retains coordinate picking, draft marker and editable coordinate fields. Automatic fit happens on initial readiness/station changes or resize, not on region toggles, search, selection or basemap changes.

This migration does not change MongoDB, server APIs or station schema. At the time of migration, `client/src/features/stations/api.ts` still returns an empty station list and rejects create/update as unavailable (the pre-existing frontend stub). Thus the map correctly displays an empty state; station marker/form behavior is covered with explicit test fixtures, not fabricated production monitoring data. Completing backend integration is a separate task.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run build:web` and `npx vitest run client/src/components/map/Maps.test.tsx server/tests/map-csp.test.ts`. Test real imagery, region on/off, reload/navigation persistence, Map/Satellite, mobile and coordinate picking in a WebGL-capable browser. Unit tests mock the map engine and station API; they do not prove external tile availability or live database saves.
