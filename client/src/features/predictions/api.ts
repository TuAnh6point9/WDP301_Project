import { USER_MESSAGES as M } from '@wqi/contracts';
import { PREDICTION_UNIT_BASIS, predictionInputSchema, type ApiResponse, type PageMeta, type Prediction, type PredictionStatus } from '@wqi/contracts';
import { ApiError, http } from '@/lib/http';
import type { Calculation, Inputs } from './types';

function calculation({ _id, createdAt, parameters, ...result }: Prediction): Calculation {
  return { ...result, id: _id, at: createdAt, inputs: parameters };
}

export async function calculateWqi(inputs: Inputs): Promise<Calculation> {
  const body = predictionInputSchema.parse({ parameters: inputs, unitBasis: PREDICTION_UNIT_BASIS });
  const response = await http.post<ApiResponse<Prediction>>('/predictions', body);
  return calculation(response.data.data);
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
