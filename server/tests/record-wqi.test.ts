import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import session from 'express-session';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { importColumns } from '@wqi/contracts';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Station } from '../src/modules/stations/station.model.js';
import { WaterRecord } from '../src/modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../src/modules/imports/import.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

// Each saved measurement gets its WQI from the model (decision 24, feature 3): at Save, or at approval when the AI was asleep.
const ORIGIN = 'http://wqi-test.local';
const PASSWORD = 'correct-horse-battery';
const installedMongod = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const output = { wqi: 75, rawWqi: 75.2, qualityClass: 'Trung bình', modelVersion: 'callisto 2.0', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), referenceBasis: 'lecturer-provided', unitStatus: 'unverified' };
const REFUSED_PH = 13;
let db: MongoMemoryServer, upstream: Server, app: Express, original: NodeJS.ProcessEnv;
let admin: { agent: ReturnType<typeof request.agent>; csrf: string };
let asleep = false, scored: number[] = [];

type Cell = number | string | null;
const sample = (station: string, ph: Cell = 7.2, wqi: Cell = null): Cell[] => ['D01-2026', station, ph, 5.6, 18, 0.25, 0.12, 4600, 27.5, null, null, wqi];
async function file(rows: Cell[][], header: readonly string[] = importColumns) {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Data');
  sheet.addRow([...header]);
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}
const write = (method: 'post' | 'patch', url: string) => admin.agent[method](url).set('Origin', ORIGIN).set('X-CSRF-Token', admin.csrf);
const commit = (buffer: Buffer, confirm = '') => {
  const call = write('post', '/api/v1/imports/commit');
  if (confirm) call.field('confirm', confirm);
  return call.attach('file', buffer, 'dot.xlsx');
};
const review = (record: { _id: unknown; version: number }, status: string, note = '') => write('patch', `/api/v1/water-records/${record._id}/validation`).send({ status, note, version: record.version });
const oneRecord = async () => (await WaterRecord.findOne().lean())!;

beforeAll(async () => {
  original = { ...process.env };
  if (existsSync(installedMongod)) process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'record_wqi_test_only' }, binary: existsSync(installedMongod) ? { systemBinary: installedMongod } : undefined });
  await mongoose.connect(db.getUri(), { dbName: 'record_wqi_test_only' });
  upstream = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (asleep) { res.writeHead(503); res.end('{}'); return; }
    if (req.url === '/health') { res.end(JSON.stringify({ ready: true, ...output, inputDomain: null, featureOrder: ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD'] })); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/predict/batch') {
      scored.push(body.rows.length);
      res.end(JSON.stringify({ rows: body.rows.map((row: { rowNumber: number; parameters: { ph: number } }) => ({ rowNumber: row.rowNumber, ...(row.parameters.ph === REFUSED_PH ? { error: { code: 'AI_OUTPUT_OUT_OF_RANGE' } } : { result: output }) })) }));
      return;
    }
    if (body.parameters.ph === REFUSED_PH) { res.writeHead(500); res.end(JSON.stringify({ error: { code: 'AI_OUTPUT_OUT_OF_RANGE' } })); return; }
    res.end(JSON.stringify(output));
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'test-only-secret-long-enough-32-chars', CLIENT_ORIGIN: ORIGIN, AI_MODE: 'http', AI_SERVICE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/predict`, AI_TIMEOUT_MS: '1000', AI_API_KEY: '' });
  app = createApp(new session.MemoryStore());
  await User.create({ name: 'Admin Test', email: 'admin@example.test', passwordHash: await hashPassword(PASSWORD), role: 'admin' });
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
  const login = await agent.post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', csrf).send({ email: 'admin@example.test', password: PASSWORD });
  admin = { agent, csrf: login.body.data.csrfToken };
});
beforeEach(async () => {
  await Promise.all([Station, WaterRecord, ImportBatch, ImportedRow].map(model => model.deleteMany({})));
  await Station.create(['AH1', 'AH2', 'AH3'].map(code => ({ code, name: `Station ${code}`, administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] } })));
  asleep = false; scored = [];
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
  if (upstream) { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
  process.env = original;
});

describe('WQI on imported measurements', () => {
  it('offers an empty WQI column in the template', async () => {
    const template = await admin.agent.get('/api/v1/imports/template').buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(template.body);
    const sheet = book.worksheets[0];
    const header = (sheet.getRow(1).values as Cell[]).slice(1);
    expect(header[header.length - 1]).toBe('WQI');
    for (const row of [2, 3, 4]) expect(sheet.getRow(row).getCell(header.length).value).toBeNull();
  });

  it('calculates WQI at Save from the six values and ignores a number typed in the WQI column', async () => {
    const saved = await commit(await file([sample('AH1', 7.2, 12), sample('AH1')]));
    expect(saved.status).toBe(201);
    expect(saved.body.data.wqi).toEqual({ calculated: 2, pending: 0 });
    const records = await WaterRecord.find().lean();
    expect(records.map(record => [record.wqi, record.qualityClass, record.wqiSource, record.validationStatus])).toEqual([[75, 'Trung bình', 'callisto 2.0', 'pending'], [75, 'Trung bình', 'callisto 2.0', 'pending']]);
    expect(scored).toEqual([2]);
  });

  it('still accepts a file with no WQI column', async () => {
    const saved = await commit(await file([sample('AH1').slice(0, -1)], importColumns.filter(name => name !== 'WQI')));
    expect(saved.status).toBe(201);
    expect((await oneRecord()).wqi).toBe(75);
  });

  it('calculates in groups of 100 so a large file stays within what the model accepts', async () => {
    const saved = await commit(await file(Array.from({ length: 150 }, () => sample('AH1'))));
    expect(saved.body.data.wqi).toEqual({ calculated: 150, pending: 0 });
    expect(scored).toEqual([100, 50]);
  });

  it('calculates again when a confirmed overwrite replaces the old values', async () => {
    await commit(await file([sample('AH1')]));
    const overwritten = await commit(await file([sample('AH1', 7.5)]), 'D01-2026,D01-2026|1');
    expect(overwritten.status).toBe(201);
    const record = await oneRecord();
    expect(record.parameters.ph).toBe(7.5);
    expect(record.wqi).toBe(75);
    expect(overwritten.body.data.wqi).toEqual({ calculated: 1, pending: 0 });
  });

  it('keeps the rows when the AI is asleep at Save and calculates at approval', async () => {
    asleep = true;
    const saved = await commit(await file([sample('AH1')]));
    expect(saved.status).toBe(201);
    expect(saved.body.data.wqi).toEqual({ calculated: 0, pending: 1 });
    expect(await oneRecord()).toMatchObject({ wqi: null, qualityClass: null, validationStatus: 'pending' });

    asleep = false;
    const approved = await review(await oneRecord(), 'verified');
    expect(approved.status).toBe(200);
    expect(await oneRecord()).toMatchObject({ wqi: 75, qualityClass: 'Trung bình', wqiSource: 'callisto 2.0', validationStatus: 'verified' });
  });

  it('asks to try again instead of approving without a WQI while the AI is asleep', async () => {
    asleep = true;
    await commit(await file([sample('AH1')]));
    const before = await oneRecord();
    const approved = await review(before, 'verified');
    expect(approved.status).toBe(503);
    expect(approved.body.error.code).toBe('AI_MODEL_NOT_READY');
    expect(await oneRecord()).toMatchObject({ wqi: null, validationStatus: 'pending', version: before.version });
  });

  it('can reject while the AI is asleep, since a rejected record needs no WQI', async () => {
    asleep = true;
    await commit(await file([sample('AH1')]));
    const rejected = await review(await oneRecord(), 'rejected', 'Sai số');
    expect(rejected.status).toBe(200);
    expect(await oneRecord()).toMatchObject({ wqi: null, validationStatus: 'rejected' });
  });

  it('does not ask the model again at approval when the WQI is already there', async () => {
    await commit(await file([sample('AH1')]));
    asleep = true;
    const approved = await review(await oneRecord(), 'verified');
    expect(approved.status).toBe(200);
    expect(await oneRecord()).toMatchObject({ wqi: 75, validationStatus: 'verified' });
  });

  it('does not block approval when the model can never score the values', async () => {
    const saved = await commit(await file([sample('AH1', REFUSED_PH), sample('AH1')]));
    expect(saved.body.data.wqi).toEqual({ calculated: 1, pending: 1 });
    const refused = await WaterRecord.findOne({ wqi: null }).lean();
    const approved = await review(refused!, 'verified');
    expect(approved.status).toBe(200);
    expect(await WaterRecord.findById(refused!._id).lean()).toMatchObject({ wqi: null, validationStatus: 'verified' });
  });
});
