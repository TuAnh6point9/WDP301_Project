import { objectId, stationSchema, type Station as ApiStation } from '@wqi/contracts';
// Station data for the map, home, historical and admin pages (UC03, UC12).
// Backend endpoints (docs/openapi.yaml): GET /stations, POST /stations, PATCH /stations/:id.
import { http } from '@/lib/http';
import type { Station, StationInput } from './types';

const toStation = (station: ApiStation): Station => ({
    id: station._id, code: station.code, name: station.name,
    administrativeArea: station.administrativeArea,
    lng: station.location.coordinates[0], lat: station.location.coordinates[1], status: station.isActive ? 'active' : 'off',
    wqi: null, ph: null, do: null, bod: null, trend: [], last: null, records: 0,
});

async function fetchStations(includeInactive: boolean): Promise<Station[]> {
  const stations: ApiStation[] = [];
  let page = 1, pages = 1;
  do {
    const response = await http.get<{ data: ApiStation[]; meta?: { pages: number } }>('/stations', { params: { page, limit: 100 } });
    stations.push(...response.data.data);
    pages = response.data.meta?.pages ?? 1;
    page++;
  } while (page <= pages);
  return stations.filter(station => includeInactive || station.isActive).map(toStation);
}

/** Public maps never expose inactive stations, even with an admin session. */
export const listStations = () => fetchStations(false);
/** The server includes inactive stations only for an authenticated admin. */
export const listAdminStations = () => fetchStations(true);

function stationPayload(input: StationInput) {
  return stationSchema.parse({ code: input.code, name: input.name, administrativeArea: input.administrativeArea,
    location: { type: 'Point', coordinates: [input.lng, input.lat] } });
}

export async function createStation(input: StationInput): Promise<Station> {
  const payload = stationPayload(input);
  // New stations are active on the server; avoid a partial create-then-deactivate workflow.
  if (input.status !== 'active') throw new Error('New stations must be active. Deactivate them after creation.');
  const response = await http.post<{ data: ApiStation }>('/stations', payload);
  return toStation(response.data.data);
}

export async function updateStation(id: string, input: StationInput): Promise<Station> {
  objectId.parse(id);
  const { name, administrativeArea, location } = stationPayload(input);
  const response = await http.patch<{ data: ApiStation }>(`/stations/${id}`, { name, administrativeArea, location, isActive: input.status === 'active' });
  return toStation(response.data.data);
}
