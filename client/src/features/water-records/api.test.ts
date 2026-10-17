import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { DAYS, isoOf } from './series';
import { createWaterRecord, getDailySeries, recalculateWqi, verifyWaterRecords } from './api';

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
  it('builds daily chart series from every page of the past year, averaging samples of one day', async () => {
    const queries: unknown[] = [];
    http.defaults.adapter = adapter(config => {
      queries.push(config.params);
      return config.params.page === 1
        ? { data: [record('1', DAYS - 1, { parameters: { ...parameters, cod: 20 }, wqi: 70 }), record('2', DAYS - 1, { parameters: { ...parameters, cod: 30 }, wqi: 80 })], meta: { page: 1, limit: 100, total: 3, pages: 2 } }
        : { data: [record('3', DAYS - 30, { wqi: null })], meta: { page: 2, limit: 100, total: 3, pages: 2 } };
    });
    const set = await getDailySeries();
    expect(queries).toEqual([{ from: `${isoOf(0)}T00:00:00Z`, page: 1, limit: 100 }, { from: `${isoOf(0)}T00:00:00Z`, page: 2, limit: 100 }]);
    expect(set.AH1.COD?.[DAYS - 1]).toBe(25);
    expect(set.AH1.WQI?.[DAYS - 1]).toBe(75);
    expect(set.AH1.PO4?.[DAYS - 30]).toBe(0.1);
    expect(set.AH1.WQI?.[DAYS - 30]).toBeNull();
    expect(set.AH1.COD?.[DAYS - 2]).toBeNull();
    expect(Object.keys(set.AH1).sort()).toEqual(['COD', 'Coliform', 'DO', 'NH4', 'PO4', 'WQI', 'pH']);
  });

  it('sends the six measurements to the station and maps the WQI computed by the server', async () => {
    let sent: { url?: string; body?: unknown } = {};
    http.defaults.adapter = adapter(config => {
      sent = { url: config.url, body: JSON.parse(config.data) };
      return { data: record('9', DAYS - 1, { validationStatus: 'pending', source: { kind: 'manual' } }) };
    });
    const saved = await createWaterRecord({ date: '2026-09-05', stationId: station._id, ...parameters });
    expect(sent).toEqual({ url: `/stations/${station._id}/water-records`, body: { measuredAt: '2026-09-05T00:00:00.000Z', parameters, unitBasis: 'training-source-unverified' } });
    expect(saved).toMatchObject({ station: 'AH1', stationId: station._id, wqi: 75, status: 'pending', source: 'Manual entry', ...parameters });
  });

  it('verifies each record with its version and recalculates in batches of 100', async () => {
    const calls: { url?: string; body: { ids?: string[]; version?: number; status?: string } }[] = [];
    http.defaults.adapter = adapter(config => {
      const body = JSON.parse(config.data);
      calls.push({ url: config.url, body });
      return { data: config.url?.endsWith('/validation') ? record('5', DAYS - 1, { version: 4 }) : { updated: body.ids.length, skipped: 0 } };
    });
    const [verified] = await verifyWaterRecords([{ id: '5'.padStart(24, '0'), version: 3 } as Parameters<typeof verifyWaterRecords>[0][number]]);
    expect(calls[0]).toMatchObject({ url: `/water-records/${'5'.padStart(24, '0')}/validation`, body: { status: 'verified', version: 3 } });
    expect(verified).toMatchObject({ status: 'verified', version: 4 });
    const ids = Array.from({ length: 150 }, (_, i) => String(i).padStart(24, '0'));
    expect(await recalculateWqi(ids)).toEqual({ updated: 150, skipped: 0 });
    expect(calls.slice(1).map(call => call.body.ids?.length)).toEqual([100, 50]);
  });
});
