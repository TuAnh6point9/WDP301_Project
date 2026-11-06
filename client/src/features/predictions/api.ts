import { USER_MESSAGES as M } from '@wqi/contracts';
import { PREDICTION_UNIT_BASIS, predictionInputSchema, type ApiResponse, type PageMeta, type Prediction, type PredictionStatus } from '@wqi/contracts';
import { ApiError, http } from '@/lib/http';
import type { Calculation, Inputs, PreviewCalculation } from './types';

function calculation({ _id, createdAt, parameters, ...result }: Prediction): Calculation {
  return { ...result, id: _id, at: createdAt, inputs: parameters };
}

export async function calculateWqi(inputs: Inputs): Promise<Calculation> {
  const body = predictionInputSchema.parse({ parameters: inputs, unitBasis: PREDICTION_UNIT_BASIS });
  const response = await http.post<ApiResponse<Prediction>>('/predictions', body);
  return calculation(response.data.data);
}

/** Calculates without saving (allowed for visitors); signing in and saving recalculates on the server. */
export async function previewWqi(inputs: Inputs): Promise<PreviewCalculation> {
  const body = predictionInputSchema.parse({ parameters: inputs, unitBasis: PREDICTION_UNIT_BASIS });
  const { createdAt, parameters, ...result } = (await http.post<ApiResponse<Omit<Prediction, '_id'>>>('/predictions/preview', body)).data.data;
  return { ...result, at: createdAt, inputs: parameters };
}

// The unsaved result survives the trip to the login page in this tab only.
const PREVIEW_KEY = 'wqi.preview';
export function rememberPreview(calc: PreviewCalculation) {
  try { sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(calc)); } catch { /* Storage blocked: the result still shows until the visitor leaves. */ }
}
export function readPreview(): PreviewCalculation | null {
  try {
    const calc = JSON.parse(sessionStorage.getItem(PREVIEW_KEY) ?? 'null') as PreviewCalculation | null;
    return calc && typeof calc.wqi === 'number' && calc.inputs && typeof calc.inputs === 'object' ? calc : null;
  } catch { return null; }
}
export function forgetPreview() {
  try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* Nothing was stored. */ }
}

/** The server builds the Vietnamese .xlsx of one history page (the report asks for page 1 of 20). */
export async function getCalculationExcel(page: number, limit: number): Promise<Blob> {
  return (await http.get<Blob>('/predictions/export', { params: { page, limit }, responseType: 'blob', timeout: 60000 })).data;
}

export async function listCalculationPage(page = 1, limit = 6): Promise<{ data: Calculation[]; meta: PageMeta }> {
  const response = await http.get<ApiResponse<Prediction[]>>('/predictions', { params: { page, limit } });
  if (!response.data.meta) throw new Error(M.HISTORY_FAILED);
  return { data: response.data.data.map(calculation), meta: response.data.meta };
}

/** Latest 20 results for the limited report preview; history uses listCalculationPage. */
export async function listCalculations(): Promise<Calculation[]> {
  return (await listCalculationPage(1, 20)).data;
}

/** The calculation with this id, or the latest one when no id is given; null when none exists. */
export async function getCalculation(id: string | null): Promise<Calculation | null> {
  if (id === null) return (await listCalculationPage(1, 1)).data[0] ?? null;
  try {
    const response = await http.get<ApiResponse<Prediction>>(`/predictions/${encodeURIComponent(id)}`);
    return calculation(response.data.data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Whether the backend can reach the AI Service (GET /predictions/status). */
export async function getAiStatus(): Promise<PredictionStatus> {
  return (await http.get<ApiResponse<PredictionStatus>>('/predictions/status')).data.data;
}

// A free host sleeps after a quiet period and takes about a minute to answer again.
const WAKING_REASONS = new Set(['AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_MODEL_NOT_READY']);
/** True while the AI, or the gateway in front of the API, has not answered yet: check again rather than report a fault. */
export function aiWaking(status?: PredictionStatus, error?: Error | null): boolean {
  if (error) return error instanceof ApiError && (error.code === 'REQUEST_TIMEOUT' || error.status >= 502);
  return Boolean(status?.configured && !status.available && WAKING_REASONS.has(status.reason ?? ''));
}
