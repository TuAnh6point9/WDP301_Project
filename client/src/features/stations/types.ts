export type StationStatus = 'active' | 'maint' | 'off';
export type Station = {
  code: string; name: string; lat: number; lng: number;
  wqi: number | null; ph: number; do: number; bod: number;
  trend: number[]; last: string | null; records: number;
  status: StationStatus;
};
/** Fields an admin edits on the Stations page. */
export type StationInput = Pick<Station, 'code' | 'name' | 'status' | 'lat' | 'lng'>;
