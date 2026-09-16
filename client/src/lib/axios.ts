import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1', timeout: 15000, withCredentials: true });
let csrfToken: string | null = null;
let pendingCsrf: Promise<string> | null = null;
export function setCsrfToken(value: string | null) { csrfToken = value; }
async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  pendingCsrf ??= api.get('/auth/csrf').then(response => {
    csrfToken = response.data.data.csrfToken;
    return csrfToken!;
  }).finally(() => { pendingCsrf = null; });
  return pendingCsrf;
}
api.interceptors.request.use(async config => {
  if (!['get', 'head', 'options'].includes(config.method || 'get')) config.headers.set('X-CSRF-Token', await getCsrfToken());
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (axios.isAxiosError(error) && error.response?.data?.error?.code === 'CSRF_REJECTED') csrfToken = null;
  return Promise.reject(error);
});
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error?.message) {
      const details = error.response.data.error.details;
      return `${error.response.data.error.message}${Array.isArray(details) ? ' ' + details.map((item: { field: string; message: string }) => `${item.field}: ${item.message}`).join('; ') : ''}`;
    }
    return error.code === 'ECONNABORTED' ? 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.' : 'Không thể kết nối hệ thống. Vui lòng kiểm tra máy chủ.';
  }
  return error instanceof Error ? error.message : 'Không thể thực hiện thao tác.';
}
export async function download(path: string, filename: string) {
  try {
    const response = await api.get(path, { responseType: 'blob', timeout: 60000 });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      const payload = JSON.parse(await error.response.data.text());
      throw new Error(payload.error?.message || 'Không thể xuất dữ liệu.');
    }
    throw error;
  }
}
