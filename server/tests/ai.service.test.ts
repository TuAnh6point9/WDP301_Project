import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as service from '../src/integrations/ai/ai.service.js';

const parameters = { ph: 7, do: 6, cod: 3, nh4: 0.1, po4: 0.1, coliform: 100 };
const unitBasis = 'training-source-unverified';
const result = { wqi: 91, qualityClass: 'Rất tốt', modelVersion: 'research-1', classificationVersion: 'VN_WQI_1460_2019', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 91 };
let server: Server;
let origin: string;
let status = 200;
let payload: unknown = result;
let delay = 0;
let rawPayload: string | undefined;
let calls: { method?: string; path?: string; body: unknown }[] = [];
let original: NodeJS.ProcessEnv;

beforeAll(async () => {
  original = { ...process.env };
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null });
    const responsePayload = payload;
    const responseStatus = status;
    const responseBody = rawPayload ?? JSON.stringify(responsePayload);
    setTimeout(() => { res.writeHead(responseStatus, { 'Content-Type': 'application/json' }); res.end(responseBody); }, delay);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/wqi_test_unused', SESSION_SECRET: 'test-only-secret-long-enough-32-chars', AI_MODE: 'http', AI_SERVICE_URL: `${origin}/predict`, AI_TIMEOUT_MS: '100', AI_API_KEY: '' });
  calls = []; status = 200; payload = result; delay = 0; rawPayload = undefined;
});
afterAll(async () => {
  process.env = original;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('AI HTTP gateway', () => {
  it('posts the six fields with their explicit unit basis once and validates output', async () => {
    expect(await service.predictWqi(parameters)).toEqual(result);
    expect(calls).toEqual([{ method: 'POST', path: '/predict', body: { parameters, unitBasis } }]);
  });
  it('respects the configured inference endpoint path instead of rewriting it', async () => {
    process.env.AI_SERVICE_URL = `${origin}/v2/wqi?model=current`;
    expect(await service.predictWqi(parameters)).toEqual(result);
    expect(calls[0].path).toBe('/v2/wqi?model=current');
  });
  it('supports a bare service origin with the local default prediction path', async () => {
    process.env.AI_SERVICE_URL = origin;
    expect(await service.predictWqi(parameters)).toEqual(result);
    expect(calls[0].path).toBe('/predict');
  });
  it('reports disabled as unconfigured without calling upstream', async () => {
    process.env.AI_MODE = 'disabled';
    await expect(service.predictWqi(parameters)).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' });
    expect(await service.getAiStatus()).toMatchObject({ available: false, configured: false, reason: 'AI_NOT_CONFIGURED' });
    expect(calls).toHaveLength(0);
  });
  it('checks live readiness and exposes only public metadata', async () => {
    payload = { ready: true, ...result, inputDomain: { ph: { min: 6, max: 9 }, do: { min: 0, max: 10 }, cod: { min: 0, max: 50 }, nh4: { min: 0, max: 2 }, po4: { min: 0, max: 2 }, coliform: { min: 0, max: 100000 } }, featureOrder: ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD'], privateUrl: 'secret' };
    const readiness = await service.getAiStatus();
    expect(readiness).toMatchObject({ available: true, configured: true, modelVersion: 'research-1', classificationVersion: 'VN_WQI_1460_2019', unitStatus: 'unverified', inputDomain: { ph: { min: 6, max: 9 } } });
    expect(readiness).not.toHaveProperty('privateUrl');
    expect(calls[0].path).toBe('/health');
  });
  it('marks a configured but unready service unavailable', async () => {
    status = 503; payload = { ready: false, modelVersion: null, classificationVersion: 'VN_WQI_1460_2019', unitStatus: null, inputDomain: null };
    expect(await service.getAiStatus()).toMatchObject({ available: false, configured: true });
  });
  it('accepts unknown train domain without borrowing old domain and rejects old model readiness', async () => {
    payload = { ready: true, ...result, inputDomain: null, featureOrder: ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD'] };
    expect(await service.getAiStatus()).toMatchObject({ available: true, algorithm: 'CatBoost' });
    payload = { ready: true, ...result, algorithm: 'HistGradientBoosting', inputDomain: null };
    expect((await service.getAiStatus()).available).toBe(false);
  });
  it.each(['{bad-json', 'x'.repeat(17000)])('rejects malformed or oversized upstream data', async value => {
    rawPayload = value;
    await expect(service.predictWqi(parameters)).rejects.toMatchObject({ status: 502, code: 'AI_INVALID_RESPONSE' });
    expect(calls).toHaveLength(1);
  });
  it('does not report a contradictory or incomplete health response as ready', async () => {
    payload = { ready: true, modelVersion: 'research-1', classificationVersion: 'legacy', unitStatus: 'assumed-for-research', inputDomain: null };
    expect(await service.getAiStatus()).toEqual({ available: false, configured: true, reason: 'AI_INVALID_RESPONSE' });
  });
  it('keeps readiness truthful when the health request times out', async () => {
    delay = 300;
    expect(await service.getAiStatus()).toEqual({ available: false, configured: true, reason: 'AI_TIMEOUT' });
  });
  it.each([{ ...result, qualityClass: 'Tốt' }, { ...result, wqi: 91.3 }, { ...result, classificationVersion: 'unknown' }, { wqi: 91 }])('rejects inconsistent or incomplete output without accepting a prediction', async value => {
    payload = value;
    await expect(service.predictWqi(parameters)).rejects.toMatchObject({ status: 502, code: 'AI_INVALID_RESPONSE' });
    expect(calls).toHaveLength(1);
  });
  it('preserves out of domain details as a client correction error', async () => {
    status = 422; payload = { error: { code: 'AI_INPUT_OUTSIDE_DOMAIN', message: 'outside', details: { do: { min: 0, max: 10, value: 585 } } } };
    await expect(service.predictWqi({ ...parameters, do: 585 })).rejects.toMatchObject({ status: 422, code: 'AI_INPUT_OUTSIDE_DOMAIN', details: { do: { min: 0, max: 10, value: 585 } } });
    expect(calls).toHaveLength(1);
  });
  it('times out once, without retrying the POST', async () => {
    delay = 300;
    await expect(service.predictWqi(parameters)).rejects.toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
    expect(calls).toHaveLength(1);
  });
});
