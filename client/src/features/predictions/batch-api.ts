import { USER_MESSAGES, userErrorMessage, type ApiResponse, type PageMeta, type PredictionBatch, type PredictionBatchRow } from '@wqi/contracts';
import { ApiError, http } from '@/lib/http';

const path = '/prediction-batches';
export const batchStatusLabels: Record<PredictionBatch['status'], string> = {
  preview: 'Awaiting confirmation', queued: 'Queued', running: 'Calculating', paused: 'Paused',
  completed: 'Completed', completed_with_errors: 'Completed with errors',
};
export async function previewWqiFile(file: File) {
  const form = new FormData(); form.append('file', file);
  return (await http.post<ApiResponse<PredictionBatch>>(`${path}/preview`, form)).data.data;
}
export async function startWqiBatch(id: string) { return (await http.post<ApiResponse<PredictionBatch>>(`${path}/${id}/start`, {})).data.data; }
export async function getWqiBatch(id: string) { return (await http.get<ApiResponse<PredictionBatch>>(`${path}/${id}`)).data.data; }
export async function getWqiBatchRows(id: string, page: number, errors: boolean) {
  const response = await http.get<ApiResponse<PredictionBatchRow[]>>(`${path}/${id}/rows`, { params: { page, limit: 20, filter: errors ? 'errors' : 'all' } });
  if (!response.data.meta) throw new Error('Could not read pagination.');
  return { rows: response.data.data, meta: response.data.meta };
}
export async function listWqiBatches(page: number): Promise<{ rows: PredictionBatch[]; meta: PageMeta }> {
  const response = await http.get<ApiResponse<PredictionBatch[]>>(path, { params: { page, limit: 20 } });
  if (!response.data.meta) throw new Error('Could not read pagination.');
  return { rows: response.data.data, meta: response.data.meta };
}
export async function getWqiBatchExcel(id: string) { return (await http.get<Blob>(`${path}/${id}/export`, { responseType: 'blob', timeout: 60000 })).data; }
export function batchFailure(error: unknown, fallback: string = USER_MESSAGES.ACTION_FAILED) {
  const messages: Record<string, string> = {
    INVALID_WORKBOOK: 'The file needs one sheet with all six columns PH, COD, DO, Amoni, Phosphat, Coliforms; data column names must be unique. Temp and BOD5 are optional.',
    EMPTY_WORKBOOK: 'The file has no data rows.', FILE_REQUIRED: 'Please choose an .xlsx file.',
    FILE_TOO_LARGE: 'Files can be up to 5 MB.', UPLOAD_ERROR: 'Please choose an .xlsx file up to 5 MB.', ROW_LIMIT: 'Files can have up to 10,000 data rows.',
    BATCH_ACTIVE: 'You already have a batch queued or calculating. Please wait for it to finish.',
    AI_MODEL_CHANGED: 'The model has changed. Upload the file again to create a new batch; saved results are kept.',
    NO_VALID_ROWS: 'There are no valid rows to calculate.',
  };
  return error instanceof ApiError && messages[error.code] ? messages[error.code] : userErrorMessage(error, fallback);
}
