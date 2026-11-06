import { msg, useLocale, formatNumber, qualityLabel } from '@/i18n';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Popup, Tooltip } from 'react-leaflet';
import type { LeafletMouseEvent, Map as LeafletMap, Marker as LeafletMarker, PopupEvent } from 'leaflet';
import { getVnWqiQualityClass, parameterDisplayKeys, parameterLabels, type StationLatest } from '@wqi/contracts';
import { WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { WQI_REFERENCE_GUIDANCE } from '@/features/predictions/referenceGuidance';
import { batchCodeText, tone, TONE } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { listStations } from '@/features/stations/api';
import type { Station } from '@/features/stations/types';
import { AREA_CENTER, AreaOverlay, BaseTiles, fitStations, latLng, MapRef, stationIcon, type BaseLayer } from '@/components/map/MapBits';
import { AreaToggle, useAreaVisibility } from '@/components/map/AreaPreference';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'; // --ease-out
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
/** A pointer click has a click count; Enter on a link or a focused marker has none. Keyboard selection gets no motion. */
const byPointer = (event: { detail?: number } | undefined) => (event?.detail ?? 0) > 0;
/** A popup closed by a pointer leaves the DOM once its fade (`--motion-pop-exit`, 260ms) has ended. */
const POP_REMOVE_MS = 300;

/** Fades a panel part in (lifting it 5px unless motion is reduced). A click during the fade continues from what is on screen instead of blinking. */
function settle(element: HTMLElement, delay: number, reduce: boolean) {
  if (!element.animate) return; // jsdom
  const running = element.getAnimations().length > 0;
  const opacity = running ? Number(getComputedStyle(element).opacity) : .4;
  element.getAnimations().forEach(animation => animation.cancel());
  element.animate(reduce || running ? [{ opacity }, { opacity: 1 }] : [{ opacity, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
    { duration: 200, delay, easing: EASE_OUT, fill: 'backwards' });
}

/** The WQI figure with its class and batch, in the side panel (`map-wqi-*`) and the popup (`pop-wqi-*`). */
function WqiFigure({ latest, kind, ...rest }: { latest: StationLatest; kind: 'map' | 'pop'; 'data-reveal'?: boolean }) {
  return <div className={`${kind}-wqi`} {...rest}>
    {latest.wqi != null && <span className={`${kind}-wqi-value`}><span className={`${kind}-wqi-label`}>WQI</span>{latest.wqi}</span>}
    <span className={`${kind}-wqi-text`}>
      <span className={`${kind}-wqi-class`}>{latest.wqi == null ? msg('stations.noWqi') : <><span className={`dot ${tone(latest.wqi)}`}/>{qualityLabel(getVnWqiQualityClass(latest.wqi))}</>}</span>
      <span className={`${kind}-wqi-batch`}>{batchCodeText(latest)}</span>
    </span>
  </div>;
}

const coordinates = (station: Station) => `${msg('common.station')} ${station.code} · ${station.lat.toFixed(4)}°N, ${station.lng.toFixed(4)}°E`;

/** The six parameters live in a dialog, so the side panel stays a short summary above a usable station list (user, 05/11). */
function ParametersDialog({ station, latest, animated, onClose }: { station: Station; latest: StationLatest; animated: boolean; onClose: () => void }) {
  return <Modal title={station.name} className={animated ? 'station-dialog animated' : 'station-dialog'} onClose={onClose}
    extraAction={<Link to={`/historical-data?station=${station.code}`} className="btn btn-primary">{msg('map.stationHistory')}</Link>}>
    <div className="modal-body station-dialog-body">
      <p className="map-detail-meta">{coordinates(station)}</p>
      <WqiFigure latest={latest} kind="map"/>
      <h3 className="station-dialog-sub">{msg('map.parameters')}</h3>
      <div className="map-params" role="group" aria-label={msg('map.parameters')}>
        {parameterDisplayKeys.map(key => <div className="tile" key={key}>
          <span className="tile-label">{parameterLabels[key]}</span>
          <span className="tile-value">{formatNumber(latest.parameters[key])}</span>
          {WQI_REFERENCE_GUIDANCE[key].referenceUnit && <span className="tile-unit">{WQI_REFERENCE_GUIDANCE[key].referenceUnit}</span>}
        </div>)}
      </div>
    </div>
  </Modal>;
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
  const [pointer, setPointer] = useState(false);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(true);
  const [details, setDetails] = useState<{ station: Station; animated: boolean } | null>(null);
  const markers = useRef<Record<string, LeafletMarker | null>>({});
  const detail = useRef<HTMLElement>(null);
  const onReady = useCallback((instance: LeafletMap) => setMap(instance), []);
  const q = query.trim().toLowerCase();
  const matches = (station: Station) => !q || station.code.toLowerCase().includes(q) || station.name.toLowerCase().includes(q);
  const visible = stations.filter(matches);
  const latest = selected?.latest ?? null;

  useEffect(() => { if (map) fitStations(map, stations); }, [map, stations]);
  useEffect(() => { if (selected) markers.current[selected.code]?.openPopup(); }, [selected, map]);
  // A popup closed by a pointer sinks and fades (CSS `.closing`); one closed by a key (Esc, Enter on another station) goes at once.
  const keyboard = useRef(false);
  useEffect(() => {
    const mark = (event: Event) => { keyboard.current = event.type === 'keydown'; };
    window.addEventListener('keydown', mark, true); window.addEventListener('pointerdown', mark, true);
    return () => { window.removeEventListener('keydown', mark, true); window.removeEventListener('pointerdown', mark, true); };
  }, []);
  useEffect(() => {
    if (!map) return;
    const closing = ({ popup }: PopupEvent) => {
      const element = popup.getElement();
      if (keyboard.current || !element) return;
      element.classList.add('closing');
      // shortcut: Leaflet 1.9.4 removes a closed popup after 200ms via the private `_removeTimeout`; it is stretched so the
      // slower fade can finish (onAdd still clears it on a quick reopen). Recheck when Leaflet is upgraded.
      const timer = popup as typeof popup & { _removeTimeout?: number };
      clearTimeout(timer._removeTimeout);
      timer._removeTimeout = window.setTimeout(() => element.remove(), POP_REMOVE_MS);
    };
    // Reopened before Leaflet removed it, the same element comes back: clear the fade so it lands whole.
    const opening = ({ popup }: PopupEvent) => popup.getElement()?.classList.remove('closing');
    map.on('popupclose', closing); map.on('popupopen', opening);
    return () => { map.off('popupclose', closing); map.off('popupopen', opening); };
  }, [map]);
  // The new station's details rise in, the six tiles 35ms apart.
  useLayoutEffect(() => {
    if (!pointer || !detail.current) return;
    const reduce = reducedMotion();
    detail.current.querySelectorAll<HTMLElement>('[data-reveal]').forEach((part, index) => settle(part, index * 35, reduce));
  }, [selected?.code, pointer]);

  function select(station: Station, fly: boolean, viaPointer: boolean) {
    setPointer(viaPointer);
    setSelected(station);
    // The list's current station again: the effect above will not rerun, so reopen a popup a map click closed.
    if (fly && station.code === selected?.code) markers.current[station.code]?.openPopup();
    if (!fly || !map) return;
    if (reducedMotion()) map.setView(latLng(station), Math.max(map.getZoom(), 15), { animate: false });
    else map.flyTo(latLng(station), Math.max(map.getZoom(), 15), { duration: .6 });
  }

  return <main className="map-layout" data-motion={pointer ? 'on' : 'off'}>
    {/* MAP */}
    <div className="map-canvas">
      <MapContainer className="map-real" center={AREA_CENTER} zoom={14} zoomControl={false} attributionControl>
        <MapRef onReady={onReady}/>
        <BaseTiles layer={layer}/>
        {areaVisible && <AreaOverlay/>}
        {stations.map(station => {
          const chosen = station.code === selected?.code;
          return <Marker key={station.code} ref={instance => { markers.current[station.code] = instance; }} position={latLng(station)} icon={stationIcon(station, { selected: chosen, animate: chosen && pointer })} title={msg('map.markerTitle', { code: station.code, wqi: station.latest?.wqi ?? '—' })} opacity={matches(station) ? 1 : .25} zIndexOffset={chosen ? 1000 : 0} eventHandlers={{ click: (event: LeafletMouseEvent) => select(station, false, byPointer(event?.originalEvent)) }}>
            {!chosen && <Tooltip direction="top" offset={[0, -10]}>{station.name}</Tooltip>}
            {/* Pan clear of the floating base-map switch (top left) and zoom buttons (top right). */}
            <Popup className="wqi-pop" closeButton={false} autoPanPaddingTopLeft={[196, 88]} autoPanPaddingBottomRight={[80, 40]}>
              <div className="pop-body">
                <span className="pop-code">{station.code}</span>
                <span className="pop-title">{station.name}</span>
                {station.latest ? <WqiFigure latest={station.latest} kind="pop"/> : <span className="pop-empty">{msg('map.noMeasurements')}</span>}
                {station.latest && <button type="button" className="pop-more" onClick={event => setDetails({ station, animated: byPointer(event) })}>{msg('map.viewParameters')}<Icon name="chevronRight" className="i-sm"/></button>}
              </div>
            </Popup>
          </Marker>;
        })}
      </MapContainer>

      <div className="map-float map-ctrl" style={{ right: 24, top: 24 }}>
        <button type="button" aria-label={msg('map.zoomIn')} onClick={() => map?.zoomIn()}><Icon name="plus" className="i-sm"/></button>
        <button type="button" aria-label={msg('map.zoomOut')} onClick={() => map?.zoomOut()}><Icon name="minus" className="i-sm"/></button>
        <button type="button" aria-label={msg('map.showAll')} onClick={() => map && fitStations(map, stations)}><Icon name="fit" className="i-sm"/></button>
      </div>
      <div className="map-float map-basemap" role="group" aria-label={msg('map.baseMap')} style={{ left: 24, top: 24 }}>
        <button type="button" className={layer === 'map' ? 'on' : undefined} aria-pressed={layer === 'map'} onClick={() => setLayer('map')}>{msg('common.map')}</button>
        <button type="button" className={layer === 'sat' ? 'on' : undefined} aria-pressed={layer === 'sat'} onClick={() => setLayer('sat')}>{msg('map.satellite')}</button>
      </div>
      <div className="map-float legend" style={{ left: 24, bottom: 32 }}>
        <b className="legend-title">{msg('map.classification')}</b>
        {[...WQI_DISPLAY_BANDS].reverse().map(band => <div key={band.label}><span className={`dot ${TONE[band.label]}`}/>{qualityLabel(band.label)} ({band.min}–{band.max})</div>)}
        <div><span className="dot none"/>{msg('map.noMeasurements')}</div>
        <div className="legend-sep"><AreaToggle/></div>
      </div>
    </div>

    {/* SIDEBAR: the one scroll area of the page */}
    <aside className="map-side">
      <div className="map-side-sec map-search">
        <h1 className="map-side-title">{msg('map.dataPoints')}</h1>
        <label className="input-icon">
          <Icon name="search"/>
          <input type="search" className="input sm" placeholder={msg('map.searchPlaceholder')} aria-label={msg('map.searchLabel')} value={query} onChange={event => { setQuery(event.target.value); setListOpen(true); }}/>
        </label>
      </div>

      {!selected && <div className="map-side-sec" aria-live="polite">
        <p className="small muted">{msg('map.noStations')}</p>
      </div>}
      {selected && <section className="map-side-sec map-detail" ref={detail} aria-live="polite" aria-labelledby="map-detail-title">
        <div data-reveal>
          <h2 className="map-detail-title" id="map-detail-title">{selected.name}</h2>
          <p className="map-detail-meta">{coordinates(selected)}</p>
        </div>
        {latest
          ? <>
            <WqiFigure latest={latest} kind="map" data-reveal/>
            <button type="button" className="btn btn-primary btn-block" data-reveal onClick={event => setDetails({ station: selected, animated: byPointer(event) })}>{msg('map.viewParameters')}</button>
          </>
          : <>
            <p className="small text-2 station-empty" data-reveal><Icon name="info"/>{msg('map.noMeasurementsHint')}</p>
            <Link to={`/historical-data?station=${selected.code}`} className="btn btn-primary btn-block" data-reveal>{msg('map.stationHistory')}</Link>
          </>}
      </section>}
      {details?.station.latest && <ParametersDialog station={details.station} latest={details.station.latest} animated={details.animated} onClose={() => setDetails(null)}/>}

      {/* The list folds away to leave the panel to the chosen station, and scrolls on its own when open. */}
      <div className={listOpen ? 'station-list open' : 'station-list'}>
        <button type="button" className="map-list-head" aria-expanded={listOpen} aria-controls="map-station-items" onClick={() => setListOpen(open => !open)}>
          <span>{q ? msg('map.matching', { count: visible.length }) : msg('map.all', { count: stations.length })}</span>
          <Icon name="chevronDown" className="i-sm"/>
        </button>
        <div className="station-list-items" id="map-station-items" hidden={!listOpen}>
        {visible.map(station => {
          const wqi = station.latest?.wqi;
          const chosen = station.code === selected?.code;
          // A measured station carries its WQI and class in a chip tinted by its class; an unmeasured one steps back (user, 06/11).
          return <a key={station.code} href={`#${station.code}`} className={`station${chosen ? ' active' : ''}${wqi == null ? ' unmeasured' : ''}`} aria-current={chosen ? 'true' : undefined} onClick={event => { event.preventDefault(); select(station, true, byPointer(event)); }}>
            <span className={`dot ${tone(wqi)}`}/>
            <span className="station-id"><b>{station.code}</b><span className="station-name">{station.name}</span></span>
            {wqi == null
              ? <span className="station-wqi">{msg('map.noData')}</span>
              : <span className={`station-wqi station-chip ${tone(wqi)}`}><span className="station-chip-label">WQI</span> <b>{wqi}</b> {qualityLabel(getVnWqiQualityClass(wqi))}</span>}
          </a>;
        })}
        </div>
      </div>
    </aside>
  </main>;
}
