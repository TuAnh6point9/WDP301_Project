import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { roundLabel, roundPoints } from './series';
import { getSamples } from './api';

const originalAdapter = http.defaults.adapter;
const station = { _id: 'a'.repeat(24), code: 'AH1', name: 'Điểm lấy mẫu AH1', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.491, 20.936] }, isActive: true };
const parameters = { ph: 7.14, do: 5.2, cod: 25.2, nh4: 0.44, po4: 0.1, coliform: 910 };
/** `seconds` is the ObjectId time: when the record was saved. */
const record = (seconds: number, overrides: object = {}) => ({
  _id: seconds.toString(16).padStart(8, '0') + '0'.repeat(16), stationId: station, measuredAt: null, batchCode: 'D01-2026', parameters, unitBasis: 'training-source-unverified',
  validationStatus: 'verified', wqi: 75, qualityClass: 'Trung bình', version: 1, ...overrides,
});
function adapter(handle: (config: InternalAxiosRequestConfig) => unknown): AxiosAdapter {
  return async config => ({ data: handle(config), status: 200, statusText: 'OK', headers: {}, config });
}
beforeEach(() => { setCsrfToken('a'.repeat(64)); });
afterEach(() => { http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('water record API integration', () => {
  it('groups verified records of active stations from every page into rounds by batch code, oldest first', async () => {
    const queries: unknown[] = [];
    http.defaults.adapter = adapter(config => {
      queries.push(config.params);
      return config.params.page === 1
        ? { data: [
          record(300, { batchCode: 'D02-2026', parameters: { ...parameters, cod: 20.123 }, wqi: 70 }), record(310, { batchCode: 'D02-2026', parameters: { ...parameters, cod: 30 }, wqi: 80 }),
          record(400, { batchCode: 'D03-2026', stationId: { ...station, code: 'AH2', isActive: false } }), record(410, { batchCode: 'D03-2026', validationStatus: 'pending' }),
        ], meta: { page: 1, limit: 100, total: 6, pages: 2 } }
        // A record entered by hand has a sampling day and no batch code.
        : { data: [record(200, { wqi: null, parameters: { ...parameters, nh4: 0.437 } }), record(900, { batchCode: null, measuredAt: '1970-01-01T00:01:40.000Z' })], meta: { page: 2, limit: 100, total: 6, pages: 2 } };
    });
    const { rounds, samples } = await getSamples();
    // Excel imports have no sampling date, so the query has no date range.
    expect(queries).toEqual([1, 2].map(page => ({ status: 'verified', page, limit: 100 })));
    expect(rounds.map(roundLabel)).toEqual(['01/01/1970', 'D01-2026', 'D02-2026']);
    expect(samples.map(sample => [sample.round, sample.station, sample.wqi])).toEqual([
      ['batch:D02-2026', 'AH1', 70], ['batch:D02-2026', 'AH1', 80], ['batch:D01-2026', 'AH1', null], ['day:1970-01-01', 'AH1', 75],
    ]);
    expect(samples[2].values.NH4).toBe(0.437);

    // The chart shows each round's mean and, with several samples, their lowest and highest value.
    const points = roundPoints(rounds, samples);
    expect(points.map(point => [point.label, point.count, point.stations])).toEqual([['01/01/1970', 1, ['AH1']], ['D01-2026', 1, ['AH1']], ['D02-2026', 2, ['AH1']]]);
    expect(points[2].mean.COD).toBe(25.06);
    expect(points[2].range.COD).toEqual([20.123, 30]);
    expect(points[1].range.COD).toBeNull();
  });
});
