// Historical measurements (UC04, UC05) and their admin review (UC11, FR-08).
// Backend endpoints (docs/openapi.yaml): GET /water-records, GET /water-records/:id, PATCH /water-records/:id/validation.
import { parameterKeys, type Parameters, type WaterRecord } from '@wqi/contracts';
import { http } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/paging';
import type { Page } from '@/features/system/types';
import type { MeasurementKey, Round, Sample } from './series';
import type { AdminRecord, AdminRecordDetail, ReviewStatus } from './types';

const SERIES_KEY: Record<keyof Parameters, MeasurementKey> = { coliform: 'Coliform', nh4: 'NH4', ph: 'pH', po4: 'PO4', do: 'DO', cod: 'COD' };
const PAGE_LIMIT = 100, MAX_PAGES = 50;
type ChartRecord = WaterRecord & { stationId: { code: string; isActive: boolean } | null };
/** When a record was first saved, from its ObjectId. */
const savedAt = (id: string) => parseInt(id.slice(0, 8), 16) * 1000;
/**
 * Oldest round first, as the server orders batches (decision 28, stations newerBatch): dated records without a
 * code come first; then other codes, by when they were saved (the public API has no approval time); then
 * D<n>-<yyyy> codes by year and number.
 */
function roundOrder(round: Round) {
  const parts = round.code ? /^D(\d+)-(\d{4})$/.exec(round.code) : null;
  return parts ? [2, Number(parts[2]), Number(parts[1])] : [round.code ? 1 : 0, round.at, 0];
}
const compareRounds = (a: Round, b: Round) => {
  const x = roundOrder(a), y = roundOrder(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.key.localeCompare(b.key, undefined, { numeric: true });
};

/**
 * Samples for the Historical Data chart: every verified record of an active station, values and WQI
 * unchanged, grouped into sampling rounds. An Excel import's round is its batch code (it has no sampling
 * date); a record entered with a date and no code makes a round of that day.
 */
export async function getSamples(): Promise<{ rounds: Round[]; samples: Sample[] }> {
  const rounds = new Map<string, Round>(), samples: Sample[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    // Admin sessions receive every status and station, so the public rule is applied here too.
    const { data } = await http.get<Page<ChartRecord>>('/water-records', { params: { status: 'verified', page, limit: PAGE_LIMIT } });
    for (const record of data.data) {
      const station = record.stationId, code = record.batchCode || null, day = record.measuredAt?.slice(0, 10) ?? null;
      if (!station?.isActive || record.validationStatus !== 'verified' || (!code && !day)) continue;
      const key = code ? `batch:${code}` : `day:${day}`;
      const at = code ? savedAt(record._id) : Date.parse(day!);
      const round = rounds.get(key);
      if (!round) rounds.set(key, { key, code, day: code ? null : day, at });
      else round.at = Math.min(round.at, at);
      samples.push({ id: record._id, round: key, station: station.code, wqi: record.wqi,
        values: Object.fromEntries(parameterKeys.map(name => [SERIES_KEY[name], record.parameters[name]])) as Sample['values'] });
    }
    if (page >= data.meta.pages) break;
  }
  return { rounds: [...rounds.values()].sort(compareRounds), samples };
}

/** Admins see every status; `createdFrom`/`createdTo` are calendar days of creation. One station's rows come newest batch first. */
export async function listAdminRecords(params: { status?: string; stationId?: string; createdFrom: string; createdTo: string; page: number }): Promise<Page<AdminRecord>> {
  return (await http.get<Page<AdminRecord>>('/water-records', { params: { ...params, createdFrom: params.createdFrom || undefined, createdTo: params.createdTo || undefined, status: params.status || undefined, stationId: params.stationId || undefined, limit: PAGE_SIZE } })).data;
}

export async function getRecordDetail(id: string): Promise<AdminRecordDetail> {
  return (await http.get<{ data: AdminRecordDetail }>(`/water-records/${id}`)).data.data;
}

/** `version` guards against a concurrent change (409 RECORD_CHANGED). */
export async function reviewRecord(id: string, input: { status: ReviewStatus; note: string; version: number }): Promise<AdminRecord> {
  return (await http.patch<{ data: AdminRecord }>(`/water-records/${id}/validation`, input)).data.data;
}
