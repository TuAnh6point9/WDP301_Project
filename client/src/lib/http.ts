import axios from 'axios';

// Shared HTTP client for the backend API. Feature api.ts files switch to it once the matching
// endpoint exists; until then they return empty data or reject with a "not available" error.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000,
});

/** Error shape the backend returns: { error: { code, message } }. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

http.interceptors.response.use(undefined, error => {
  const body = error.response?.data?.error;
  return Promise.reject(new ApiError(error.response?.status ?? 0, body?.code ?? 'NETWORK_ERROR', body?.message ?? 'Cannot reach the server. Please try again.'));
});
