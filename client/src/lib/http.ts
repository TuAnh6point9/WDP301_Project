import axios from 'axios';
import { apiErrorMessage } from '@wqi/contracts';

// Shared HTTP client for the backend API. Feature api.ts files switch to it once the matching
// endpoint exists; until then they return empty data or reject with a "not available" error.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  withCredentials: true,
  timeout: 15000,
});

export type ApiErrorDetails = { field: string; message: string }[] | Record<string, { min: number; max: number; value: number }>;
/** Backend validation issues are an array; model-domain issues are keyed by parameter. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: ApiErrorDetails, public requestId?: string) { super(message); }
}

let csrf: string | null = null;
let csrfRequest: Promise<string> | null = null;
let sessionVersion = 0;
const requestVersions = new WeakMap<object, number>();
const sessionListeners = new Set<() => void>();
export function setCsrfToken(token: string | null) { if (csrf !== token) sessionVersion++; csrf = token; }
export function onSessionExpired(listener: () => void) { sessionListeners.add(listener); return () => { sessionListeners.delete(listener); }; }
export async function ensureCsrfToken(): Promise<string> {
  if (csrf) return csrf;
  csrfRequest ??= http.get<{ data: { csrfToken: string } }>('/auth/csrf').then(response => {
    csrf = response.data.data.csrfToken;
    return csrf;
  }).finally(() => { csrfRequest = null; });
  return csrfRequest;
}
http.interceptors.request.use(async config => {
  if (!['get', 'head', 'options'].includes(config.method?.toLowerCase() ?? 'get')) config.headers.set('X-CSRF-Token', await ensureCsrfToken());
  requestVersions.set(config, sessionVersion);
  return config;
});

http.interceptors.response.use(undefined, error => {
  if (error instanceof ApiError) return Promise.reject(error);
  const body = error.response?.data?.error;
  const currentSession = error.config && requestVersions.get(error.config) === sessionVersion;
  // /me belongs to the provider's restore generation; an old response cannot end a newer login.
  if (body?.code === 'UNAUTHENTICATED' && error.config?.url !== '/auth/me' && currentSession) { setCsrfToken(null); sessionListeners.forEach(listener => listener()); }
  if (body?.code === 'CSRF_REJECTED' && currentSession) setCsrfToken(null);
  const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
  const status = error.response?.status ?? 0;
  const code = body?.code ?? (timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR');
  return Promise.reject(new ApiError(status, code, apiErrorMessage(status, body?.code ?? (status ? undefined : code)), body?.details, body?.requestId));
});
