import { useAsync } from '@/lib/useAsync';
import { MonitoringMap } from '@/components/map/MapBits';
import { listStations } from '@/features/stations/api';

const NO_STATIONS: never[] = [];

/** Non-interactive map preview; the full map lives at /map. */
export function MapPreview() {
  const { data } = useAsync(listStations);
  const stations = data ?? NO_STATIONS;
  return <MonitoringMap id="home-preview" stations={stations} preview selectedCode={stations[0]?.code}/>;
}
