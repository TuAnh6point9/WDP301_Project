import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Map, { Layer, Marker, NavigationControl, Popup, Source, useMap, type MapRef } from 'react-map-gl/maplibre';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, Polygon, LineString } from 'geojson';
import { quality } from '@/lib/wqi';
import type { Station } from '@/features/stations/types';
import { AREA_BOUNDARY, AREA_RIVERS, type LatLngTuple } from './areaGeo';
import { useAreaVisibility } from './AreaPreference';
import { basemapStyle, type BaseLayer } from './basemaps';
import 'maplibre-gl/dist/maplibre-gl.css';

export type { BaseLayer } from './basemaps';
export type MapHandle = MapRef;
export const AREA_CENTER = { lat: 20.845, lng: 106.7 };
export const latLng = (station: Pick<Station, 'lat' | 'lng'>): [number, number] => [station.lng, station.lat];
const boundary = AREA_BOUNDARY.map(([lat, lng]) => [lng, lat]);
const closedBoundary = [...boundary, boundary[0]];
const outside: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
  [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], closedBoundary,
] } };
const outline: Feature<LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: closedBoundary } };

export function AreaOverlay({ labels = true }: { labels?: boolean }) {
  const { visible } = useAreaVisibility();
  if (!visible) return null;
  return <>
    <Source id="akh-outside" type="geojson" data={outside} attribution='Approximate area: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'>
      <Layer id="akh-mask" type="fill" paint={{ 'fill-color': '#0B1420', 'fill-opacity': .22 }}/>
    </Source>
    <Source id="akh-outline" type="geojson" data={outline}>
      <Layer id="akh-glow-outer" type="line" paint={{ 'line-color': '#B5482A', 'line-width': 14, 'line-opacity': .12 }}/>
      <Layer id="akh-glow-inner" type="line" paint={{ 'line-color': '#B5482A', 'line-width': 7, 'line-opacity': .22 }}/>
      <Layer id="akh-border" type="line" paint={{ 'line-color': '#B5482A', 'line-width': 3, 'line-dasharray': [2, 3] }}/>
    </Source>
    {labels && AREA_RIVERS.map(river => {
      const [lat, lng] = river.path[Math.floor(river.path.length / 2)];
      return <Marker key={river.name} longitude={lng} latitude={lat} anchor="center" className="river-marker">
        <span className="river-label">{river.name}</span>
      </Marker>;
    })}
  </>;
}

export function fitStations(map: MapHandle, list: Station[], padding = 80) {
  const points = list.length ? list.map(latLng) : boundary;
  map.fitBounds([
    [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1]))],
    [Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))],
  ], { padding, maxZoom: 15, duration: 0 });
}

function MapSetup({ stations, padding, ready, onReady }: { stations: Station[]; padding: number; ready: boolean; onReady?: (map: MapHandle | null) => void }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || !ready) return;
    onReady?.(map);
    return () => onReady?.(null);
  }, [map, ready, onReady]);
  useEffect(() => {
    if (!map || !ready) return;
    fitStations(map, stations, padding);
    const resize = () => fitStations(map, stations, padding);
    map.on('resize', resize);
    return () => { map.off('resize', resize); };
  }, [map, ready, stations, padding]);
  return null;
}

function StationPin({ station, selected = false, draft = false, position, opacity = 1, onClick }: {
  station?: Station; selected?: boolean; draft?: boolean; position?: LatLngTuple; opacity?: number; onClick?: () => void;
}) {
  const [lat, lng] = position ?? [station!.lat, station!.lng];
  const size = selected || draft ? 24 : 18;
  const label = station ? `Station ${station.code}, WQI ${station.wqi ?? '—'} · ${station.status}` : 'Draft station location';
  const className = draft ? 'pin draft lg' : `pin ${station?.wqi == null ? 'exc' : quality(station.wqi).key}${selected ? ' lg selected' : ''}`;
  const style = { width: size, height: size, opacity: opacity * (station && station.status !== 'active' && !draft ? .45 : 1) };
  return <Marker latitude={lat} longitude={lng} anchor="center" style={{ zIndex: selected || draft ? 10 : 1 }}>
    <button type="button" title={label} aria-label={label} className="station-marker" style={style} disabled={!onClick}
      onClick={event => { event.stopPropagation(); onClick?.(); }}><span className={className} aria-hidden="true"/></button>
  </Marker>;
}

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="map-real map-status" role="alert"><strong>Map unavailable</strong>
      <span>WebGL could not start. Enable hardware acceleration or try another browser. Station lists and coordinate forms remain available.</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ failed: false })}>Retry map</button></div> : this.props.children;
  }
}

export type MonitoringMapProps = {
  id: string; stations: Station[]; layer?: BaseLayer; preview?: boolean; labels?: boolean;
  selectedCode?: string; popupCode?: string | null; onPopupClose?: () => void;
  onSelect?: (station: Station) => void; matches?: (station: Station) => boolean;
  onReady?: (map: MapHandle | null) => void;
  picking?: boolean; onPick?: (lat: number, lng: number) => void;
  draftPoint?: LatLngTuple | null; editingCode?: string;
};

export function MonitoringMap(props: MonitoringMapProps) {
  return <MapErrorBoundary><MapContent {...props}/></MapErrorBoundary>;
}

function MapContent({ id, stations, layer = 'map', preview = false, labels = true, selectedCode, popupCode, onPopupClose,
  onSelect, matches, onReady, picking = false, onPick, draftPoint, editingCode }: MonitoringMapProps) {
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState('');
  const [attempt, setAttempt] = useState(0);
  const map = useRef<MapRef>(null);
  const style = useMemo(() => basemapStyle(layer), [layer]);
  const popup = stations.find(station => station.code === popupCode);
  const popupQuality = popup?.wqi == null ? null : quality(popup.wqi);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setWarning('Map loading timed out. Check your connection and retry.'), 20000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);
  useEffect(() => { setWarning(''); }, [layer]);
  return <>
    <div className="map-real" data-map-id={id}>
      <Map key={attempt} ref={map} id={id} workerUrl={workerUrl} initialViewState={{ latitude: AREA_CENTER.lat, longitude: AREA_CENTER.lng, zoom: 12 }}
        mapStyle={style} maxZoom={19} minZoom={3} maxPitch={0} renderWorldCopies={false}
        interactive={!preview} dragRotate={false} touchPitch={false} touchZoomRotate={!preview ? { around: 'center' } : false}
        keyboard={!preview} scrollZoom={!preview} doubleClickZoom={!preview} dragPan={!preview}
        cursor={picking ? 'crosshair' : 'grab'} attributionControl={{ compact: false }}
        onLoad={() => setReady(true)} onError={event => setWarning(event.target
          ? 'The basemap could not load. Check your connection, retry, or select another base map.'
          : 'Map could not start. Enable WebGL/hardware acceleration or try another browser.')}
        onClick={event => { if (picking) onPick?.(event.lngLat.lat, event.lngLat.lng); }}>
        <MapSetup stations={stations} padding={preview ? 40 : 80} ready={ready} onReady={onReady}/>
        <AreaOverlay labels={labels}/>
        {!preview && id === 'admin-stations' && <NavigationControl position="top-right" showCompass={false}/>}
        {stations.filter(station => station.code !== editingCode).map(station => <StationPin key={station.code} station={station}
          selected={station.code === selectedCode} opacity={matches && !matches(station) ? .25 : 1}
          onClick={!preview && !picking && onSelect ? () => onSelect(station) : undefined}/>)}
        {draftPoint && <StationPin draft position={draftPoint}/>}
        {popup && <Popup longitude={popup.lng} latitude={popup.lat} offset={20} className="wqi-pop" closeOnClick={false} focusAfterOpen={false} onClose={onPopupClose}>
          <div className="stack-4">
            <div className="row-between"><span className="h4">Station {popup.code}</span>{popupQuality && <span className={`badge b-${popupQuality.key}`}>WQI {popup.wqi}</span>}</div>
            <span className="xs muted">Updated: {popup.last || '—'}{popupQuality ? ` · ${popupQuality.label}` : ''}</span>
          </div>
        </Popup>}
      </Map>
    </div>
    {!ready && !warning && <div className="map-loading" role="status">Loading map…</div>}
    {warning && <div className="map-load-warning" role="alert"><span>{warning}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setWarning(''); setReady(false); setAttempt(previous => previous + 1); }}>Retry map</button></div>}
  </>;
}
