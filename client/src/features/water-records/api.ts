// Historical measurements (UC04, UC05) and their admin review (UC11, FR-08).
// Backend endpoints (docs/openapi.yaml): GET /water-records, PATCH /water-records/:id/validation.
// TODO(BE): getDailySeries still returns no series; the Historical Data chart is out of scope here.
import { http } from '@/lib/http';
import type { Page } from '@/features/system/types';
import type { SeriesSet } from './series';
import type { AdminRecord, AdminRecordDetail, ReviewStatus } from './types';

/** Daily series for the Historical Data chart, keyed by station code. */
export async function getDailySeries(): Promise<SeriesSet> {
  return {};
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
