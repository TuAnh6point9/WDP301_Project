import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AxiosError, type AxiosAdapter } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { calculateWqi, getCalculation, listCalculations, getAiStatus } from './api';

const originalAdapter = http.defaults.adapter;
const parameters = { ph: 7, do: 6, cod: 4, nh4: 0.1, po4: 0.2, coliform: 500 };
const prediction = { _id: '123456789012345678901234', parameters, unitBasis: 'training-source-unverified', wqi: 86, qualityClass: 'Tốt', modelVersion: 'research-1', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 86, createdAt: '2026-10-08T03:00:00Z' };
function respond(data: unknown): AxiosAdapter {
  return async config => ({ data, status: 200, statusText: 'OK', headers: {}, config });
}
beforeEach(() => { setCsrfToken('a'.repeat(64)); });
afterEach(() => { http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('prediction API integration', () => {
  it('keeps the backend classification and provenance in a result', async () => {
    http.defaults.adapter = respond({ data: prediction });
    const result = await getCalculation(prediction._id);
    expect(result).toMatchObject({ id: prediction._id, at: prediction.createdAt, inputs: parameters, qualityClass: 'Tốt', modelVersion: 'research-1', unitStatus: 'unverified' });
    expect(result).not.toHaveProperty('station');
  });

  it('uses a paginated list to resolve the latest calculation', async () => {
    let query: unknown;
    http.defaults.adapter = async config => { query = config.params; return { data: { data: [prediction], meta: { page: 1, limit: 1, total: 12, pages: 12 } }, status: 200, statusText: 'OK', headers: {}, config }; };
    expect((await getCalculation(null))?.id).toBe(prediction._id);
    expect(query).toEqual({ page: 1, limit: 1 });
  });

  it('returns real history rows rather than an empty stub', async () => {
    http.defaults.adapter = respond({ data: [prediction], meta: { page: 1, limit: 20, total: 1, pages: 1 } });
    expect(await listCalculations()).toMatchObject([{ id: prediction._id, inputs: parameters }]);
  });

  it('sends the six prediction fields with explicit units without inventing TSS', async () => {
    let sent: unknown;
    http.defaults.adapter = async config => { sent = JSON.parse(config.data); return { data: { data: prediction }, status: 201, statusText: 'Created', headers: {}, config }; };
    expect((await calculateWqi(parameters)).id).toBe(prediction._id);
    expect(sent).toEqual({ parameters, unitBasis: 'training-source-unverified' });
  });

  it('shows configuration failure as unavailable and keeps the reason', async () => {
    http.defaults.adapter = respond({ data: { available: false, configured: true, reason: 'MODEL_NOT_READY' } });
    expect(await getAiStatus()).toEqual({ available: false, configured: true, reason: 'MODEL_NOT_READY' });
  });

  it('propagates field errors without retrying a failed prediction', async () => {
    let requests = 0;
    http.defaults.adapter = async config => { requests++; throw new AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'OUT_OF_DOMAIN', message: 'Outside model domain', details: [{ field: 'parameters.nh4', message: 'Too high' }], requestId: 'request-1' } }, status: 400, statusText: 'Bad Request', headers: {}, config }); };
    await expect(calculateWqi(parameters)).rejects.toMatchObject({ code: 'OUT_OF_DOMAIN', details: [{ field: 'parameters.nh4', message: 'Too high' }], requestId: 'request-1' });
    expect(requests).toBe(1);
  });
});
