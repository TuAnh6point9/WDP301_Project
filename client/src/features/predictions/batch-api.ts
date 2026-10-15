import { userErrorMessage, type ApiResponse, type PageMeta, type PredictionBatch, type PredictionBatchRow } from '@wqi/contracts';
import { ApiError, http } from '@/lib/http';

const path = '/prediction-batches';
export const batchStatusLabels: Record<PredictionBatch['status'], string> = {
  preview: 'Chờ xác nhận', queued: 'Đang chờ', running: 'Đang tính', paused: 'Tạm dừng',
  completed: 'Hoàn tất', completed_with_errors: 'Hoàn tất, có dòng lỗi',
};
export async function previewWqiFile(file: File) {
  const form = new FormData(); form.append('file', file);
  return (await http.post<ApiResponse<PredictionBatch>>(`${path}/preview`, form)).data.data;
}
export async function startWqiBatch(id: string) { return (await http.post<ApiResponse<PredictionBatch>>(`${path}/${id}/start`, {})).data.data; }
export async function getWqiBatch(id: string) { return (await http.get<ApiResponse<PredictionBatch>>(`${path}/${id}`)).data.data; }
export async function getWqiBatchRows(id: string, page: number, errors: boolean) {
  const response = await http.get<ApiResponse<PredictionBatchRow[]>>(`${path}/${id}/rows`, { params: { page, limit: 20, filter: errors ? 'errors' : 'all' } });
  if (!response.data.meta) throw new Error('Không đọc được phân trang.');
  return { rows: response.data.data, meta: response.data.meta };
}
export async function listWqiBatches(page: number): Promise<{ rows: PredictionBatch[]; meta: PageMeta }> {
  const response = await http.get<ApiResponse<PredictionBatch[]>>(path, { params: { page, limit: 20 } });
  if (!response.data.meta) throw new Error('Không đọc được phân trang.');
  return { rows: response.data.data, meta: response.data.meta };
}
export async function getWqiBatchExcel(id: string) { return (await http.get<Blob>(`${path}/${id}/export`, { responseType: 'blob', timeout: 60000 })).data; }
export function batchFailure(error: unknown, fallback = 'Không thực hiện được thao tác. Vui lòng thử lại.') {
  const messages: Record<string, string> = {
    INVALID_WORKBOOK: 'File cần một sheet với đủ sáu cột PH, COD, DO, Amoni, Phosphat, Coliforms; tên cột dữ liệu không được trùng. Temp và BOD5 không bắt buộc.',
    EMPTY_WORKBOOK: 'File không có dòng dữ liệu.', FILE_REQUIRED: 'Hãy chọn file .xlsx.',
    FILE_TOO_LARGE: 'File tối đa 5 MB.', UPLOAD_ERROR: 'Hãy chọn một file .xlsx tối đa 5 MB.', ROW_LIMIT: 'File tối đa 10.000 dòng dữ liệu.',
    BATCH_ACTIVE: 'Bạn đang có một đợt chờ hoặc đang tính. Hãy chờ đợt đó kết thúc.',
    AI_MODEL_CHANGED: 'Model đã thay đổi. Hãy tải file để tạo đợt tính mới; kết quả đã lưu vẫn được giữ.',
    NO_VALID_ROWS: 'Không có dòng hợp lệ để tính.',
  };
  return error instanceof ApiError && messages[error.code] ? messages[error.code] : userErrorMessage(error, fallback);
}
