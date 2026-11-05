import { useEffect, useRef, useState } from 'react';
import { msg, useLocale } from '@/i18n';
import { Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon, latLngBounds, type DivIcon, type LatLngTuple, type Map as LeafletMap } from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { tone } from '@/lib/wqi';
import type { Station } from '@/features/stations/types';
import { AREA_BOUNDARY, AREA_RIVERS } from './areaGeo';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// maplibre-gl finds its worker via import.meta.url, which 404s under Vite; point it at the bundled file instead.
setWorkerUrl(workerUrl);

export type BaseLayer = 'map' | 'sat';

const GOONG_KEY: string | undefined = import.meta.env.VITE_GOONG_MAPTILES_KEY;
// Set on the first Goong error; every map then stays on Esri Topo until the page reloads.
let goongFailed = false;

export function BaseTiles({ layer }: { layer: BaseLayer }) {
  const [failed, setFailed] = useState(goongFailed);
  if (layer === 'sat') return <TileLayer key="sat" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"/>;
  return GOONG_KEY && !failed
    ? <GoongLayer onFail={setFailed}/>
    : <TileLayer key="topo" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" maxZoom={19} attribution="Tiles &copy; Esri"/>;
}

/** Goong vector map (Vietnamese labels, Hoàng Sa and Trường Sa shown as Vietnam's) drawn by MapLibre in Leaflet's tile pane, under markers and overlays. */
function GoongLayer({ onFail }: { onFail: (failed: true) => void }) {
  const map = useMap();
  const locale = useLocale();
  const canvas = useRef<HTMLCanvasElement>(undefined);
  // MapLibre labels its canvas "Map" in English; keep that name in the chosen language without rebuilding the map.
  useEffect(() => { canvas.current?.setAttribute('aria-label', msg('common.map')); }, [locale]);
  useEffect(() => {
    const layer = maplibreGL({ style: `https://tiles.goong.io/assets/goong_map_web.json?api_key=${GOONG_KEY}`, maxZoom: 19 }).addTo(map);
    canvas.current = layer.getMaplibreMap().getCanvas();
    canvas.current.setAttribute('aria-label', msg('common.map'));
    layer.getMaplibreMap().once('error', ({ error }) => {
      if (!goongFailed) console.error('Goong basemap failed, falling back to Esri Topo:', error);
      goongFailed = true;
      onFail(true);
    });
    return () => {
      // The plugin drops its GL map before Leaflet's layerremove, so the Goong credit would otherwise linger on Satellite.
      const credit = layer.getAttribution?.();
      if (credit) map.attributionControl?.removeAttribution(credit);
      layer.remove();
    };
  }, [map, onFail]);
  return null;
}

// react-leaflet replaces a marker's DOM whenever the icon object changes; one icon per look keeps pins (and their motion) stable across renders.
const icons = new Map<string, DivIcon>();
/** Station pin coloured by the official class of its newest approved batch; grey without one. Same on every map. `animate` lands a pointer-selected pin (`.drop`). */
export function stationIcon(station: Station | null, { selected = false, draft = false, animate = false } = {}) {
  const size = selected || draft ? 24 : 18;
  const pulse = station?.status === 'active' && !draft ? ' pulsing' : '';
  const cls = draft ? 'pin draft lg' : `pin ${tone(station?.latest?.wqi)}${selected ? ' lg selected' : ''}${selected && animate ? ' drop' : ''}${pulse}`;
  const dim = station && station.status !== 'active' && !draft ? ' style="opacity:.45"' : '';
  const html = `<span class="${cls}"${dim}></span>`, key = `${html}|${size}`;
  if (!icons.has(key)) icons.set(key, divIcon({ className: 'pin-wrap', html, iconSize: [size, size], popupAnchor: [0, -size / 2 - 4] }));
  return icons.get(key)!;
}

/** Initial view before the station list loads; fitStations then frames the stations. */
export const AREA_CENTER: LatLngTuple = [20.845, 106.7];
const AREA_BOUNDS = latLngBounds(AREA_BOUNDARY);

// A ring around the whole world with the area cut out as a hole, so everything outside An Kim Hai is dimmed.
const WORLD_MASK: LatLngTuple[][] = [[[90, -180], [90, 180], [-90, 180], [-90, -180]], AREA_BOUNDARY];

/** Outlines the An Kim Hai area and labels its rivers (the base map already draws the water). Non-interactive, so clicks still reach the map and markers. */
export function AreaOverlay({ labels = true }: { labels?: boolean }) {
  return <>
    <Polygon positions={WORLD_MASK} interactive={false} pathOptions={{ stroke: false, fillColor: '#0B1420', fillOpacity: .22 }}/>
    {AREA_RIVERS.map(river => <Polyline key={river.name} positions={river.path} interactive={false} pathOptions={{ stroke: false }}>
      {labels && <Tooltip permanent direction="center" className="river-label">{river.name}</Tooltip>}
    </Polyline>)}
    {/* Soft glow under the boundary: wide faint strokes fading out from the dashed line. */}
    <Polygon positions={AREA_BOUNDARY} interactive={false} pathOptions={{ color: '#B5482A', weight: 14, opacity: .12, lineJoin: 'round', fill: false }}/>
    <Polygon positions={AREA_BOUNDARY} interactive={false} pathOptions={{ color: '#B5482A', weight: 7, opacity: .22, lineJoin: 'round', fill: false }}/>
    <Polygon positions={AREA_BOUNDARY} interactive={false} pathOptions={{ color: '#B5482A', weight: 3, dashArray: '8 6', fill: false }}/>
  </>;
}

export const latLng = (station: Station): LatLngTuple => [station.lat, station.lng];
/** Frames the stations, or the whole An Kim Hai area while there are none. */
export function fitStations(map: LeafletMap, list: Station[], padding = 80) {
  map.fitBounds(list.length ? latLngBounds(list.map(latLng)) : AREA_BOUNDS, { padding: [padding, padding], maxZoom: 15 });
}

/** Hands the Leaflet map instance to the page so outside controls can drive it. */
export function MapRef({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}
