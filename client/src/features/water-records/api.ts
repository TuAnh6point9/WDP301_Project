// Historical measurements (UC04, UC05) and their admin review (UC11, FR-08).
// Backend endpoints (docs/openapi.yaml): GET /water-records, GET /water-records/:id, PATCH /water-records/:id/validation.
import { parameterKeys, type Parameters, type WaterRecord } from '@wqi/contracts';
import { http } from '@/lib/http';
import type { Page } from '@/features/system/types';
import { DAYS, indexOf, isoOf, type ParamKey, type SeriesSet } from './series';
import type { AdminRecord, AdminRecordDetail, ReviewStatus } from './types';

const SERIES_KEY: Record<keyof Parameters, ParamKey> = { coliform: 'Coliform', nh4: 'NH4', ph: 'pH', po4: 'PO4', do: 'DO', cod: 'COD' };
const PAGE_LIMIT = 100, MAX_PAGES = 50;
type ChartRecord = WaterRecord & { stationId: { code: string; isActive: boolean } | null };

/**
 * Daily series for the Historical Data chart, keyed by station code: verified records of active stations
 * from the past year. Measurements are kept unchanged (several samples of one station on one day are
 * averaged); WQI is the stored value of the newest record that day, never averaged or recomputed.
 */
export async function getDailySeries(): Promise<SeriesSet> {
  const set: SeriesSet = {};
  const totals = new Map<string, { sum: number; count: number }>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    // Admin sessions receive every status and station, so the public rule is applied here too.
    const { data } = await http.get<Page<ChartRecord>>('/water-records', { params: { from: `${isoOf(0)}T00:00:00Z`, status: 'verified', page, limit: PAGE_LIMIT } });
    for (const record of data.data) {
      const station = record.stationId, day = indexOf(record.measuredAt.slice(0, 10));
      if (!station?.isActive || record.validationStatus !== 'verified' || day < 0 || day >= DAYS) continue;
      const values = set[station.code] ??= {};
      const slot = (key: ParamKey) => values[key] ??= Array(DAYS).fill(null);
      if (record.wqi !== null && slot('WQI')[day] === null) slot('WQI')[day] = record.wqi;
      for (const key of parameterKeys) {
        const total = totals.get(`${station.code}|${key}|${day}`) ?? { sum: 0, count: 0 };
        total.sum += record.parameters[key];
        total.count += 1;
        totals.set(`${station.code}|${key}|${day}`, total);
        slot(SERIES_KEY[key])[day] = total.sum / total.count;
      }
    }
    if (page >= data.meta.pages) break;
  }
  return set;
}

/** Admins see every status; `createdFrom`/`createdTo` are calendar days of creation. */
export async function listAdminRecords(params: { status?: string; createdFrom: string; createdTo: string; page: number }): Promise<Page<AdminRecord>> {
  return (await http.get<Page<AdminRecord>>('/water-records', { params: { ...params, createdFrom: params.createdFrom || undefined, createdTo: params.createdTo || undefined, status: params.status || undefined, limit: 50 } })).data;
}

export async function getRecordDetail(id: string): Promise<AdminRecordDetail> {
  return (await http.get<{ data: AdminRecordDetail }>(`/water-records/${id}`)).data.data;
}

/** `version` guards against a concurrent change (409 RECORD_CHANGED). */
export async function reviewRecord(id: string, input: { status: ReviewStatus; note: string; version: number }): Promise<AdminRecord> {
  return (await http.patch<{ data: AdminRecord }>(`/water-records/${id}/validation`, input)).data.data;
}
