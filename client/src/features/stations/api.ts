// Station data for the map and admin pages (UC03, UC12).
// Backend endpoints (docs/openapi.yaml): GET /stations, POST /stations, PATCH /stations/:id.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { Station, StationInput } from './types';

export async function listStations(): Promise<Station[]> {
  return [];
}

export async function createStation(_input: StationInput): Promise<Station> {
  throw new Error('Saving stations is not available yet.');
}

/** Resolves the saved fields; the caller merges them into the station it already holds. */
export async function updateStation(_input: StationInput): Promise<StationInput> {
  throw new Error('Saving stations is not available yet.');
}
