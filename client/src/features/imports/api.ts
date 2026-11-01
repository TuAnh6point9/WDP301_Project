// Excel import of measurements by batch code (UC10, UC11, FR-08; decision 24).
// Backend: GET /imports/template, POST /imports/preview, POST /imports/commit (same file again), GET /imports, GET /imports/:id/rows.
import type { PageMeta } from '@wqi/contracts';
import { http } from '@/lib/http';
import { PAGE_SIZE } from '@/lib/paging';
import type { DateRange, Page } from '@/features/system/types';
import { bounds } from '@/features/system/api';
import type { ImportBatch, ImportedRow, ImportFill, ImportPreview, ImportResult } from './types';

const upload = (file: File, fills: ImportFill[], confirm: string[] = []) => {
  const body = new FormData();
  if (confirm.length) body.append('confirm', confirm.join(','));
  if (fills.length) body.append('fills', JSON.stringify(fills));
  body.append('file', file);
  return body;
};

export async function downloadImportTemplate(): Promise<Blob> {
  return (await http.get<Blob>('/imports/template', { responseType: 'blob' })).data;
}

export async function previewImport(file: File, fills: ImportFill[] = []): Promise<ImportPreview> {
  return (await http.post<{ data: ImportPreview }>('/imports/preview', upload(file, fills))).data.data;
}

/** `confirm` holds the preview's keys of the batches the admin chose to overwrite; the server re-checks the file and skips any other existing batch. */
export async function commitImport(file: File, confirm: string[], fills: ImportFill[] = []): Promise<ImportResult> {
  // Longer than the default: the server also calculates WQI before it answers, and giving up early would report a saved file as failed.
  return (await http.post<{ data: ImportResult }>('/imports/commit', upload(file, fills, confirm), { timeout: 120000 })).data.data;
}

/** Sorted by batch code. */
export async function listImportBatches(params: DateRange & { page: number }): Promise<Page<ImportBatch>> {
  return (await http.get<Page<ImportBatch>>('/imports', { params: { ...params, ...bounds(params.from, params.to), limit: PAGE_SIZE } })).data;
}

export async function listBatchRows(id: string, page: number): Promise<{ rows: ImportedRow[]; meta: PageMeta }> {
  const { data } = await http.get<{ data: { rows: ImportedRow[] }; meta: PageMeta }>(`/imports/${id}/rows`, { params: { page, limit: PAGE_SIZE } });
  return { rows: data.data.rows, meta: data.meta };
}
