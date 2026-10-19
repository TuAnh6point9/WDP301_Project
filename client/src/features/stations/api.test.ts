import { afterEach, describe, expect, it } from 'vitest';
import { http } from '@/lib/http';
import { listStations } from './api';

const originalAdapter = http.defaults.adapter;
afterEach(() => { http.defaults.adapter = originalAdapter; });
const station = (code: string, isActive: boolean) => ({ _id: `${code}`.padEnd(24, '0'), code, name: `Station ${code}`, administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive });

describe('shared station adapter', () => {
  it('never returns deactivated stations, even when an admin session receives them', async () => {
    http.defaults.adapter = async config => ({ data: { data: [station('A1', true), station('B2', false)] }, status: 200, statusText: 'OK', headers: {}, config });
    const stations = await listStations();
    expect(stations.map(item => item.code)).toEqual(['A1']);
    expect(stations[0]).toMatchObject({ id: 'A1'.padEnd(24, '0'), lat: 20.9, lng: 106.6, status: 'active', wqi: null, ph: null, trend: [] });
  });
});
