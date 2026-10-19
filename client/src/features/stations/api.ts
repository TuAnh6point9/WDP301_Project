import { USER_MESSAGES as M, type Station as ApiStation } from '@wqi/contracts';
// Station data for the map, home, historical and admin pages (UC03, UC12).
// Backend endpoints (docs/openapi.yaml): GET /stations, POST /stations, PATCH /stations/:id.
// TODO(BE): createStation/updateStation stay stubs until station management is scheduled.
import { http } from '@/lib/http';
import type { Station, StationInput } from './types';

/** Active stations only: an admin session also receives deactivated ones, which public pages must not show. */
export async function listStations(): Promise<Station[]> {
  const { data } = await http.get<{ data: ApiStation[] }>('/stations', { params: { limit: 100 } });
  return data.data.filter(station => station.isActive).map(station => ({
    id: station._id, code: station.code, name: station.name,
    lng: station.location.coordinates[0], lat: station.location.coordinates[1], status: 'active',
    wqi: null, ph: null, do: null, bod: null, trend: [], last: null, records: 0,
  }));
}

export async function createStation(_input: StationInput): Promise<Station> {
  throw new Error(M.STATIONS_UNAVAILABLE);
}

/** Resolves the saved fields; the caller merges them into the station it already holds. */
export async function updateStation(_input: StationInput): Promise<StationInput> {
  throw new Error(M.STATIONS_UNAVAILABLE);
}
