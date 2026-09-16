import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { rawColumns } from '@wqi/contracts';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Station } from '../src/modules/stations/station.model.js';
import { WaterRecord } from '../src/modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../src/modules/imports/import.model.js';
import { Prediction } from '../src/modules/predictions/prediction.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { commitWorkbook, parseWorkbook } from '../src/modules/imports/import.service.js';

const origin = 'http://localhost:5173';
const password = 'Isolated-test-password-2026';
const parameters = { ph: 7, do: 0, bod5: 0, cod: 0, tss: 0, nh4: 0 };
const recordInput = { measuredAt: '2026-05-01T00:00:00+07:00', parameters, unitBasis: 'mg/L; NH4+ as ion' };
const stationInput = { code: 'test_01', name: 'Isolated test station', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.5, 20.9] } };
let mongo: MongoMemoryServer;
let app: ReturnType<typeof createApp>;
let admin: ReturnType<typeof request.agent>;
let user: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;
let adminToken: string;
let userToken: string;
let adminId: string;
let userId: string;
function binaryResponse(response: IncomingMessage, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', callback);
}

async function workbookBuffer(values: unknown[][] = [[7, 25, 2, 3, 6, 0.2, 0.1, 40]]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  sheet.addRow([...rawColumns]);
  values.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function login(agent: ReturnType<typeof request.agent>, email: string) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  const result = await agent.post('/api/v1/auth/login').set('Origin', origin).set('X-CSRF-Token', csrf.body.data.csrfToken).send({ email, password }).expect(200);
  return result.body.data.csrfToken as string;
}
function writeAdmin(method: 'post' | 'patch' | 'delete', path: string) {
  return admin[method](`/api/v1${path}`).set('Origin', origin).set('X-CSRF-Token', adminToken);
}
async function station() {
  const result = await writeAdmin('post', '/stations').send(stationInput).expect(201);
  return result.body.data._id as string;
}
async function record(stationId: string, input = recordInput) {
  const result = await writeAdmin('post', `/stations/${stationId}/water-records`).send(input).expect(201);
  return result.body.data;
}

beforeAll(async () => {
  const localBinary = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  const systemBinary = process.env.MONGOMS_SYSTEM_BINARY || await access(localBinary).then(() => localBinary, () => undefined);
  mongo = await MongoMemoryServer.create({
    binary: systemBinary ? { systemBinary, checkMD5: false } : undefined,
    instance: { dbName: 'wqi_test_isolated' },
  });
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('MONGODB_URI', mongo.getUri());
  vi.stubEnv('SESSION_SECRET', 'isolated-test-session-secret-more-than-32-characters');
  vi.stubEnv('CLIENT_ORIGIN', origin);
  vi.stubEnv('AI_MODE', 'disabled');
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  await Promise.all([User, Station, WaterRecord, ImportBatch, ImportedRow, Prediction].map(model => model.createIndexes()));
  const passwordHash = await hashPassword(password);
  const accounts = await User.create([
    { name: 'Test Admin', email: 'admin@tests.invalid', role: 'admin', passwordHash },
    { name: 'Test User', email: 'user@tests.invalid', role: 'user', passwordHash },
    { name: 'Test Outsider', email: 'outsider@tests.invalid', role: 'user', passwordHash },
  ]);
  adminId = accounts[0].id;
  userId = accounts[1].id;
  app = createApp();
  admin = request.agent(app);
  user = request.agent(app);
  outsider = request.agent(app);
  adminToken = await login(admin, 'admin@tests.invalid');
  userToken = await login(user, 'user@tests.invalid');
  await login(outsider, 'outsider@tests.invalid');
});
beforeEach(async () => {
  await Promise.all([Station, WaterRecord, ImportBatch, ImportedRow, Prediction].map(model => model.deleteMany({})));
  await User.updateMany({}, { $set: { isActive: true } });
  process.env.AI_MODE = 'disabled';
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (app) await app.locals.sessionStore.close();
  await mongoose.disconnect();
  await mongo?.stop();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('session security and access control', () => {
  it('starts with no stations, measurements, predictions, or automatic business data', async () => {
    expect((await request(app).get('/api/v1/stations').expect(200)).body.data).toEqual([]);
    expect((await request(app).get('/api/v1/water-records').expect(200)).body.data).toEqual([]);
    expect((await user.get('/api/v1/predictions').expect(200)).body.data).toEqual([]);
    await request(app).get('/api/v1/health/ready').expect(200);
  });
  it('rejects missing, wrong-origin, and non-ASCII CSRF tokens with 403', async () => {
    await admin.post('/api/v1/stations').set('Origin', origin).send(stationInput).expect(403);
    await admin.post('/api/v1/stations').set('Origin', 'https://untrusted.invalid').set('X-CSRF-Token', adminToken).send(stationInput).expect(403);
    const result = await admin.post('/api/v1/stations').set('Origin', origin).set('X-CSRF-Token', 'é'.repeat(64)).send(stationInput).expect(403);
    expect(result.body.error.code).toBe('CSRF_REJECTED');
    expect(result.body.error.requestId).toBe(result.headers['x-request-id']);
  });
  it('requires admin for mutations, raw imports, and every export route', async () => {
    await user.post('/api/v1/stations').set('Origin', origin).set('X-CSRF-Token', userToken).send(stationInput).expect(403);
    for (const path of ['/imports', '/users', '/reports/water-records', '/reports/water-records.xlsx', `/reports/imports/${new mongoose.Types.ObjectId()}.xlsx`]) {
      await user.get(`/api/v1${path}`).expect(403);
      await request(app).get(`/api/v1${path}`).expect(401);
    }
  });
  it('invalidates account access immediately when disabled and prevents self-lockout', async () => {
    await writeAdmin('patch', `/users/${adminId}`).send({ isActive: false }).expect(409);
    await writeAdmin('patch', `/users/${userId}`).send({ isActive: false }).expect(200);
    await user.get('/api/v1/auth/me').expect(401);
  });
  it('rejects unrecognized write fields and malformed JSON without leaking a stack', async () => {
    const result = await writeAdmin('post', '/stations').send({ ...stationInput, isActive: true }).expect(400);
    expect(result.body.error).not.toHaveProperty('stack');
    await writeAdmin('post', '/stations').set('Content-Type', 'application/json').send('{bad json').expect(400);
    await request(app).get('/api/v1/stations/bad-id').expect(400);
    await request(app).get('/api/v1/stations?limit=101').expect(400);
  });
});

describe('station and time-series data integrity', () => {
  it('normalizes unique station codes and validates longitude/latitude', async () => {
    const id = await station();
    const saved = await Station.findById(id).lean();
    expect(saved?.code).toBe('TEST_01');
    expect(saved?.location?.coordinates).toEqual([106.5, 20.9]);
    await writeAdmin('post', '/stations').send({ ...stationInput, code: 'TEST_01' }).expect(409);
    await writeAdmin('post', '/stations').send({ ...stationInput, code: 'TEST_02', location: { type: 'Point', coordinates: [20, 106] } }).expect(400);
  });
  it('preserves valid zero values and hides pending and rejected records from public requests', async () => {
    const id = await station();
    const item = await record(id);
    expect(item.parameters.do).toBe(0);
    expect(item.wqi).toBeNull();
    expect((await request(app).get(`/api/v1/stations/${id}/water-records`).expect(200)).body.data).toEqual([]);
    const reviewed = await writeAdmin('patch', `/water-records/${item._id}/validation`).send({ version: 1, status: 'verified', note: 'Reviewed in isolated test' }).expect(200);
    const published = await request(app).get(`/api/v1/stations/${id}/water-records`).expect(200);
    expect(published.body.data).toHaveLength(1);
    expect(published.body.data[0]).not.toHaveProperty('createdBy');
    expect(published.body.data[0]).not.toHaveProperty('source');
    await writeAdmin('patch', `/water-records/${item._id}/validation`).send({ version: reviewed.body.data.version, status: 'rejected', note: 'Rejected in isolated test' }).expect(200);
    expect((await request(app).get('/api/v1/water-records?status=rejected').expect(200)).body.data).toEqual([]);
  });
  it('rejects missing parameters, wrong numeric types, negative values, invalid pH, and duplicate timestamps', async () => {
    const id = await station();
    const incomplete: Partial<typeof parameters> = { ...parameters };
    delete incomplete.tss;
    for (const invalid of [incomplete, { ...parameters, do: '1' }, { ...parameters, cod: -1 }, { ...parameters, ph: 15 }]) {
      await writeAdmin('post', `/stations/${id}/water-records`).send({ ...recordInput, parameters: invalid }).expect(400);
    }
    await record(id);
    await writeAdmin('post', `/stations/${id}/water-records`).send({ ...recordInput, measuredAt: '2026-04-30T17:00:00Z' }).expect(409);
    await writeAdmin('post', `/stations/${new mongoose.Types.ObjectId()}/water-records`).send(recordInput).expect(404);
  });
  it('uses inclusive start and exclusive end with timezone-aware timestamps', async () => {
    const id = await station();
    const first = await record(id);
    const second = await record(id, { ...recordInput, measuredAt: '2026-05-02T00:00:00+07:00' });
    for (const item of [first, second]) await writeAdmin('patch', `/water-records/${item._id}/validation`).send({ version: 1, status: 'verified', note: 'Confirmed' }).expect(200);
    const result = await request(app).get('/api/v1/water-records').query({ from: '2026-05-01T00:00:00+07:00', to: '2026-05-02T00:00:00+07:00' }).expect(200);
    expect(result.body.data.map((item: { _id: string }) => item._id)).toEqual([first._id]);
    await request(app).get('/api/v1/water-records').query({ from: '2026-05-02T00:00:00Z', to: '2026-05-01T00:00:00Z' }).expect(400);
    await admin.get('/api/v1/water-records?status=unexpected').expect(400);
  });
  it('prevents lost edits and invalidates prior review and WQI when inputs change', async () => {
    const item = await record(await station());
    await WaterRecord.updateOne({ _id: item._id }, { $set: { wqi: 75, qualityClass: 'Test fixture only', wqiSource: 'test' } });
    await writeAdmin('patch', `/water-records/${item._id}/validation`).send({ version: 1, status: 'verified', note: 'Confirmed' }).expect(200);
    await writeAdmin('patch', `/water-records/${item._id}`).send({ ...recordInput, version: 1 }).expect(409);
    const edited = await writeAdmin('patch', `/water-records/${item._id}`).send({ ...recordInput, parameters: { ...parameters, ph: 8 }, version: 2 }).expect(200);
    expect(edited.body.data).toMatchObject({ validationStatus: 'pending', wqi: null, qualityClass: null, wqiSource: null, reviewedAt: null, version: 3 });
    await writeAdmin('patch', `/water-records/${new mongoose.Types.ObjectId()}`).send({ ...recordInput, version: 1 }).expect(404);
  });
  it('deactivates a station without losing its history or exposing it publicly', async () => {
    const id = await station();
    const item = await record(id);
    await writeAdmin('patch', `/water-records/${item._id}/validation`).send({ version: 1, status: 'verified', note: 'Confirmed' }).expect(200);
    await writeAdmin('delete', `/stations/${id}`).expect(204);
    await request(app).get(`/api/v1/stations/${id}`).expect(404);
    await request(app).get(`/api/v1/stations/${id}/water-records`).expect(404);
    expect((await request(app).get('/api/v1/water-records').expect(200)).body.data).toEqual([]);
    expect((await admin.get(`/api/v1/stations/${id}/water-records`).expect(200)).body.data).toHaveLength(1);
    await writeAdmin('post', `/stations/${id}/water-records`).send({ ...recordInput, measuredAt: '2026-05-03T00:00:00Z' }).expect(404);
  });
});

describe('raw Excel import, recovery, normalization, and export', () => {
  it('preserves raw values and leaves missing station, time, TSS, and WQI absent', async () => {
    const buffer = await workbookBuffer([[7, 25, 2, 3, 6, 0.2, null, 'not numeric']]);
    const preview = await writeAdmin('post', '/imports/preview').attach('file', buffer, 'readings.xlsx').expect(200);
    expect(preview.body.data).toMatchObject({ rowCount: 1, issueCount: 1, duplicate: false });
    const committed = await writeAdmin('post', '/imports/commit').attach('file', buffer, 'readings.xlsx').expect(201);
    const batchId = committed.body.data.batch._id;
    const result = await admin.get(`/api/v1/imports/${batchId}/rows`).expect(200);
    expect(result.body.data.rows[0].values).toEqual({ PH: 7, Temp: 25, BOD5: 2, COD: 3, DO: 6, Amoni: 0.2, Phosphat: null, Coliforms: 'not numeric' });
    expect(await Station.countDocuments()).toBe(0);
    expect(await WaterRecord.countDocuments()).toBe(0);
    const again = await writeAdmin('post', '/imports/commit').attach('file', buffer, 'readings.xlsx').expect(200);
    expect(again.body.data.duplicate).toBe(true);
    expect(await ImportedRow.countDocuments()).toBe(1);
  });
  it('reports formula, header, unsupported cell, size, and corrupt workbook failures', async () => {
    await expect(parseWorkbook(await workbookBuffer([[{ formula: '1+1', result: 2 }, 1, 2, 3, 4, 5, 6, 7]]))).rejects.toMatchObject({ code: 'FORMULA_NOT_ALLOWED' });
    await expect(parseWorkbook(await workbookBuffer([[new Date(), 1, 2, 3, 4, 5, 6, 7]]))).rejects.toMatchObject({ code: 'UNSUPPORTED_CELL' });
    await expect(parseWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    await expect(parseWorkbook(Buffer.from('invalid excel'))).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet1').addRow(['PH']);
    await expect(parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
    await writeAdmin('post', '/imports/commit').attach('file', await workbookBuffer(), 'readings.csv').expect(400);
  });
  it('recovers an interrupted import lease without duplicating or overwriting rows', async () => {
    const buffer = await workbookBuffer();
    const parsed = await parseWorkbook(buffer);
    const batch = await ImportBatch.create({ contentHash: parsed.contentHash, fileName: 'readings.xlsx', rowCount: 1, issueCount: 0, status: 'importing', uploadedBy: adminId, leaseToken: 'expired-worker', leaseExpiresAt: new Date(Date.now() - 1000) });
    await ImportedRow.create({ batchId: batch._id, ...parsed.rows[0] });
    const result = await commitWorkbook(buffer, 'readings.xlsx', adminId);
    expect(result.batch.status).toBe('ready');
    expect(await ImportedRow.countDocuments()).toBe(1);
    expect((await ImportedRow.findOne().lean())?.values).toEqual(parsed.rows[0].values);
  });
  it('marks failures retryable, rejects active imports, and continues failed imports safely', async () => {
    const buffer = await workbookBuffer();
    const bulk = vi.spyOn(ImportedRow, 'bulkWrite').mockRejectedValueOnce(new Error('Isolated database write failure'));
    await expect(commitWorkbook(buffer, 'readings.xlsx', adminId)).rejects.toThrow('Isolated database write failure');
    expect((await ImportBatch.findOne().lean())?.status).toBe('failed');
    bulk.mockRestore();
    expect((await commitWorkbook(buffer, 'readings.xlsx', adminId)).batch.status).toBe('ready');
    await ImportBatch.updateOne({}, { $set: { status: 'importing', leaseExpiresAt: new Date(Date.now() + 60000), leaseToken: 'active-worker' } });
    await expect(commitWorkbook(buffer, 'readings.xlsx', adminId)).rejects.toMatchObject({ code: 'IMPORT_IN_PROGRESS' });
  });
  it('requires complete normalization and keeps the immutable source row linked', async () => {
    const buffer = await workbookBuffer();
    const committed = await commitWorkbook(buffer, 'readings.xlsx', adminId);
    const row = await ImportedRow.findOne().lean();
    const path = `/imports/${committed.batch.id}/rows/${row!._id}/normalize`;
    const stationId = await station();
    await writeAdmin('post', path).send({ stationId, measuredAt: recordInput.measuredAt }).expect(400);
    const input = { ...recordInput, stationId, sourceNote: 'All metadata and unit basis explicitly confirmed in isolated test.' };
    const result = await writeAdmin('post', path).send(input).expect(201);
    expect(result.body.data.source.rowId).toBe(row!._id.toString());
    expect(result.body.data.validationStatus).toBe('pending');
    expect((await ImportedRow.findById(row!._id).lean())?.values).toEqual(row!.values);
    await writeAdmin('post', path).send(input).expect(409);
    expect(await WaterRecord.countDocuments()).toBe(1);
  });
  it('exports unchanged raw values and correct filtered measurements only for Admin', async () => {
    const committed = await commitWorkbook(await workbookBuffer(), 'readings.xlsx', adminId);
    const result = await admin.get(`/api/v1/reports/imports/${committed.batch.id}.xlsx`).buffer(true).parse(binaryResponse).expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(result.body);
    expect(book.worksheets[0].getRow(1).values).toEqual([undefined, ...rawColumns]);
    expect(book.worksheets[0].getRow(2).values).toEqual([undefined, 7, 25, 2, 3, 6, 0.2, 0.1, 40]);
    const id = await station();
    await record(id);
    const exported = await admin.get(`/api/v1/reports/water-records.xlsx?stationId=${id}`).buffer(true).parse(binaryResponse).expect(200);
    await book.xlsx.load(exported.body);
    expect(book.worksheets[0].rowCount).toBe(2);
    expect(book.worksheets[0].getRow(2).getCell(3).value).toBe('2026-04-30T17:00:00.000Z');
  });
});

describe('AI boundary and per-user prediction history', () => {
  it('returns unavailable without generating any WQI or history while disabled', async () => {
    expect((await user.get('/api/v1/predictions/status').expect(200)).body.data.available).toBe(false);
    const result = await user.post('/api/v1/predictions').set('Origin', origin).set('X-CSRF-Token', userToken).send({ parameters, unitBasis: recordInput.unitBasis }).expect(503);
    expect(result.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(await Prediction.countDocuments()).toBe(0);
  });
  it('persists a valid upstream result only for its owner and never as a measurement', async () => {
    process.env.AI_MODE = 'http';
    process.env.AI_SERVICE_URL = 'http://ai.tests.invalid/predict';
    const response = { wqi: 76, qualityClass: 'Isolated upstream fixture', modelVersion: 'test-model', classificationVersion: 'test-classification' };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
    const result = await user.post('/api/v1/predictions').set('Origin', origin).set('X-CSRF-Token', userToken).send({ parameters, unitBasis: recordInput.unitBasis }).expect(201);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ parameters, unitBasis: recordInput.unitBasis });
    expect(result.body.data).toMatchObject(response);
    expect((await user.get('/api/v1/predictions').expect(200)).body.data).toHaveLength(1);
    expect((await outsider.get('/api/v1/predictions').expect(200)).body.data).toEqual([]);
    await outsider.get(`/api/v1/predictions/${result.body.data._id}`).expect(404);
    expect(await WaterRecord.countDocuments()).toBe(0);
  });
  it('handles upstream failure, bad output, and timeout without persisting success', async () => {
    process.env.AI_MODE = 'http';
    process.env.AI_SERVICE_URL = 'http://ai.tests.invalid/predict';
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const response of [new Response('failed', { status: 500 }), new Response(JSON.stringify({ wqi: 101 })), new Response('x'.repeat(17000))]) {
      fetch.mockResolvedValueOnce(response);
      await user.post('/api/v1/predictions').set('Origin', origin).set('X-CSRF-Token', userToken).send({ parameters, unitBasis: recordInput.unitBasis }).expect(502);
    }
    fetch.mockRejectedValueOnce(new DOMException('Timeout', 'TimeoutError'));
    const result = await user.post('/api/v1/predictions').set('Origin', origin).set('X-CSRF-Token', userToken).send({ parameters, unitBasis: recordInput.unitBasis }).expect(504);
    expect(result.body.error.code).toBe('AI_TIMEOUT');
    expect(await Prediction.countDocuments()).toBe(0);
  });
});

const sourcePath = process.env.WQI_SOURCE_XLSX || 'C:/Users/LENOVO/Downloads/AKH-5_2026 (1).xlsx';
const sourceAvailable = await access(sourcePath).then(() => true, () => false);
it.skipIf(!sourceAvailable)('reads the supplied real workbook without changing it and preserves all 756 rows and eight columns', async () => {
  const buffer = await readFile(sourcePath);
  const beforeHash = createHash('sha256').update(buffer).digest('hex');
  const parsed = await parseWorkbook(buffer);
  expect(parsed.rows).toHaveLength(756);
  const original = new ExcelJS.Workbook();
  await original.xlsx.load(buffer as unknown as Parameters<typeof original.xlsx.load>[0]);
  for (const row of parsed.rows) {
    expect(Object.keys(row.values)).toEqual([...rawColumns]);
    rawColumns.forEach((key, index) => expect(row.values[key]).toBe(original.worksheets[0].getRow(row.rowNumber).getCell(index + 1).value));
  }
  const imported = await commitWorkbook(buffer, 'AKH-5_2026 (1).xlsx', adminId);
  expect(imported.batch.rowCount).toBe(756);
  expect(await ImportedRow.countDocuments()).toBe(756);
  expect(await WaterRecord.countDocuments()).toBe(0);
  expect(await Station.countDocuments()).toBe(0);
  expect(createHash('sha256').update(await readFile(sourcePath)).digest('hex')).toBe(beforeHash);
});
