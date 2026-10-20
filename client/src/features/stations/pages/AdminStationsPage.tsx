import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, Marker, Tooltip, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { AREA_CENTER, AreaOverlay, BaseTiles, fitStations, latLng, MapRef, stationIcon } from '@/components/map/MapBits';
import { AreaToggle, useAreaVisibility } from '@/components/map/AreaPreference';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { createStation, listAdminStations, updateStation } from '../api';
import type { Station, StationInput } from '../types';

const STATUS: Record<Station['status'], [string, string]> = { active: ['ok', 'Active'], maint: ['warn', 'Maintenance'], off: ['off', 'Inactive'] };
const latestSample = (list: Station[]) => list.map(s => s.last).filter((d): d is string => Boolean(d)).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? '—';
type Draft = { id?: string; code: string; name: string; administrativeArea: Station['administrativeArea']; status: StationInput['status']; lat: string; lng: string; existing: boolean };

function PickOnClick({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: event => { if (enabled) onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

export function AdminStationsPage() {
  const { data, error, loading, reload } = useAsync(listAdminStations);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.length ? 'ready' : 'empty');
  if (!data) return <PageStatus admin error={error} onRetry={reload}/>;
  return <StationManager initial={data}/>;
}

function StationManager({ initial }: { initial: Station[] }) {
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
  const rows = list.filter(s => !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
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
        setList(previous => previous.map(s => s.code === saved.code ? { ...s, ...saved } : s));
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
        <h1 className="h1">Monitoring Stations</h1>
        <p className="sub">Add, relocate or deactivate sampling points along the An Kim Hai canal. Changes appear on the public map.</p>
      </div>
      <div className="page-actions">
        <Link to="/map" className="btn btn-secondary" target="_blank" rel="noopener"><Icon name="external"/>Preview Public Map</Link>
        <button type="button" className="btn btn-primary" onClick={() => open(null)}><Icon name="plus" strokeWidth={2.4}/>Add Station</button>
      </div>
    </div>

    <div className="grid cols-4">
      <div className="card card-pad-sm stat"><span className="stat-label">Total Stations</span><span className="stat-value">{list.length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Active</span><span className="stat-value c-ok">{list.filter(s => s.status === 'active').length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Inactive</span><span className="stat-value c-warn">{list.filter(s => s.status === 'off').length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Last Sample Received</span><span className="stat-value sm">{latestSample(list)}</span></div>
    </div>

    <section className="card card-pad stack" aria-labelledby="map-title">
      <div className="row-between">
        <h2 className="h3" id="map-title">Station Locations</h2>
        <div className="row row-wrap"><span className="small muted">Click a marker to edit it</span><AreaToggle/></div>
      </div>
      <div className={picking ? 'station-map is-picking' : 'station-map'}>
        <MapContainer className="map-real" center={AREA_CENTER} zoom={14} scrollWheelZoom={false}>
          <MapRef onReady={onReady}/>
          <BaseTiles layer="map"/>
          {visible && <AreaOverlay/>}
          <PickOnClick enabled={picking} onPick={(lat, lng) => { setPicking(false); setDraft(d => d && { ...d, lat: lat.toFixed(7), lng: lng.toFixed(7) }); }}/>
          {list.filter(s => !(draft?.existing && s.code === draft.code)).map(s => <Marker key={s.code} position={latLng(s)} icon={stationIcon(s)} title={s.code} eventHandlers={{ click: () => { if (!picking) open(s); } }}>
            <Tooltip direction="top" offset={[0, -10]}>{s.code} · {STATUS[s.status][1]}</Tooltip>
          </Marker>)}
          {draft && draftPoint && <Marker position={draftPoint} icon={stationIcon(null, { draft: true })} interactive={false} zIndexOffset={1000}/>}
        </MapContainer>
        {picking && <div className="map-hint">Click on the map to place the station</div>}
      </div>
    </section>

    <section className="card card-flush" aria-labelledby="list-title">
      <div className="card-head">
        <h2 className="h3" id="list-title">Station List</h2>
        <label className="input-icon" style={{ width: 260, maxWidth: '100%' }}>
          <Icon name="search"/>
          <input type="search" className="input sm" placeholder="Search code or location…" aria-label="Search stations" value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Code</th><th>Location</th><th>Coordinates</th><th>Latest WQI</th><th>Last Sample</th><th>Records</th><th>Status</th><th className="t-right">Actions</th></tr></thead>
          <tbody>
            {!rows.length && <tr className="empty-row"><td colSpan={8}>No stations match your search.</td></tr>}
            {rows.map(s => <tr key={s.code}>
              <td className="strong">{s.code}</td>
              <td className="text-2">{s.name}</td>
              <td className="mono">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</td>
              <td>{s.wqi === null ? <span className="small muted">No data</span> : <span className={`badge b-${quality(s.wqi).key}`}>{s.wqi}</span>}</td>
              <td className={s.last ? undefined : 'muted'}>{s.last || '—'}</td>
              <td>{s.records}</td>
              <td><span className={`status ${STATUS[s.status][0]}`}>{STATUS[s.status][1]}</span></td>
              <td className="t-right"><span className="row-actions">
                <button type="button" title="Show on map" aria-label={`Show ${s.code} on map`} onClick={() => { map?.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' }); map?.flyTo(latLng(s), 16, { duration: .6 }); }}><Icon name="locate"/></button>
                <button type="button" title="Edit" aria-label={`Edit ${s.code}`} onClick={() => open(s)}><Icon name="edit"/></button>
              </span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {draft && !picking && <Modal title={draft.existing ? `Edit Station ${draft.code}` : 'Add Station'} submitLabel={saving ? 'Saving…' : 'Save Station'} onClose={() => { if (!savingRef.current) setDraft(null); }} onSubmit={save}>
      <fieldset className="modal-body" disabled={saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
        {failure && <div className="callout callout-warn span-2" role="alert">{failure}</div>}
        <div className="field"><label className="label" htmlFor="e-code">Station code</label><input id="e-code" className="input sm" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_\u002d]{2,40}" readOnly={draft.existing} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })}/><span className="hint">Letters, numbers, hyphens or underscores; e.g. AH1 or AKH-06</span></div>
        <div className="field"><label className="label" htmlFor="e-status">Status</label>
          <select id="e-status" className="input sm" disabled={!draft.existing} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as StationInput['status'] })}><option value="active">Active</option><option value="off">Inactive</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="e-area">Administrative area</label><select id="e-area" className="input sm" value={draft.administrativeArea} onChange={e => setDraft({ ...draft, administrativeArea: e.target.value as Station['administrativeArea'] })}><option value="Hải Dương">Hải Dương</option><option value="Hải Phòng">Hải Phòng</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="e-name">Location description</label><input id="e-name" className="input sm" required minLength={2} maxLength={160} placeholder="e.g. An Kim Hai lake outlet, Hai An" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></div>
        <div className="field"><label className="label" htmlFor="e-lat">Latitude</label><input id="e-lat" type="number" step="any" min="-90" max="90" className="input sm" required value={draft.lat} onChange={e => setDraft({ ...draft, lat: e.target.value })}/></div>
        <div className="field"><label className="label" htmlFor="e-lng">Longitude</label><input id="e-lng" type="number" step="any" min="-180" max="180" className="input sm" required value={draft.lng} onChange={e => setDraft({ ...draft, lng: e.target.value })}/></div>
        <div className="span-2 row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPicking(true); map?.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Icon name="pin"/>Pick on map</button>
          <span className="hint">The white marker on the map shows the position being saved.</span>
        </div>
      </fieldset>
    </Modal>}
    {toast.element}
  </main>;
}
