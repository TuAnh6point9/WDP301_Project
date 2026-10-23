import { msg, useLocale, displayText } from '@/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup } from 'react-leaflet';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { listStations } from '@/features/stations/api';
import type { Station } from '@/features/stations/types';
import { AREA_CENTER, AreaOverlay, BaseTiles, fitStations, latLng, MapRef, stationIcon, type BaseLayer } from '@/components/map/MapBits';
import { AreaToggle, useAreaVisibility } from '@/components/map/AreaPreference';
import { Icon } from '@/components/Icon';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

function Sparkline({ trend }: { trend: number[] }) {
  useLocale();
  if (trend.length < 2) return <p className="xs muted">{msg('map.noTrend')}</p>;
  const min = Math.min(...trend) - 5, max = Math.max(...trend) + 5;
  const pts = trend.map((v, i) => `${(i / (trend.length - 1) * 352).toFixed(1)},${(64 - (v - min) / (max - min) * 58).toFixed(1)}`);
  return <svg className="chart" viewBox="0 0 352 70" preserveAspectRatio="none" style={{ height: 70 }} aria-hidden="true">
    <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E6E8C" stopOpacity=".2"/><stop offset="1" stopColor="#0E6E8C" stopOpacity="0"/></linearGradient></defs>
    <path className="area" d={`M${pts.join(' L')} L352,70 L0,70 Z`}/>
    <polyline className="line" style={{ strokeWidth: 2.5 }} points={pts.join(' ')}/>
  </svg>;
}

export function MapPage() {
  useLocale();
  const { data, error, loading, reload } = useAsync(listStations);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.length ? 'ready' : 'empty');
  if (!data) return <PageStatus error={error} onRetry={reload}/>;
  return <StationMap stations={data}/>;
}

function StationMap({ stations }: { stations: Station[] }) {
  useLocale();
  const { visible: areaVisible } = useAreaVisibility();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [layer, setLayer] = useState<BaseLayer>('map');
  const [selected, setSelected] = useState<Station | null>(stations[0] ?? null);
  const [query, setQuery] = useState('');
  const markers = useRef<Record<string, LeafletMarker | null>>({});
  const onReady = useCallback((instance: LeafletMap) => setMap(instance), []);
  const q = query.trim().toLowerCase();
  const matches = (station: Station) => !q || station.code.toLowerCase().includes(q) || station.name.toLowerCase().includes(q);
  const visible = stations.filter(matches);
  const sq = selected?.wqi == null ? null : quality(selected.wqi);

  useEffect(() => { if (map) fitStations(map, stations); }, [map, stations]);
  useEffect(() => { if (selected) markers.current[selected.code]?.openPopup(); }, [selected, map]);

  function select(station: Station, fly: boolean) {
    setSelected(station);
    if (fly && map) map.flyTo(latLng(station), Math.max(map.getZoom(), 15), { duration: .6 });
  }

  return <main className="map-layout">
    {/* MAP */}
    <div className="map-canvas">
      <MapContainer className="map-real" center={AREA_CENTER} zoom={14} zoomControl={false} attributionControl>
        <MapRef onReady={onReady}/>
        <BaseTiles layer={layer}/>
        {areaVisible && <AreaOverlay/>}
        {stations.map(station => {
          const sq2 = station.wqi === null ? null : quality(station.wqi);
          return <Marker key={station.code} ref={instance => { markers.current[station.code] = instance; }} position={latLng(station)} icon={stationIcon(station, { selected: station.code === selected?.code })} title={msg('map.markerTitle', { code: station.code, wqi: station.wqi ?? '—' })} opacity={matches(station) ? 1 : .25} zIndexOffset={station.code === selected?.code ? 1000 : 0} eventHandlers={{ click: () => select(station, false) }}>
            <Popup className="wqi-pop" closeButton={false} autoPanPadding={[60, 60]}>
              <div className="stack-4">
                <div className="row-between"><span className="h4">{msg('common.station')}{' '}{station.code}</span>{sq2 && <span className={`badge b-${sq2.key}`}>WQI {station.wqi}</span>}</div>
                <span className="xs muted">{msg('map.updated')}{' '}{station.last || '—'}{sq2 ? ` · ${displayText(sq2.label)}` : ''}</span>
              </div>
            </Popup>
          </Marker>;
        })}
      </MapContainer>

      <div className="map-float map-ctrl" style={{ right: 20, top: 20 }}>
        <button type="button" aria-label={msg('map.zoomIn')} onClick={() => map?.zoomIn()}><Icon name="plus" className="i-sm"/></button>
        <button type="button" aria-label={msg('map.zoomOut')} onClick={() => map?.zoomOut()}><Icon name="minus" className="i-sm"/></button>
        <button type="button" aria-label={msg('map.showAll')} onClick={() => map && fitStations(map, stations)}><Icon name="fit" className="i-sm"/></button>
      </div>
      <div className="map-float map-basemap" role="group" aria-label={msg('map.baseMap')} style={{ left: 20, top: 20 }}>
        <button type="button" className={layer === 'map' ? 'on' : undefined} aria-pressed={layer === 'map'} onClick={() => setLayer('map')}>{msg('common.map')}</button>
        <button type="button" className={layer === 'sat' ? 'on' : undefined} aria-pressed={layer === 'sat'} onClick={() => setLayer('sat')}>{msg('map.satellite')}</button>
      </div>
      <div className="map-float legend" style={{ left: 20, bottom: 28 }}>
        <b style={{ color: 'var(--text)' }}>{msg('map.classification')}</b>
        <div><span className="dot exc"/>{msg('quality.excellentBand')}</div>
        <div><span className="dot good"/>{msg('quality.goodBand')}</div>
        <div><span className="dot fair"/>{msg('quality.fairBand')}</div>
        <div><span className="dot poor"/>{msg('quality.poorBand')}</div>
        <div><span className="dot vpoor"/>{msg('quality.veryPoorBand')}</div>
        <div className="legend-sep"><AreaToggle/></div>
      </div>
    </div>

    {/* SIDEBAR */}
    <aside className="map-side">
      <div className="map-side-sec">
        <h1 className="h3" style={{ fontSize: 16 }}>{msg('map.dataPoints')}</h1>
        <label className="input-icon">
          <Icon name="search"/>
          <input type="search" className="input sm" placeholder={msg('map.searchPlaceholder')} aria-label={msg('map.searchLabel')} value={query} onChange={event => setQuery(event.target.value)}/>
        </label>
      </div>

      {!selected && <div className="map-side-sec" aria-live="polite">
        <p className="small muted">{msg('map.noStations')}</p>
      </div>}
      {selected && <div className="map-side-sec" style={{ gap: 14 }} aria-live="polite">
        <div className="row-between">
          <span className="h3">{msg('common.station')}{' '}{selected.code}</span>
          {sq && <span className={`badge b-${sq.key}`}><span className={`dot ${sq.key}`}/>WQI {selected.wqi} · {displayText(sq.label)}</span>}
        </div>
        <div className="small text-2">{msg('map.coordinates')}{' '}{selected.lat.toFixed(4)}°N, {selected.lng.toFixed(4)}°E</div>
        <Sparkline trend={selected.trend}/>
        <div className="tiles compact">
          <div className="tile"><span className="tile-label">pH</span><span className="tile-value">{selected.ph?.toFixed(1) ?? '—'}</span></div>
          <div className="tile"><span className="tile-label">DO (mg/l)</span><span className="tile-value">{selected.do?.toFixed(1) ?? '—'}</span></div>
          <div className="tile"><span className="tile-label">BOD5</span><span className="tile-value">{selected.bod?.toFixed(1) ?? '—'}</span></div>
        </div>
        <Link to={`/historical-data?station=${selected.code}`} className="btn btn-primary btn-block">{msg('map.stationHistory')}</Link>
      </div>}

      <div className="station-list">
        <div className="label-caps" style={{ padding: '16px 24px 8px' }}>{q ? msg('map.matching', { count: visible.length }) : msg('map.all', { count: stations.length })}</div>
        {visible.map(station => {
          const sq3 = station.wqi === null ? null : quality(station.wqi);
          return <a key={station.code} href={`#${station.code}`} className={station.code === selected?.code ? 'station active' : 'station'} aria-current={station.code === selected?.code ? 'true' : undefined} onClick={event => { event.preventDefault(); select(station, true); }}>
            <span className="row"><span className={`dot ${sq3?.key || 'exc'}`}/><b>{station.code}</b></span>
            <span className="small text-2">WQI {station.wqi ?? '—'}</span>
          </a>;
        })}
      </div>
    </aside>
  </main>;
}
