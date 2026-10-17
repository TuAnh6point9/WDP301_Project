import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { recordRouter } from '../src/modules/water-records/water-record.routes.js';
import { WaterRecord } from '../src/modules/water-records/water-record.model.js';
import { Station } from '../src/modules/stations/station.model.js';
import { errorHandler } from '../src/middleware/error-handler.js';

// A separate mongod process and database, never the user's local database.
const installedMongod = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const parameters = { ph: 7.14, do: 5.2, cod: 25.2, nh4: 0.44, po4: 0.1, coliform: 910 };
const body = { measuredAt: '2026-09-05T00:00:00Z', parameters, unitBasis: 'training-source-unverified' };
const result = { wqi: 75, rawWqi: 74.7, qualityClass: 'Trung bình', modelVersion: 'callisto 2.0', classificationVersion: 'VN_WQI_1460_2019', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'c'.repeat(64) };
const admin = '111111111111111111111111';
const user = '222222222222222222222222';
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const userId = req.headers['x-test-user'];
  if (typeof userId === 'string') res.locals.user = { _id: userId, name: 'Test user', email: 'fixture@example.test', role: userId === admin ? 'admin' : 'user', isActive: true };
  res.locals.requestId = 'test-request';
  next();
});
app.use(recordRouter);
app.use(errorHandler);
let db: MongoMemoryServer;
let upstream: Server;
let payload: unknown = result;
let upstreamStatus = 200;
let received: unknown[] = [];
let original: NodeJS.ProcessEnv;
let stationId: string;

const create = (data: unknown = body) => request(app).post(`/stations/${stationId}/water-records`).set('x-test-user', admin).send(data);

beforeAll(async () => {
  original = { ...process.env };
  if (existsSync(installedMongod)) process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'water_record_test_only' }, binary: existsSync(installedMongod) ? { systemBinary: installedMongod } : undefined });
  await mongoose.connect(db.getUri(), { dbName: 'water_record_test_only' });
  await WaterRecord.createIndexes();
  upstream = createServer((req, res) => {
    let text = '';
    req.on('data', chunk => { text += chunk; });
    req.on('end', () => {
      received.push(JSON.parse(text));
      res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'test-only-secret-long-enough-32-chars', AI_MODE: 'http', AI_SERVICE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/predict`, AI_TIMEOUT_MS: '1000', AI_API_KEY: '' });
});
beforeEach(async () => {
  await Promise.all([WaterRecord.deleteMany({}), Station.deleteMany({})]);
  stationId = (await Station.create({ code: 'AH1', name: 'Điểm lấy mẫu AH1', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.491, 20.936] } })).id;
  payload = result; upstreamStatus = 200; received = [];
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
  if (upstream) {
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
  }
  process.env = original;
});

describe('water record routes with isolated MongoDB', () => {
  it('stores the six measurements with the WQI computed by the model', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(received).toEqual([{ parameters, unitBasis: 'training-source-unverified' }]);
    expect(response.body.data).toMatchObject({ parameters, wqi: 75, qualityClass: 'Trung bình', validationStatus: 'pending', version: 1, source: { kind: 'manual' } });
    expect(response.body.data.wqiSource).toBe(`CatBoost callisto 2.0 · ${'c'.repeat(12)}`);
    expect(response.body.data.stationId).toMatchObject({ _id: stationId, code: 'AH1' });
  });
  it('keeps the measurements with a null WQI when the AI service cannot answer', async () => {
    upstreamStatus = 503;
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ parameters, wqi: null, qualityClass: null, wqiSource: null });
  });
  it.each([
    ['legacy BOD5/TSS measurements', { ...body, parameters: { ph: 7, do: 5, bod5: 2, cod: 3, tss: 4, nh4: 0.1 } }],
    ['a missing measurement', { ...body, parameters: { ...parameters, po4: undefined } }],
    ['the legacy unit basis', { ...body, unitBasis: 'mg/L; NH4+ as ion' }],
  ])('rejects %s before inference', async (_name, data) => {
    expect((await create(data)).status).toBe(400);
    expect(received).toEqual([]);
    expect(await WaterRecord.countDocuments()).toBe(0);
  });
  it('lets only admins write records', async () => {
    expect((await request(app).post(`/stations/${stationId}/water-records`).send(body)).status).toBe(401);
    expect((await request(app).post(`/stations/${stationId}/water-records`).set('x-test-user', user).send(body)).status).toBe(403);
    expect(await WaterRecord.countDocuments()).toBe(0);
  });
  it('shows guests verified records only, without internal fields', async () => {
    const created = (await create()).body.data;
    expect((await request(app).get('/water-records')).body.meta.total).toBe(0);
    expect((await request(app).get('/water-records').set('x-test-user', admin)).body.meta.total).toBe(1);
    const review = await request(app).patch(`/water-records/${created._id}/validation`).set('x-test-user', admin).send({ status: 'verified', note: 'Checked against the lab sheet.', version: 1 });
    expect(review.status).toBe(200);
    expect(review.body.data.stationId.code).toBe('AH1');
    const guest = await request(app).get('/water-records');
    expect(guest.body.data).toHaveLength(1);
    expect(guest.body.data[0]).toMatchObject({ parameters, wqi: 75, validationStatus: 'verified', stationId: { code: 'AH1' } });
    expect(guest.body.data[0]).not.toHaveProperty('source');
    expect(guest.body.data[0]).not.toHaveProperty('createdBy');
  });
  it('recomputes the WQI on edit and returns the record to review', async () => {
    const created = (await create()).body.data;
    await request(app).patch(`/water-records/${created._id}/validation`).set('x-test-user', admin).send({ status: 'verified', note: 'Checked.', version: 1 });
    payload = { ...result, wqi: 90, rawWqi: 90.2, qualityClass: 'Tốt' };
    const edited = { ...body, parameters: { ...parameters, cod: 6.2 } };
    const response = await request(app).patch(`/water-records/${created._id}`).set('x-test-user', admin).send({ ...edited, version: 2 });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ parameters: edited.parameters, wqi: 90, qualityClass: 'Tốt', validationStatus: 'pending', version: 3, reviewNote: null });
    expect((await request(app).patch(`/water-records/${created._id}`).set('x-test-user', admin).send({ ...edited, version: 2 })).status).toBe(409);
  });
  it('recalculates missing WQI values and skips records the model cannot read', async () => {
    upstreamStatus = 503;
    const created = (await create()).body.data;
    const legacy = await WaterRecord.collection.insertOne({ stationId: new mongoose.Types.ObjectId(stationId), measuredAt: new Date('2026-01-05T00:00:00Z'), parameters: { ph: 7, do: 5, bod5: 2, cod: 3, tss: 4, nh4: 0.1 }, unitBasis: 'mg/L; NH4+ as ion', wqi: null, version: 1, validationStatus: 'verified', source: { kind: 'manual' }, createdBy: new mongoose.Types.ObjectId(admin) });
    upstreamStatus = 200;
    const response = await request(app).post('/water-records/recalculate').set('x-test-user', admin).send({ ids: [created._id, legacy.insertedId.toString()] });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updated: 1, skipped: 1 });
    expect(await WaterRecord.findById(created._id).lean()).toMatchObject({ wqi: 75, qualityClass: 'Trung bình', version: 1 });
    expect((await request(app).post('/water-records/recalculate').set('x-test-user', admin).send({ ids: ['333333333333333333333333'] })).status).toBe(404);
    expect((await request(app).post('/water-records/recalculate').set('x-test-user', user).send({ ids: [created._id] })).status).toBe(403);
  });
});
