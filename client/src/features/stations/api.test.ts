import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, setCsrfToken } from '@/lib/http';
import { createStation, listAdminStations, listStations, updateStation } from './api';
import type { StationInput } from './types';

const originalAdapter = http.defaults.adapter;
beforeEach(() => setCsrfToken('a'.repeat(64)));
afterEach(() => { http.defaults.adapter = originalAdapter; setCsrfToken(null); });
const station = (code: string, isActive: boolean) => ({ _id: 'a'.repeat(24), code, name: `Station ${code}`, administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive });
const input: StationInput = { code: 'AH1', name: 'Test location', administrativeArea: 'Hải Dương', lat: 20.93261429, lng: 106.48548944, status: 'active' };

describe('shared station adapter', () => {
  it('never returns deactivated stations, even when an admin session receives them', async () => {
    http.defaults.adapter = async config => ({ data: { data: [station('A1', true), station('B2', false)] }, status: 200, statusText: 'OK', headers: {}, config });
    const stations = await listStations();
    expect(stations.map(item => item.code)).toEqual(['A1']);
    expect(stations[0]).toMatchObject({ administrativeArea: 'Hải Phòng', lat: 20.9, lng: 106.6, status: 'active', wqi: null, ph: null, trend: [] });
    expect((await listAdminStations()).map(item => item.status)).toEqual(['active', 'off']);
  });
  it('loads all pages rather than silently losing stations after the first 100', async () => {
    const pages: number[] = [];
    http.defaults.adapter = async config => {
      pages.push(config.params.page);
      return { data: { data: [station(config.params.page === 1 ? 'AH1' : 'AH2', true)], meta: { pages: 2 } }, status: 200, statusText: 'OK', headers: {}, config };
    };
    expect((await listStations()).map(s => s.code)).toEqual(['AH1', 'AH2']);
    expect(pages).toEqual([1, 2]);
  });
  it('creates via POST with CSRF, area and GeoJSON longitude/latitude order', async () => {
    http.defaults.adapter = async config => {
      expect(config.method).toBe('post'); expect(config.url).toBe('/stations');
      expect(config.headers.get('X-CSRF-Token')).toBe('a'.repeat(64));
      expect(JSON.parse(config.data)).toEqual({ code: input.code, name: input.name, administrativeArea: input.administrativeArea, location: { type: 'Point', coordinates: [input.lng, input.lat] } });
      return { data: { data: station('AH1', true) }, status: 201, statusText: 'Created', headers: {}, config };
    };
    expect(await createStation(input)).toMatchObject({ code: 'AH1', status: 'active' });
  });
  it('updates by immutable id, keeps coordinates and sends explicit isActive', async () => {
    http.defaults.adapter = async config => {
      expect(config.method).toBe('patch'); expect(config.url).toBe(`/stations/${'a'.repeat(24)}`);
      expect(JSON.parse(config.data)).toEqual({ name: input.name, administrativeArea: input.administrativeArea, location: { type: 'Point', coordinates: [input.lng, input.lat] }, isActive: false });
      return { data: { data: station('AH1', false) }, status: 200, statusText: 'OK', headers: {}, config };
    };
    expect(await updateStation('a'.repeat(24), { ...input, status: 'off' })).toMatchObject({ status: 'off' });
  });
  it('rejects invalid data/id before making any HTTP request', async () => {
    const adapter = vi.fn(); http.defaults.adapter = adapter;
    await expect(createStation({ ...input, lat: NaN })).rejects.toThrow();
    await expect(createStation({ ...input, status: 'off' })).rejects.toThrow();
    await expect(updateStation('not-an-id', input)).rejects.toThrow();
    expect(adapter).not.toHaveBeenCalled();
  });
});
