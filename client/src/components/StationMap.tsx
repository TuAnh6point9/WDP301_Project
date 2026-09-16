import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import { Link } from 'react-router-dom';
import type { Station, WaterRecord } from '@wqi/contracts';
import { useApi } from '../lib/hooks';
import { QualityBadge, formatDate } from './ui';
import 'leaflet/dist/leaflet.css';
function FitStations({ stations }: { stations: Station[] }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length) map.fitBounds(latLngBounds(stations.map(station => [station.location.coordinates[1], station.location.coordinates[0]])), { padding: [50, 50], maxZoom: 13 });
  }, [map, stations]);
  return null;
}
function Latest({ id }: { id: string }) {
  const result = useApi<WaterRecord[]>(`/stations/${id}/water-records?limit=1&status=verified`);
  const record = result.data?.[0];
  return <>{record ? <><p>{formatDate(record.measuredAt)}</p><QualityBadge value={record.wqi} label={record.qualityClass}/></> : <p>{result.loading ? 'Đang tải…' : result.error || 'Chưa có số liệu đã kiểm định.'}</p>}</>;
}
export function StationMap({ stations }: { stations: Station[] }) {
  const [tileError, setTileError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="map-wrap"><MapContainer center={[20.93, 106.45]} zoom={10} className="station-map" scrollWheelZoom={false}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true) }}/>
    <FitStations stations={stations}/>
    {stations.map(station => <CircleMarker key={station._id} center={[station.location.coordinates[1], station.location.coordinates[0]]} radius={8} pathOptions={{ color: '#fff', fillColor: '#17695a', fillOpacity: 1, weight: 3 }} eventHandlers={{ click: () => setSelected(station._id) }}><Popup><strong>{station.name}</strong><p>{station.code} · {station.administrativeArea}</p>{selected === station._id && <Latest id={station._id}/>}<p><Link to={`/stations/${station._id}`}>Xem dữ liệu trạm →</Link></p></Popup></CircleMarker>)}
  </MapContainer>{(!stations.length || tileError) && <div className="map-notice">{tileError ? 'Không tải được nền bản đồ. Bạn vẫn có thể tra cứu bằng bảng dữ liệu.' : 'Chưa có trạm với tọa độ được cung cấp.'}</div>}</div>;
}
