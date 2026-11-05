import type { Station as ApiStation, StationLatest } from '@wqi/contracts';

export type StationStatus = 'active' | 'maint' | 'off';
/** Station as drawn on every map. */
export type Station = {
  id: string; code: string; name: string; lat: number; lng: number;
  administrativeArea: ApiStation['administrativeArea'];
  /** The row of the newest approved batch (decision 28), on every map; null without one. Its WQI colours the pin. */
  latest: StationLatest | null;
  status: StationStatus;
};
/** Fields an admin edits on the Stations page. */
export type StationInput = Pick<Station, 'code' | 'name' | 'administrativeArea' | 'lat' | 'lng'> & { status: 'active' | 'off' };
