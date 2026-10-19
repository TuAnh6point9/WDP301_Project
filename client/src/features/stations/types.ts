export type StationStatus = 'active' | 'maint' | 'off';
/** Station as drawn on the map; measurement fields stay null until station data is provided. */
export type Station = {
  id: string; code: string; name: string; lat: number; lng: number;
  wqi: number | null; ph: number | null; do: number | null; bod: number | null;
  trend: number[]; last: string | null; records: number;
  status: StationStatus;
};
/** Fields an admin edits on the Stations page. */
export type StationInput = Pick<Station, 'code' | 'name' | 'status' | 'lat' | 'lng'>;
