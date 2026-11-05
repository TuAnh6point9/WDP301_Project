import { messageText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale, qualityLabel } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { batchText, tone, TONE, wqiText } from '@/lib/wqi';
import { WQI_DISPLAY_BANDS } from '@/features/predictions/classificationDisplay';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Tooltip, useMapEvents, ZoomControl } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { clientPage } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { AREA_CENTER, AreaOverlay, BaseTiles, fitStations, latLng, MapRef, stationIcon } from '@/components/map/MapBits';
import { AreaToggle, useAreaVisibility } from '@/components/map/AreaPreference';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import { createStation, listAdminStations, updateStation } from '../api';
import type { Station, StationInput } from '../types';

const STATUS: Record<Station['status'], [string, string]> = { active: ['ok', 'Active'], maint: ['warn', 'Maintenance'], off: ['off', 'Inactive'] };
type Draft = { id?: string; code: string; name: string; administrativeArea: Station['administrativeArea']; status: StationInput['status']; lat: string; lng: string; existing: boolean };

function PickOnClick({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useLocale();
  useMapEvents({ click: event => { if (enabled) onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

export function AdminStationsPage() {
  useLocale();
  const { data, error, loading, reload } = useAsync(listAdminStations);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.length ? 'ready' : 'empty');
  if (!data) return <PageStatus admin error={error} onRetry={reload}/>;
  return <StationManager initial={data}/>;
}

function StationManager({ initial }: { initial: Station[] }) {
  const locale = useLocale();
  const { visible } = useAreaVisibility();
  const toast = useToast();
  const [list, setList] = useState<Station[]>(() => [...initial].sort((a, b) => a.code.localeCompare(b.code)));
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState('');
  const savingRef = useRef(false);
  const onReady = useCallback((instance: LeafletMap) => setMap(instance), []);
  useEffect(() => { if (map) fitStations(map, initial, 50); }, [map, initial]);

  const q = query.trim().toLowerCase();
  const [tablePage, setTablePage] = useState(1);
  const { rows, meta } = clientPage(list.filter(s => !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)), tablePage);
  const draftPoint = draft && draft.lat.trim() && draft.lng.trim() && Number.isFinite(Number(draft.lat)) && Number.isFinite(Number(draft.lng)) ? [Number(draft.lat), Number(draft.lng)] as [number, number] : null;

  function open(station: Station | null) {
    setFailure('');
    const center = map?.getCenter();
    let n = list.length + 1;
    while (list.some(s => s.code === `AKH-${String(n).padStart(2, '0')}`)) n++;
    setDraft(station
      ? { id: station.id, code: station.code, name: station.name, administrativeArea: station.administrativeArea, status: station.status === 'active' ? 'active' : 'off', lat: String(station.lat), lng: String(station.lng), existing: true }
      : { code: `AKH-${String(n).padStart(2, '0')}`, name: '', administrativeArea: 'Hải Phòng', status: 'active', lat: String(center?.lat ?? AREA_CENTER[0]), lng: String(center?.lng ?? AREA_CENTER[1]), existing: false });
  }
  async function save() {
    if (!draft || !draftPoint || savingRef.current) return;
    const data: StationInput = { code: draft.code.trim().toUpperCase(), name: draft.name.trim(), administrativeArea: draft.administrativeArea, status: draft.status, lat: draftPoint[0], lng: draftPoint[1] };
    if (!draft.existing && list.some(s => s.code === data.code)) { setFailure(M.STATION_EXISTS); return; }
    savingRef.current = true; setSaving(true); setFailure('');
    try {
      if (draft.existing) {
        const saved = await updateStation(draft.id!, data);
        setList(previous => previous.map(s => s.code === saved.code ? { ...s, ...saved, latest: s.latest } : s)); // PATCH returns no batch info
      } else {
        const created = await createStation(data);
        setList(previous => [...previous, created]);
      }
      toast.show(`${data.code} ${draft.existing ? 'updated' : 'added'}`);
      setDraft(null);
    } catch (error) {
      setFailure(userErrorMessage(error, M.SAVE_STATION));
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('stations.title')}</h1>
        <p className="sub">{msg('stations.description')}</p>
      </div>
      <div className="page-actions">
        <Link to="/map" className="btn btn-secondary" target="_blank" rel="noopener"><Icon name="external"/>{msg('stations.previewMap')}</Link>
        <button type="button" className="btn btn-primary" onClick={() => open(null)}><Icon name="plus" strokeWidth={2.4}/>{msg('stations.add')}</button>
      </div>
    </div>

    <dl className="card card-pad dash-numbers">
      <div><dt>{msg('stations.total')}</dt><dd className="dash-value">{list.length}</dd></div>
      <div><dt>{msg('common.active')}</dt><dd className="dash-value c-ok">{list.filter(s => s.status === 'active').length}</dd></div>
      <div><dt>{msg('common.inactive')}</dt><dd className="dash-value c-warn">{list.filter(s => s.status === 'off').length}</dd></div>
    </dl>

    <section className="card card-pad stack" aria-labelledby="map-title">
      <div className="row-between">
        <h2 className="h3" id="map-title">{msg('stations.locations')}</h2>
        <div className="row row-wrap"><span className="small muted">{msg('stations.clickMarker')}</span><AreaToggle/></div>
      </div>
      <div className={picking ? 'station-map is-picking' : 'station-map'}>
        <MapContainer className="map-real" center={AREA_CENTER} zoom={14} scrollWheelZoom={false} zoomControl={false}>
          {/* Leaflet's own zoom buttons are English; this one is rebuilt (not the map) when the language changes. */}
          <ZoomControl key={locale} zoomInTitle={msg('map.zoomIn')} zoomOutTitle={msg('map.zoomOut')}/>
          <MapRef onReady={onReady}/>
          <BaseTiles layer="map"/>
          {visible && <AreaOverlay/>}
          <PickOnClick enabled={picking} onPick={(lat, lng) => { setPicking(false); setDraft(d => d && { ...d, lat: lat.toFixed(7), lng: lng.toFixed(7) }); }}/>
          {list.filter(s => !(draft?.existing && s.code === draft.code)).map(s => <Marker key={s.code} position={latLng(s)} icon={stationIcon(s)} title={s.code} eventHandlers={{ click: () => { if (!picking) open(s); } }}>
            <Tooltip direction="top" offset={[0, -10]}>{s.code} · {displayText(STATUS[s.status][1])}<br/>{s.latest ? `${wqiText(s.latest)} · ${batchText(s.latest)}` : msg('stations.noApprovedBatch')}</Tooltip>
          </Marker>)}
          {draft && draftPoint && <Marker position={draftPoint} icon={stationIcon(null, { draft: true })} interactive={false} zIndexOffset={1000}/>}
        </MapContainer>
        {picking && <div className="map-hint">{msg('stations.placeHint')}</div>}
      </div>
      <div className="row row-wrap small text-2" style={{ gap: '6px 12px' }}>
        <b>{msg('map.classification')}</b>
        {[...WQI_DISPLAY_BANDS].reverse().map(band => <span className="row" style={{ gap: 6 }} key={band.label}><span className={`dot ${TONE[band.label]}`}/>{qualityLabel(band.label)} ({band.min}–{band.max})</span>)}
        <span className="row" style={{ gap: 6 }}><span className="dot none"/>{msg('stations.noData')}</span>
      </div>
    </section>

    <section className="card card-flush" aria-labelledby="list-title">
      <div className="card-head">
        <h2 className="h3" id="list-title">{msg('stations.list')}</h2>
        <label className="input-icon" style={{ width: 260, maxWidth: '100%' }}>
          <Icon name="search"/>
          <input type="search" className="input sm" placeholder={msg('stations.searchPlaceholder')} aria-label={msg('stations.search')} value={query} onChange={e => { setQuery(e.target.value); setTablePage(1); }}/>
        </label>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('common.code')}</th><th>{msg('common.location')}</th><th>{msg('common.coordinates')}</th><th>{msg('common.status')}</th><th>{msg('stations.showing')}</th><th className="col-action">{msg('common.actions')}</th></tr></thead>
          <tbody>
            {!rows.length && <tr className="empty-row"><td colSpan={6}>{msg('stations.noMatches')}</td></tr>}
            {rows.map(s => <tr key={s.code}>
              <td className="strong">{s.code}</td>
              <td className="text-2">{s.name}</td>
              <td className="mono">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</td>
              <td><span className={`status ${STATUS[s.status][0]}`}>{displayText(STATUS[s.status][1])}</span></td>
              <td>{s.latest
                ? <span className="stack-4 cell-batch"><span className="row" style={{ gap: 6 }}><span className={`dot ${tone(s.latest.wqi)}`}/>{wqiText(s.latest)}</span><span className="xs muted">{batchText(s.latest)}</span></span>
                : <span className="row muted cell-batch" style={{ gap: 6 }}><span className="dot none"/>{msg('stations.noApprovedBatch')}</span>}
                {/* Details live in the history: the station's approved rows on Review Data (request 2b, 05/11). */}
                <Link className="link xs" to={`/admin/data?station=${s.id}&status=verified`} aria-label={msg('stations.dataLabel', { code: s.code })}>{msg('stations.viewData')}</Link></td>
              <td className="col-action"><span className="row" style={{ justifyContent: 'center', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('stations.showLabel', { code: s.code })} onClick={() => { map?.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' }); map?.flyTo(latLng(s), 16, { duration: .6 }); }}><Icon name="locate"/>{msg('stations.showOnMap')}</button>
                <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('stations.editLabel', { code: s.code })} onClick={() => open(s)}><Icon name="edit"/>{msg('common.edit')}</button>
              </span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={meta} noun="stations" onPage={setTablePage}/>
    </section>

    {draft && !picking && <Modal title={draft.existing ? msg('stations.editTitle', { code: draft.code }) : msg('stations.add')} submitLabel={saving ? msg('common.saving') : msg('stations.save')} onClose={() => { if (!savingRef.current) setDraft(null); }} onSubmit={save}>
      <fieldset className="modal-body" disabled={saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {failure && <div className="callout callout-warn span-2" role="alert">{messageText(failure)}</div>}
        <div className="field"><label className="label" htmlFor="e-code">{msg('stations.code')}</label><input id="e-code" className="input sm" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_\u002d]{2,40}" readOnly={draft.existing} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })}/><span className="hint">{msg('stations.codeHint')}</span></div>
        <div className="field"><label className="label" htmlFor="e-status">{msg('common.status')}</label>
          <select id="e-status" className="input sm" disabled={!draft.existing} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as StationInput['status'] })}><option value="active">{msg('common.active')}</option><option value="off">{msg('common.inactive')}</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="e-area">{msg('stations.area')}</label><select id="e-area" className="input sm" value={draft.administrativeArea} onChange={e => setDraft({ ...draft, administrativeArea: e.target.value as Station['administrativeArea'] })}><option value="Hải Dương">Hải Dương</option><option value="Hải Phòng">Hải Phòng</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="e-name">{msg('stations.location')}</label><input id="e-name" className="input sm" required minLength={2} maxLength={160} placeholder={msg('stations.locationPlaceholder')} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></div>
        <div className="field"><label className="label" htmlFor="e-lat">{msg('stations.latitude')}</label><input id="e-lat" type="number" step="any" min="-90" max="90" className="input sm" required value={draft.lat} onChange={e => setDraft({ ...draft, lat: e.target.value })}/></div>
        <div className="field"><label className="label" htmlFor="e-lng">{msg('stations.longitude')}</label><input id="e-lng" type="number" step="any" min="-180" max="180" className="input sm" required value={draft.lng} onChange={e => setDraft({ ...draft, lng: e.target.value })}/></div>
        <div className="span-2 row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPicking(true); map?.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Icon name="pin"/>{msg('stations.pick')}</button>
          <span className="hint">{msg('stations.draftHint')}</span>
        </div>
      </fieldset>
    </Modal>}
    {toast.element}
  </main>;
}
