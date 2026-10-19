import { USER_MESSAGES as M } from '@wqi/contracts';
import { z } from 'zod';
import {
  predictionInputSchema, aiResultSchema, predictionInputDomainSchema,
  PREDICTION_UNIT_BASIS, PREDICTION_SCHEMA_VERSION, CATBOOST_FEATURE_ORDER,
  type PredictionParameters, type PredictionStatus,
  batchAiRowSchema, type BatchAiRow,
} from '@wqi/contracts';
import { getEnv } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';

const healthSchema = z.object({
  ready: z.boolean(), modelVersion: z.string().trim().min(1).max(100).nullable(),
  unitStatus: z.literal('unverified').nullable(),
  inputDomain: predictionInputDomainSchema.nullable(),
  predictionSchemaVersion: z.literal(PREDICTION_SCHEMA_VERSION), algorithm: z.literal('CatBoost'),
  featureOrder: z.tuple([z.literal(CATBOOST_FEATURE_ORDER[0]), z.literal(CATBOOST_FEATURE_ORDER[1]), z.literal(CATBOOST_FEATURE_ORDER[2]), z.literal(CATBOOST_FEATURE_ORDER[3]), z.literal(CATBOOST_FEATURE_ORDER[4]), z.literal(CATBOOST_FEATURE_ORDER[5])]),
  artifactSha256: z.string().regex(/^[a-f\d]{64}$/).nullable(),
  referenceBasis: z.literal('lecturer-provided').nullable(),
});
const domainErrorSchema = z.object({ error: z.object({
  code: z.literal('AI_INPUT_OUTSIDE_DOMAIN'),
  details: z.record(z.enum(['ph', 'do', 'cod', 'nh4', 'po4', 'coliform']), z.object({
    min: z.number().finite(), max: z.number().finite(), value: z.number().finite(),
  }).strict()).refine(details => Object.keys(details).length > 0),
}) });

const outOfRangeSchema = z.object({ error: z.object({ code: z.literal('AI_OUTPUT_OUT_OF_RANGE') }) });

async function readJson(response: Response, maxBytes = 16384): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
    }
    parts.push(part.value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID); }
}

export async function predictWqiBatch(rows: { rowNumber: number; parameters: PredictionParameters }[], expected: { artifactSha256: string; modelVersion: string }): Promise<BatchAiRow[]> {
  const env = getEnv();
  if (env.AI_MODE === 'disabled') throw new AppError(503, 'AI_NOT_CONFIGURED', M.AI_UNAVAILABLE);
  if (!rows.length || rows.length > 100) throw new AppError(400, 'INVALID_BATCH', M.INVALID_DATA);
  rows.forEach(row => predictionInputSchema.parse({ parameters: row.parameters, unitBasis: PREDICTION_UNIT_BASIS }));
  try {
    const endpoint = new URL(env.AI_SERVICE_URL);
    endpoint.pathname = `${endpoint.pathname === '/' ? '/predict' : endpoint.pathname.replace(/\/$/, '')}/batch`;
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      headers: upstreamHeaders(env.AI_API_KEY), body: JSON.stringify({ rows, unitBasis: PREDICTION_UNIT_BASIS, expectedArtifactSha256: expected.artifactSha256, expectedModelVersion: expected.modelVersion }) });
    if (response.status === 409) throw new AppError(409, 'AI_MODEL_CHANGED', 'Model đã thay đổi. Hãy tạo đợt tính mới.');
    if (response.status === 503) throw new AppError(503, 'AI_MODEL_NOT_READY', M.AI_UNAVAILABLE);
    if (!response.ok) throw new AppError(502, 'AI_UPSTREAM_ERROR', M.AI_UNAVAILABLE);
    const payload = z.object({ rows: z.array(batchAiRowSchema).max(100) }).strict().safeParse(await readJson(response, 128 * 1024));
    if (!payload.success || payload.data.rows.length !== rows.length) throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
    const numbers = new Set(rows.map(row => row.rowNumber));
    for (const row of payload.data.rows) {
      if (!numbers.delete(row.rowNumber)) throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
      if ('result' in row && (row.result.artifactSha256 !== expected.artifactSha256 || row.result.modelVersion !== expected.modelVersion)) throw new AppError(409, 'AI_MODEL_CHANGED', M.AI_INVALID);
    }
    return payload.data.rows;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AppError(504, 'AI_TIMEOUT', M.TIMEOUT);
    throw new AppError(502, 'AI_UNAVAILABLE', M.AI_UNAVAILABLE);
  }
}

function upstreamHeaders(apiKey: string) {
  return { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
}

export async function getAiStatus(): Promise<PredictionStatus> {
  const env = getEnv();
  if (env.AI_MODE === 'disabled') return { available: false, configured: false, reason: 'AI_NOT_CONFIGURED' };
  try {
    const response = await fetch(new URL('/health', env.AI_SERVICE_URL), {
      redirect: 'error', signal: AbortSignal.timeout(env.AI_TIMEOUT_MS), headers: upstreamHeaders(env.AI_API_KEY),
    });
    if (!response.ok) return { available: false, configured: true, reason: 'AI_MODEL_NOT_READY' };
    const health = healthSchema.safeParse(await readJson(response));
    if (!health.success) return { available: false, configured: true, reason: 'AI_INVALID_RESPONSE' };
    const data = health.data;
    if (!data.ready) return { available: false, configured: true, reason: 'AI_MODEL_NOT_READY' };
    if (!data.modelVersion || !data.unitStatus || !data.artifactSha256 || !data.referenceBasis) return { available: false, configured: true, reason: 'AI_INVALID_RESPONSE' };
    return {
      available: true, configured: true, modelVersion: data.modelVersion, unitStatus: data.unitStatus,
      ...(data.inputDomain ? { inputDomain: data.inputDomain } : {}),
      predictionSchemaVersion: data.predictionSchemaVersion, algorithm: data.algorithm,
      artifactSha256: data.artifactSha256, referenceBasis: data.referenceBasis,
    };
  } catch (error) {
    const reason = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'AI_TIMEOUT' : error instanceof AppError ? error.code : 'AI_UNAVAILABLE';
    return { available: false, configured: true, reason };
  }
}

export async function predictWqi(parameters: PredictionParameters, unitBasis = PREDICTION_UNIT_BASIS) {
  const env = getEnv();
  if (env.AI_MODE === 'disabled') throw new AppError(503, 'AI_NOT_CONFIGURED', M.AI_UNAVAILABLE);
  const input = predictionInputSchema.parse({ parameters, unitBasis });
  try {
    const endpoint = new URL(env.AI_SERVICE_URL);
    if (endpoint.pathname === '/') endpoint.pathname = '/predict';
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      headers: upstreamHeaders(env.AI_API_KEY), body: JSON.stringify(input),
    });
    if (response.status === 422) {
      const error = domainErrorSchema.safeParse(await readJson(response));
      if (error.success) throw new AppError(422, 'AI_INPUT_OUTSIDE_DOMAIN', M.AI_DOMAIN, error.data.error.details);
      throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
    }
    if (response.status === 503) throw new AppError(503, 'AI_MODEL_NOT_READY', M.AI_UNAVAILABLE);
    if (response.status === 500 && outOfRangeSchema.safeParse(await readJson(response).catch(() => null)).success) {
      throw new AppError(422, 'AI_OUTPUT_OUT_OF_RANGE', M.AI_OUT_OF_RANGE);
    }
    if (!response.ok) throw new AppError(502, 'AI_UPSTREAM_ERROR', M.AI_UNAVAILABLE);
    const result = aiResultSchema.safeParse(await readJson(response));
    if (!result.success) throw new AppError(502, 'AI_INVALID_RESPONSE', M.AI_INVALID);
    return result.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new AppError(504, 'AI_TIMEOUT', M.TIMEOUT);
    throw new AppError(502, 'AI_UNAVAILABLE', M.AI_UNAVAILABLE);
  }
}
