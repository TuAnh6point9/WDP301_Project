import { useCallback, useEffect, useState } from 'react';
import { MapContainer, Marker } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import { useAsync } from '@/lib/useAsync';
import { AREA_CENTER, AreaOverlay, BaseTiles, fitStations, latLng, MapRef, stationIcon } from '@/components/map/MapBits';
import { listStations } from '@/features/stations/api';
import { useAreaVisibility } from '@/components/map/AreaPreference';

/** Static preview of the station map for the home page; the full map lives at /map. */
export function MapPreview() {
  const { visible } = useAreaVisibility();
  const { data: stations = [] } = useAsync(listStations);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const onReady = useCallback((instance: LeafletMap) => setMap(instance), []);
  useEffect(() => {
    if (!map) return;
    fitStations(map, stations, 40);
    const resize = () => fitStations(map, stations, 40);
    map.on('resize', resize);
    return () => { map.off('resize', resize); };
  }, [map, stations]);
  return <MapContainer className="map-real" center={AREA_CENTER} zoom={13} zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false} attributionControl>
    <MapRef onReady={onReady}/>
    <BaseTiles layer="map"/>
    {visible && <AreaOverlay labels={false}/>}
    {stations.map((station, index) => <Marker key={station.code} position={latLng(station)} icon={stationIcon(station, { selected: index === 0 })} interactive={false} zIndexOffset={index === 0 ? 1000 : 0}/>)}
  </MapContainer>;
}
