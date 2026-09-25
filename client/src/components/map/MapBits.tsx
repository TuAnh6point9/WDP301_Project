import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { divIcon, latLngBounds, type LatLngTuple, type Map as LeafletMap } from 'leaflet';
import { quality } from '@/lib/wqi';
import type { Station } from '@/features/stations/types';
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

export const latLng = (station: Station): LatLngTuple => [station.lat, station.lng];
export function fitStations(map: LeafletMap, list: Station[], padding = 80) {
  if (list.length) map.fitBounds(latLngBounds(list.map(latLng)), { padding: [padding, padding], maxZoom: 15 });
}

/** Hands the Leaflet map instance to the page so outside controls can drive it. */
export function MapRef({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}
