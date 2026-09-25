// WQI calculation through the AI service and the user's calculation history (UC06–UC08).
// Backend endpoints (docs/openapi.yaml): POST /predictions, GET /predictions, GET /predictions/:id.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { Calculation, Inputs } from './types';

export async function calculateWqi(_inputs: Inputs): Promise<Calculation> {
  throw new Error('The AI Service is not connected yet.');
}

/** Newest first. */
export async function listCalculations(): Promise<Calculation[]> {
  return [];
}

/** The calculation with this id, or the latest one when no id is given; null when none exists. */
export async function getCalculation(_id: string | null): Promise<Calculation | null> {
  return null;
}

/** Whether the backend can reach the AI Service (GET /predictions/status). */
export async function getAiStatus(): Promise<{ available: boolean }> {
  return { available: false };
}
