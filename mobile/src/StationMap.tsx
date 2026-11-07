import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { msg } from '@/i18n';
import { AREA_BOUNDARY } from '@/components/map/areaGeo';
import { tone } from '@/lib/wqi';
import type { Station } from '@/features/stations/types';

// Pin colours of the web map (--q-* in client/src/styles/index.css); grey = no WQI yet.
export const TONE_COLOR: Record<string, string> = { exc: '#2E7DD1', good: '#3CB878', fair: '#F2C94C', poor: '#F2994A', vpoor: '#EB5757', heavy: '#7E0023', none: '#9AA6AF' };
const GOONG_KEY = process.env.EXPO_PUBLIC_GOONG_MAPTILES_KEY;
const GOONG_STYLE = `https://tiles.goong.io/assets/goong_map_web.json?api_key=${GOONG_KEY}`;
// Same fallback as the web: Esri World Topo when there is no key or Goong fails.
const ESRI_STYLE: StyleSpecification = {
  version: 8,
  sources: { esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Tiles © Esri' } },
  layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
};
let goongFailed = false;

const ring = AREA_BOUNDARY.map(([lat, lng]) => [lng, lat]);
const AREA: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } };
// Everything outside the area is dimmed, like the web's world mask.
const MASK: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ring] } };
const AREA_BOUNDS: [number, number, number, number] = [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))];

export function boundsOf(stations: Station[]): [number, number, number, number] {
  if (!stations.length) return AREA_BOUNDS;
  const lngs = stations.map(s => s.lng), lats = stations.map(s => s.lat), pad = .004;
  return [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
}

export type StationMapRef = { showAll: () => void; focus: (station: Station) => void };
type Props = { stations: Station[]; selected?: string; showArea: boolean; onSelect: (station: Station) => void };

export const StationMap = forwardRef<StationMapRef, Props>(function StationMap({ stations, selected, showArea, onSelect }, ref) {
  const [failed, setFailed] = useState(goongFailed || !GOONG_KEY);
  const camera = useRef<CameraRef>(null);
  const bounds = useMemo(() => boundsOf(stations), [stations]);
  useImperativeHandle(ref, () => ({
    showAll: () => camera.current?.fitBounds(bounds, { padding: { top: 48, bottom: 48, left: 48, right: 48 }, duration: 400 }),
    focus: station => camera.current?.easeTo({ center: [station.lng, station.lat], zoom: 13.5, duration: 400 }),
  }), [bounds]);
  return <Map style={StyleSheet.absoluteFill} mapStyle={failed ? ESRI_STYLE : GOONG_STYLE} logo={false} compass={false} attribution
    onDidFailLoadingMap={() => { if (!failed) { goongFailed = true; setFailed(true); } }}>
    {/* Opens on the area while stations load, then frames them like the web map. A new Camera (key) applies initialViewState
        natively when it is added, or once the map is ready; a fitBounds sent too early or late can be dropped. */}
    <Camera key={stations.length ? 'stations' : 'area'} ref={camera} initialViewState={{ bounds, padding: { top: 48, bottom: 48, left: 48, right: 48 } }} maxZoom={17}/>
    {showArea && <GeoJSONSource id="mask" data={MASK}><Layer id="mask-fill" type="fill" paint={{ 'fill-color': '#0B1420', 'fill-opacity': .22 }}/></GeoJSONSource>}
    {showArea && <GeoJSONSource id="area" data={AREA}>
      <Layer id="area-glow" type="line" paint={{ 'line-color': '#B5482A', 'line-width': 7, 'line-opacity': .22 }} layout={{ 'line-join': 'round' }}/>
      <Layer id="area-line" type="line" paint={{ 'line-color': '#B5482A', 'line-width': 2.5, 'line-dasharray': [3, 2] }} layout={{ 'line-join': 'round' }}/>
    </GeoJSONSource>}
    {stations.map(station => {
      const chosen = station.code === selected, wqi = station.latest?.wqi;
      return <Marker key={station.code} id={`station-${station.code}`} lngLat={[station.lng, station.lat]} anchor="center" onPress={() => onSelect(station)}>
        <Pressable accessibilityRole="button" accessibilityLabel={wqi == null ? `${msg('common.station')} ${station.code}, ${msg('map.noMeasurements')}` : msg('map.markerTitle', { code: station.code, wqi })} onPress={() => onSelect(station)}
          style={[pin.base, { backgroundColor: TONE_COLOR[tone(wqi)] }, chosen && pin.chosen]}>
          <Text style={[pin.text, tone(wqi) === 'fair' && { color: '#111' }]}>{wqi ?? '–'}</Text>
        </Pressable>
      </Marker>;
    })}
  </Map>;
});

const pin = StyleSheet.create({
  base: { minWidth: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, elevation: 4 },
  chosen: { borderColor: '#0B1420', transform: [{ scale: 1.2 }] },
  text: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
