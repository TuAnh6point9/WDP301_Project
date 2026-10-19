import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { predictionRouter } from '../src/modules/predictions/prediction.routes.js';
import { Prediction } from '../src/modules/predictions/prediction.model.js';
import { errorHandler } from '../src/middleware/error-handler.js';

// A separate mongod process and database, never the user's local database.
const installedMongod = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const body = { parameters: { ph: 7, do: 6, cod: 3, nh4: 0.1, po4: 0.1, coliform: 100 }, unitBasis: 'training-source-unverified' };
const result = { wqi: 91, qualityClass: 'Rất tốt', modelVersion: 'research-1', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 91 };
const owner = '111111111111111111111111';
const other = '222222222222222222222222';
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const userId = req.headers['x-test-user'];
  if (typeof userId === 'string') res.locals.user = { _id: userId, name: 'Test user', email: 'fixture@example.test', role: userId === other ? 'admin' : 'user', isActive: true };
  res.locals.requestId = 'test-request';
  next();
});
app.use('/predictions', predictionRouter);
app.use(errorHandler);
let db: MongoMemoryServer;
let upstream: Server;
let payload: unknown = result;
let upstreamStatus = 200;
let original: NodeJS.ProcessEnv;

beforeAll(async () => {
  original = { ...process.env };
  if (existsSync(installedMongod)) process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'prediction_test_only' }, binary: existsSync(installedMongod) ? { systemBinary: installedMongod } : undefined });
  await mongoose.connect(db.getUri(), { dbName: 'prediction_test_only' });
  upstream = createServer((_req, res) => { res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'test-only-secret-long-enough-32-chars', AI_MODE: 'http', AI_SERVICE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/predict`, AI_TIMEOUT_MS: '1000', AI_API_KEY: '' });
});
beforeEach(async () => { await Prediction.deleteMany({}); payload = result; upstreamStatus = 200; process.env.AI_MODE = 'http'; });
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
  if (upstream) {
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
  }
  process.env = original;
});

describe('prediction routes with isolated MongoDB', () => {
  it('requires authentication for creation and private history', async () => {
    expect((await request(app).post('/predictions').send(body)).status).toBe(401);
    expect((await request(app).get('/predictions')).status).toBe(401);
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('persists a six measurement snapshot and provenance only after successful inference', async () => {
    const response = await request(app).post('/predictions').set('x-test-user', owner).send(body);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ ...body, ...result, userId: owner });
    expect(response.body.data._id).toMatch(/^[a-f\d]{24}$/);
    expect(response.body.data.createdAt).toBeTruthy();
    const stored = await Prediction.findById(response.body.data._id).lean();
    expect(stored).toMatchObject({ ...body, ...result });
    expect((await mongoose.connection.db!.listCollections().toArray()).map(item => item.name)).not.toContain('waterrecords');
  });
  it('reports a WQI outside 0–100 and discards it without saving', async () => {
    payload = { error: { code: 'AI_OUTPUT_OUT_OF_RANGE', message: 'Model returned WQI outside 0..100; the result was discarded.' } }; upstreamStatus = 500;
    const response = await request(app).post('/predictions').set('x-test-user', owner).send(body);
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: 'AI_OUTPUT_OUT_OF_RANGE', message: 'Model trả về WQI ngoài khoảng 0–100 nên kết quả đã bị loại bỏ và không được lưu.' });
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('returns public disabled readiness and never stores disabled inference', async () => {
    process.env.AI_MODE = 'disabled';
    const status = await request(app).get('/predictions/status');
    expect(status.status).toBe(200);
    expect(status.body.data).toEqual({ available: false, configured: false, reason: 'AI_NOT_CONFIGURED' });
    const response = await request(app).post('/predictions').set('x-test-user', owner).send(body);
    expect(response.status).toBe(503);
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('rejects missing numeric values and owner spoofing before inference', async () => {
    const invalid = await request(app).post('/predictions').set('x-test-user', owner).send({ ...body, parameters: { ...body.parameters, do: '' } });
    expect(invalid.status).toBe(400);
    const spoof = await request(app).post('/predictions').set('x-test-user', owner).send({ ...body, userId: other });
    expect(spoof.status).toBe(400);
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('enforces owner access even for an administrator and preserves pagination', async () => {
    const created = await request(app).post('/predictions').set('x-test-user', owner).send(body);
    expect(created.status).toBe(201);
    const own = await request(app).get('/predictions?page=1&limit=1').set('x-test-user', owner);
    expect(own.body.meta).toEqual({ page: 1, limit: 1, total: 1, pages: 1 });
    expect(own.body.data[0]._id).toBe(created.body.data._id);
    const detail = await request(app).get(`/predictions/${created.body.data._id}`).set('x-test-user', owner);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject(result);
    const denied = await request(app).get(`/predictions/${created.body.data._id}`).set('x-test-user', other);
    expect(denied.status).toBe(404);
    expect((await request(app).get('/predictions').set('x-test-user', other)).body.data).toEqual([]);
  });
  it.each([
    [502, { ...result, qualityClass: 'Tốt' }, 200],
    [502, { error: { code: 'FAILED' } }, 500],
    [422, { error: { code: 'AI_INPUT_OUTSIDE_DOMAIN', details: { do: { value: 585, min: 0, max: 10 } } } }, 422],
  ])('does not save upstream failure mapped to %s', async (expectedStatus, upstreamPayload, status) => {
    payload = upstreamPayload; upstreamStatus = status as number;
    const response = await request(app).post('/predictions').set('x-test-user', owner).send(body);
    expect(response.status).toBe(expectedStatus);
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('reads legacy prediction snapshots unchanged without applying the new input schema', async () => {
    await Prediction.collection.insertOne({ userId: new mongoose.Types.ObjectId(owner), parameters: { ph: 7, do: 6, bod5: 3, cod: 5, tss: 10, nh4: 0.1 }, unitBasis: 'mg/L; NH4+ as ion', wqi: 91, qualityClass: 'Tốt', modelVersion: 'old', classificationVersion: 'old', createdAt: new Date() });
    const response = await request(app).get('/predictions').set('x-test-user', owner);
    expect(response.body.data[0]).toMatchObject({ parameters: { ph: 7, do: 6, bod5: 3, cod: 5, tss: 10, nh4: 0.1 }, modelVersion: 'old', unitBasis: 'mg/L; NH4+ as ion', qualityClass: 'Tốt' });
    expect(response.body.data[0].parameters).not.toHaveProperty('temp');
    expect(response.body.data[0]).not.toHaveProperty('classificationVersion');
    const detail = await request(app).get(`/predictions/${response.body.data[0]._id}`).set('x-test-user', owner);
    expect(detail.body.data).toMatchObject({ modelVersion: 'old' });
    expect(detail.body.data).not.toHaveProperty('classificationVersion');
    expect(response.body.meta.total).toBe(1);
    expect(await Prediction.countDocuments()).toBe(1);
  });
});
