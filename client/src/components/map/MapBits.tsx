import { useEffect } from 'react';
import { Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon, latLngBounds, type LatLngTuple, type Map as LeafletMap } from 'leaflet';
import { quality } from '@/lib/wqi';
import type { Station } from '@/features/stations/types';
import { AREA_BOUNDARY, AREA_RIVERS } from './areaGeo';
import 'leaflet/dist/leaflet.css';

export type BaseLayer = 'map' | 'sat';

export function BaseTiles({ layer }: { layer: BaseLayer }) {
  return layer === 'sat'
    ? <TileLayer key="sat" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"/>
    : <TileLayer key="map" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>;
}

/** Station pin coloured by WQI class, as in the design. */
export function stationIcon(station: Station | null, { selected = false, draft = false } = {}) {
  const size = selected || draft ? 24 : 18;
  const cls = draft ? 'pin draft lg' : `pin ${station?.wqi == null ? 'exc' : quality(station.wqi).key}${selected ? ' lg selected' : ''}`;
  const dim = station && station.status !== 'active' && !draft ? ' style="opacity:.45"' : '';
  return divIcon({ className: 'pin-wrap', html: `<span class="${cls}"${dim}></span>`, iconSize: [size, size], popupAnchor: [0, -size / 2 - 4] });
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
