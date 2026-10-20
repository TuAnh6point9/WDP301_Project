import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { predictionBatchRouter } from '../src/modules/prediction-batches/batch.routes.js';
import { PredictionBatch, PredictionBatchRow } from '../src/modules/prediction-batches/batch.model.js';
import { processNextBatchChunk } from '../src/modules/prediction-batches/batch.service.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const owner = '111111111111111111111111', other = '222222222222222222222222';
const output = { wqi: 64, rawWqi: 64.027, qualityClass: 'Trung bình', modelVersion: 'callisto 2.0', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), referenceBasis: 'lecturer-provided', unitStatus: 'unverified' };
const app = express();
app.use(express.json());
app.use((req, res, next) => { const id = req.headers['x-test-user']; if (typeof id === 'string') res.locals.user = { _id: id, name: 'Fixture', email: 'test@example.test', role: id === other ? 'admin' : 'user', isActive: true }; next(); });
app.use('/batches', predictionBatchRouter); app.use(errorHandler);
let db: MongoMemoryServer, upstream: Server, original: NodeJS.ProcessEnv;
let unavailable = false, changed = false, calls: number[] = [], invalidOutput: false | string = false;
async function workbook(count = 3, invalid = true) {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Samples');
  sheet.addRow(['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms']);
  for (let i = 0; i < count; i++) sheet.addRow([invalid && i === 1 ? '7,2' : 7.2, 25, 3, 25, 5.7, 0.2, 0.3, 5000]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const upload = async (count = 3, invalid = true) => request(app).post('/batches/preview').set('x-test-user', owner).attach('file', await workbook(count, invalid), 'samples.xlsx');
const start = (id: string, user = owner) => request(app).post(`/batches/${id}/start`).set('x-test-user', user).send({});
beforeAll(async () => {
  original = { ...process.env };
  const binary = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'batch_test_only' }, binary: existsSync(binary) ? { systemBinary: binary } : undefined });
  await mongoose.connect(db.getUri(), { autoIndex: false });
  await Promise.all([PredictionBatch.init(), PredictionBatchRow.init()]);
  upstream = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (unavailable) { res.writeHead(503); res.end('{}'); return; }
    if (req.url === '/health') { res.end(JSON.stringify({ ready: true, ...output, artifactSha256: (changed ? 'b' : 'a').repeat(64), inputDomain: null, featureOrder: ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD'] })); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(req.url).toBe('/predict/batch');
    calls.push(body.rows.length);
    res.end(JSON.stringify({ rows: body.rows.map((row: { rowNumber: number }) => ({ rowNumber: row.rowNumber, ...(invalidOutput && row.rowNumber === 2 ? { error: { code: invalidOutput } } : { result: output }) })) }));
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'batch-test-secret-with-32-characters', AI_MODE: 'http', AI_SERVICE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/predict`, AI_TIMEOUT_MS: '1000' });
});
beforeEach(async () => { await PredictionBatch.deleteMany({}); await PredictionBatchRow.deleteMany({}); unavailable = changed = invalidOutput = false; calls = []; });
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); if (upstream) { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); } process.env = original; });

describe('private persisted prediction batches', () => {
  it('calculates six-column files and leaves missing optional values blank in preview and export', async () => {
    const source = new ExcelJS.Workbook(); source.addWorksheet('Samples').addRows([
      ['COD', 'Coliforms', 'PH', 'DO', 'Amoni', 'Phosphat'], [25, 5000, 7.2, 5.7, 0.2, 0.3],
    ]);
    const preview = await request(app).post('/batches/preview').set('x-test-user', owner).attach('file', Buffer.from(await source.xlsx.writeBuffer()), 'six-columns.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data).toMatchObject({ rowCount: 1, validCount: 1, invalidCount: 0 });
    const id = preview.body.data._id;
    const rows = await request(app).get(`/batches/${id}/rows`).set('x-test-user', owner);
    expect(rows.body.data[0].values).toMatchObject({ Temp: null, BOD5: null, PH: 7.2, COD: 25 });
    expect((await start(id)).status).toBe(202); await processNextBatchChunk();
    const exported = await request(app).get(`/batches/${id}/export`).set('x-test-user', owner).buffer(true).parse((res, callback) => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => callback(null, Buffer.concat(chunks))); });
    expect(exported.status).toBe(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(exported.body);
    const row = book.worksheets[0].getRow(2);
    expect(row.getCell(2).value).toBeNull(); expect(row.getCell(3).value).toBeNull();
    expect(row.getCell(10).value).toBe(output.wqi);
    expect(calls).toEqual([1]);
  });
  it('previews without inference, runs valid rows and exports every original row', async () => {
    const preview = await upload(); expect(preview.status).toBe(201);
    const id = preview.body.data._id;
    expect(preview.body.data).toMatchObject({ status: 'preview', rowCount: 3, validCount: 2, invalidCount: 1 });
    expect(calls).toEqual([]);
    expect((await request(app).get(`/batches/${id}/export`).set('x-test-user', owner)).status).toBe(409);
    expect((await start(id)).status).toBe(202);
    await processNextBatchChunk();
    const detail = await request(app).get(`/batches/${id}`).set('x-test-user', owner);
    expect(detail.body.data).toMatchObject({ status: 'completed_with_errors', successCount: 2, errorCount: 1 });
    const rows = await request(app).get(`/batches/${id}/rows?filter=errors`).set('x-test-user', owner);
    expect(rows.body.data.map((row: { rowNumber: number }) => row.rowNumber)).toEqual([3]);
    const exported = await request(app).get(`/batches/${id}/export`).set('x-test-user', owner).buffer(true).parse((res, callback) => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => callback(null, Buffer.concat(chunks))); });
    expect(exported.status).toBe(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(exported.body);
    expect(book.worksheets[0].rowCount).toBe(4);
    expect(book.worksheets[0].getRow(3).getCell(1).value).toBe('7,2');
    expect(book.worksheets[0].getRow(3).getCell(10).value).toBeNull();
    expect(calls).toEqual([2]);
  });
  it('does not expose the classification version stored by older batches', async () => {
    const legacy = 'VN_WQI_1460_2019';
    const { insertedId } = await PredictionBatch.collection.insertOne({ userId: new mongoose.Types.ObjectId(owner), fileName: 'old.xlsx', status: 'completed', rowCount: 1, validCount: 1, invalidCount: 0, modelSnapshot: { ...output, available: true, configured: true, classificationVersion: legacy }, createdAt: new Date() });
    await PredictionBatchRow.collection.insertOne({ batchId: insertedId, rowNumber: 2, values: {}, issues: [], status: 'success', result: { ...output, classificationVersion: legacy } });
    const list = await request(app).get('/batches').set('x-test-user', owner);
    const detail = await request(app).get(`/batches/${insertedId}`).set('x-test-user', owner);
    const rows = await request(app).get(`/batches/${insertedId}/rows`).set('x-test-user', owner);
    expect(list.body.data[0].modelSnapshot).toMatchObject({ modelVersion: 'callisto 2.0' });
    expect(rows.body.data[0].result).toMatchObject({ wqi: 64 });
    expect(JSON.stringify([list.body, detail.body, rows.body])).not.toContain('classificationVersion');
  });
  it('blocks anonymous and other owners (including Admin) for every operation', async () => {
    expect((await request(app).get('/batches')).status).toBe(401);
    const { body } = await upload(), id = body.data._id;
    for (const suffix of ['', '/rows', '/export']) expect((await request(app).get(`/batches/${id}${suffix}`).set('x-test-user', other)).status).toBe(404);
    expect((await start(id, other)).status).toBe(404);
    expect((await request(app).get('/batches').set('x-test-user', other)).body.data).toEqual([]);
  });
  it('makes start idempotent, enforces one active batch and resumes after response loss', async () => {
    const first = (await upload(205, false)).body.data._id;
    const second = (await upload()).body.data._id;
    expect((await start(first)).status).toBe(202);
    expect((await start(first)).status).toBe(202);
    expect((await start(second)).status).toBe(409);
    await processNextBatchChunk();
    unavailable = true; await processNextBatchChunk();
    expect((await PredictionBatch.findById(first))?.status).toBe('paused');
    expect(await PredictionBatchRow.countDocuments({ batchId: first, status: 'success' })).toBe(100);
    unavailable = false; expect((await start(first)).status).toBe(202);
    await processNextBatchChunk(); await processNextBatchChunk();
    expect(calls).toEqual([100, 100, 5]);
    expect(await PredictionBatchRow.countDocuments({ batchId: first })).toBe(205);
    expect((await PredictionBatch.findById(first))?.successCount).toBe(205);
  });
  it('recovers expired leases and never mixes model versions', async () => {
    const id = (await upload()).body.data._id; await start(id);
    await PredictionBatch.updateOne({ _id: id }, { $set: { status: 'running', leaseToken: 'old-process', leaseExpiresAt: new Date(0) } });
    changed = true; await processNextBatchChunk();
    expect((await PredictionBatch.findById(id))?.pauseCode).toBe('AI_MODEL_CHANGED');
    expect(await PredictionBatchRow.countDocuments({ batchId: id, status: 'success' })).toBe(0);
    expect((await start(id)).status).toBe(409);
    changed = false; expect((await start(id)).status).toBe(202);
    await processNextBatchChunk();
    expect((await PredictionBatch.findById(id))?.successCount).toBe(2);
  });
  it('keeps per-row inference errors and rejects all-invalid start', async () => {
    const invalidBook = new ExcelJS.Workbook(); invalidBook.addWorksheet('x').addRows([['PH','Temp','BOD5','COD','DO','Amoni','Phosphat','Coliforms'], [15,1,1,1,1,1,1,1]]);
    const preview = await request(app).post('/batches/preview').set('x-test-user', owner).attach('file', Buffer.from(await invalidBook.xlsx.writeBuffer()), 'bad.xlsx');
    expect((await start(preview.body.data._id)).status).toBe(400);
    const id = (await upload(3, false)).body.data._id;
    await start(id); invalidOutput = 'AI_OUTPUT_OUT_OF_RANGE'; await processNextBatchChunk();
    expect((await PredictionBatch.findById(id))?.errorCount).toBe(1);
    expect(await PredictionBatchRow.countDocuments({ batchId: id, status: 'success' })).toBe(2);
    const discarded = await PredictionBatchRow.findOne({ batchId: id, rowNumber: 2 }).lean();
    expect(discarded).toMatchObject({ status: 'error', issues: ['The model returned a WQI outside 0–100; the result was discarded.'] });
    expect(discarded).not.toHaveProperty('result');
  });
  it('atomically limits concurrent starts and concurrent workers', async () => {
    const a = (await upload(150, false)).body.data._id, b = (await upload(150, false)).body.data._id;
    const responses = await Promise.all([start(a), start(b)]);
    expect(responses.map(res => res.status).sort()).toEqual([202, 409]);
    await Promise.all([processNextBatchChunk(), processNextBatchChunk()]);
    expect(calls).toEqual([100]);
    expect(await PredictionBatchRow.countDocuments({ status: 'success' })).toBe(100);
  });
});
