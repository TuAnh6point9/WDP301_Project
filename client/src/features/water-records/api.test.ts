import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { DAYS, isoOf, seriesReader } from './series';
import { getDailySeries } from './api';

const originalAdapter = http.defaults.adapter;
const station = { _id: 'a'.repeat(24), code: 'AH1', name: 'Điểm lấy mẫu AH1', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.491, 20.936] }, isActive: true };
const parameters = { ph: 7.14, do: 5.2, cod: 25.2, nh4: 0.44, po4: 0.1, coliform: 910 };
const record = (id: string, day: number, overrides: object = {}) => ({
  _id: id.padStart(24, '0'), stationId: station, measuredAt: `${isoOf(day)}T00:00:00.000Z`, parameters, unitBasis: 'training-source-unverified',
  validationStatus: 'verified', wqi: 75, qualityClass: 'Trung bình', version: 1, ...overrides,
});
function adapter(handle: (config: InternalAxiosRequestConfig) => unknown): AxiosAdapter {
  return async config => ({ data: handle(config), status: 200, statusText: 'OK', headers: {}, config });
}
beforeEach(() => { setCsrfToken('a'.repeat(64)); });
afterEach(() => { http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('water record API integration', () => {
  it('charts verified records of active stations from every page, keeping stored values and WQI', async () => {
    const queries: unknown[] = [];
    http.defaults.adapter = adapter(config => {
      queries.push(config.params);
      return config.params.page === 1
        ? { data: [
          record('1', DAYS - 1, { parameters: { ...parameters, cod: 20.123 }, wqi: 70 }), record('2', DAYS - 1, { parameters: { ...parameters, cod: 30 }, wqi: 80 }),
          record('4', DAYS - 2, { stationId: { ...station, code: 'AH2', isActive: false } }), record('5', DAYS - 2, { validationStatus: 'pending' }),
        ], meta: { page: 1, limit: 100, total: 5, pages: 2 } }
        : { data: [record('3', DAYS - 30, { wqi: null, parameters: { ...parameters, nh4: 0.437 } })], meta: { page: 2, limit: 100, total: 5, pages: 2 } };
    });
    const set = await getDailySeries();
    expect(queries).toEqual([1, 2].map(page => ({ from: `${isoOf(0)}T00:00:00Z`, status: 'verified', page, limit: 100 })));
    expect(set.AH1.COD?.[DAYS - 1]).toBeCloseTo(25.0615, 10);
    // WQI is the stored value of the newest record, not a mean of the day's WQI values.
    expect(set.AH1.WQI?.[DAYS - 1]).toBe(70);
    expect(set.AH1.NH4?.[DAYS - 30]).toBe(0.437);
    expect(set.AH1.WQI?.[DAYS - 30]).toBeNull();
    expect(set.AH1.COD?.[DAYS - 2]).toBeNull();
    expect(set.AH2).toBeUndefined();
    expect(Object.keys(set.AH1).sort()).toEqual(['COD', 'Coliform', 'DO', 'NH4', 'PO4', 'WQI', 'pH']);
    expect(seriesReader(set)('all', 'WQI')[DAYS - 1]).toBeNull();
  });
});
