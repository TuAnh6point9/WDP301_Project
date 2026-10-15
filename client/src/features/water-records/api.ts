import { USER_MESSAGES as M } from '@wqi/contracts';
// Historical measurements (UC04, UC05) and their admin management (UC11).
// Backend endpoints (docs/openapi.yaml): GET /water-records, POST /stations/:id/water-records,
// PATCH /water-records/:id.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { SeriesSet } from './series';
import type { WaterRecord, WaterRecordInput } from './types';

/** Daily series for the Historical Data chart, keyed by station code. */
export async function getDailySeries(): Promise<SeriesSet> {
  return {};
}

export async function listWaterRecords(): Promise<WaterRecord[]> {
  return [];
}

export async function createWaterRecord(_input: WaterRecordInput): Promise<WaterRecord> {
  throw new Error(M.RECORDS_UNAVAILABLE);
}

export async function updateWaterRecord(_id: string, _input: WaterRecordInput): Promise<WaterRecord> {
  throw new Error(M.RECORDS_UNAVAILABLE);
}

export async function deleteWaterRecords(_ids: string[]): Promise<void> {
  throw new Error(M.DELETE_UNAVAILABLE);
}

export async function recalculateWqi(_ids: string[]): Promise<void> {
  throw new Error(M.RECALCULATE_UNAVAILABLE);
}
