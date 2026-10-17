import { USER_MESSAGES as M } from '@wqi/contracts';
// Historical measurements (UC04, UC05) and their admin management (UC11).
// Backend endpoints (docs/openapi.yaml): GET /water-records, POST /stations/:id/water-records,
// PATCH /water-records/:id, PATCH /water-records/:id/validation, POST /water-records/recalculate.
import { PREDICTION_UNIT_BASIS, recordSchema, type ApiResponse, type Station, type WaterRecord as ApiRecord } from '@wqi/contracts';
import { http } from '@/lib/http';
import { DAYS, PARAMS, indexOf, isoOf, type ParamKey, type SeriesSet } from './series';
import type { RecordColumn, RecordStation, WaterRecord, WaterRecordInput } from './types';

const COLUMNS: RecordColumn[] = ['ph', 'do', 'cod', 'nh4', 'po4', 'coliform'];
const SERIES_KEY: Record<RecordColumn, ParamKey> = { ph: 'pH', do: 'DO', cod: 'COD', nh4: 'NH4', po4: 'PO4', coliform: 'Coliform' };
const PAGE_LIMIT = 100, MAX_PAGES = 50;

/** Every record the query matches, newest first; the API returns at most 100 per page. */
async function listAll(params: Record<string, string>): Promise<ApiRecord[]> {
  const records: ApiRecord[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await http.get<ApiResponse<ApiRecord[]>>('/water-records', { params: { ...params, page, limit: PAGE_LIMIT } });
    records.push(...data.data);
    if (!data.meta || page >= data.meta.pages) break;
  }
  return records;
}

const stationOf = (record: ApiRecord) => typeof record.stationId === 'object' && record.stationId ? record.stationId : null;
const valueOf = (record: ApiRecord, column: RecordColumn) => {
  const value = record.parameters[column];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

function toRecord(record: ApiRecord): WaterRecord {
  const station = stationOf(record);
  const note = record.source?.note ?? '';
  return {
    id: record._id, date: record.measuredAt.slice(0, 10), station: station?.code ?? '—', stationId: station?._id ?? String(record.stationId),
    wqi: record.wqi, status: record.validationStatus, version: record.version,
    // The first clause of an import note names the batch, e.g. "AKH D17-2026".
    source: record.source?.kind === 'excel' ? `Excel${note ? ` · ${note.split(' · ')[0]}` : ''}` : 'Manual entry', sourceNote: note,
    ...Object.fromEntries(COLUMNS.map(column => [column, valueOf(record, column)])) as Record<RecordColumn, number | null>,
  };
}

/** Daily series for the Historical Data chart, keyed by station code; several samples on one day are averaged. */
export async function getDailySeries(): Promise<SeriesSet> {
  const records = await listAll({ from: `${isoOf(0)}T00:00:00Z` });
  const totals = new Map<string, { sum: number; count: number }>();
  const set: SeriesSet = {};
  for (const record of records) {
    const code = stationOf(record)?.code;
    const day = indexOf(record.measuredAt.slice(0, 10));
    if (!code || day < 0 || day >= DAYS) continue;
    const readings: [ParamKey, number | null][] = [...COLUMNS.map(column => [SERIES_KEY[column], valueOf(record, column)] as [ParamKey, number | null]), ['WQI', record.wqi]];
    for (const [key, value] of readings) {
      if (value === null) continue;
      const total = totals.get(`${code}|${key}|${day}`) ?? { sum: 0, count: 0 };
      total.sum += value;
      total.count += 1;
      totals.set(`${code}|${key}|${day}`, total);
      ((set[code] ??= {})[key] ??= Array(DAYS).fill(null))[day] = +(total.sum / total.count).toFixed(PARAMS[key].dec);
    }
  }
  return set;
}

/** Stations by code; guests only receive active ones. */
export async function listRecordStations(): Promise<RecordStation[]> {
  const { data } = await http.get<ApiResponse<Station[]>>('/stations', { params: { limit: 100 } });
  return data.data.map(station => ({ id: station._id, code: station.code, name: station.name, active: station.isActive }))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

/** All records, newest first (admin: every review status). */
export async function listWaterRecords(): Promise<WaterRecord[]> {
  return (await listAll({})).map(toRecord);
}

const body = (input: WaterRecordInput) => recordSchema.parse({
  measuredAt: `${input.date}T00:00:00.000Z`,
  parameters: Object.fromEntries(COLUMNS.map(column => [column, input[column]])),
  unitBasis: PREDICTION_UNIT_BASIS,
});

/** Saves a sample; the server computes its WQI with the CatBoost model (null when the AI service is down). */
export async function createWaterRecord(input: WaterRecordInput): Promise<WaterRecord> {
  const { data } = await http.post<ApiResponse<ApiRecord>>(`/stations/${encodeURIComponent(input.stationId)}/water-records`, body(input));
  return toRecord(data.data);
}

/** Saves new measurements; the WQI is recomputed and the record returns to pending review. */
export async function updateWaterRecord(record: WaterRecord, input: WaterRecordInput): Promise<WaterRecord> {
  const { data } = await http.patch<ApiResponse<ApiRecord>>(`/water-records/${encodeURIComponent(record.id)}`, { ...body(input), version: record.version });
  return toRecord(data.data);
}

/** Marks records as verified so they appear on the public chart. */
export async function verifyWaterRecords(records: WaterRecord[]): Promise<WaterRecord[]> {
  const verified: WaterRecord[] = [];
  for (const record of records) {
    const { data } = await http.patch<ApiResponse<ApiRecord>>(`/water-records/${encodeURIComponent(record.id)}/validation`, {
      status: 'verified', note: 'Xác nhận trên trang Measurement Records.', version: record.version,
    });
    verified.push(toRecord(data.data));
  }
  return verified;
}

export async function deleteWaterRecords(_ids: string[]): Promise<void> {
  throw new Error(M.DELETE_UNAVAILABLE);
}

/** Recomputes WQI from the stored measurements; returns how many records were updated. */
export async function recalculateWqi(ids: string[]): Promise<{ updated: number; skipped: number }> {
  const result = { updated: 0, skipped: 0 };
  for (let start = 0; start < ids.length; start += 100) {
    const { data } = await http.post<ApiResponse<{ updated: number; skipped: number }>>('/water-records/recalculate', { ids: ids.slice(start, start + 100) });
    result.updated += data.data.updated;
    result.skipped += data.data.skipped;
  }
  return result;
}
