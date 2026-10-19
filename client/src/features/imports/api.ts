// Excel import of historical data (UC10, UC11, FR-08).
// Backend: POST /imports/preview, POST /imports/commit (same file again), GET /imports,
// GET /imports/:id/rows, POST /imports/:id/rows/:rowId/normalize.
import type { ImportBatch as ApiBatch, PageMeta, WaterRecord } from '@wqi/contracts';
import { http } from '@/lib/http';
import type { DateRange, Page } from '@/features/system/types';
import { bounds } from '@/features/system/api';
import type { ImportBatch, ImportedRow, ImportPreview, NormalizeInput } from './types';

const upload = (file: File) => { const body = new FormData(); body.append('file', file); return body; };

export async function previewImport(file: File): Promise<ImportPreview> {
  return (await http.post<{ data: ImportPreview }>('/imports/preview', upload(file))).data.data;
}

/** The returned batch is not populated: `uploadedBy` is an id here. */
export async function commitImport(file: File): Promise<{ batch: ApiBatch; duplicate: boolean }> {
  return (await http.post<{ data: { batch: ApiBatch; duplicate: boolean } }>('/imports/commit', upload(file))).data.data;
}

/** Newest first. */
export async function listImportBatches(params: DateRange & { page: number }): Promise<Page<ImportBatch>> {
  return (await http.get<Page<ImportBatch>>('/imports', { params: { ...params, ...bounds(params.from, params.to), limit: 20 } })).data;
}

export async function listBatchRows(id: string, page: number): Promise<{ rows: ImportedRow[]; meta: PageMeta }> {
  const { data } = await http.get<{ data: { rows: ImportedRow[] }; meta: PageMeta }>(`/imports/${id}/rows`, { params: { page, limit: 50 } });
  return { rows: data.data.rows, meta: data.meta };
}

export async function normalizeRow(batchId: string, rowId: string, input: NormalizeInput): Promise<WaterRecord> {
  return (await http.post<{ data: WaterRecord }>(`/imports/${batchId}/rows/${rowId}/normalize`, input)).data.data;
}
