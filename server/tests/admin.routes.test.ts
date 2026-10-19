import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import session from 'express-session';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { rawColumns, apiErrorMessage } from '@wqi/contracts';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Station } from '../src/modules/stations/station.model.js';
import { WaterRecord } from '../src/modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../src/modules/imports/import.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { AuditLog } from '../src/modules/audit/audit.model.js';
import { createdRange } from '../src/middleware/validate.js';
import { AppError } from '../src/utils/app-error.js';

// A separate mongod process and database, never the user's local or shared database.
const installedMongod = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const ORIGIN = 'http://admin-test.local';
const PASSWORD = 'correct-horse-battery';
let db: MongoMemoryServer;
let app: Express;
let original: NodeJS.ProcessEnv;
type Session = { agent: ReturnType<typeof request.agent>; csrf: string };
let admin: Session;
let member: Session;
let guest: ReturnType<typeof request.agent>;

async function signIn(email: string): Promise<Session> {
  const agent = request.agent(app);
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
  const response = await agent.post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', csrf).send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return { agent, csrf: response.body.data.csrfToken };
}
const write = (who: Session, method: 'post' | 'patch', url: string) => who.agent[method](url).set('Origin', ORIGIN).set('X-CSRF-Token', who.csrf);
async function workbook(rows: (number | string | null)[][], header: readonly string[] = rawColumns) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  sheet.addRow([...header]);
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}
const station = () => Station.create({ code: 'AKH-T1', name: 'Test station', administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] } });

beforeAll(async () => {
  original = { ...process.env };
  if (existsSync(installedMongod)) process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'admin_test_only' }, binary: existsSync(installedMongod) ? { systemBinary: installedMongod } : undefined });
  await mongoose.connect(db.getUri(), { dbName: 'admin_test_only' });
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'test-only-secret-long-enough-32-chars', CLIENT_ORIGIN: ORIGIN, AI_MODE: 'disabled', AI_SERVICE_URL: '' });
  app = createApp(new session.MemoryStore());
  const passwordHash = await hashPassword(PASSWORD);
  await User.create([
    { name: 'Admin Test', email: 'admin@example.test', passwordHash, role: 'admin' },
    { name: 'User Test', email: 'user@example.test', passwordHash, role: 'user' },
  ]);
  admin = await signIn('admin@example.test');
  member = await signIn('user@example.test');
  guest = request.agent(app);
});
beforeEach(async () => {
  await Promise.all([Station, WaterRecord, ImportBatch, ImportedRow].map(model => model.deleteMany({})));
});
afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
  process.env = original;
});

describe('createdAt day range in Asia/Saigon', () => {
  const match = (iso: string) => {
    const { createdAt } = createdRange({ from: '2026-10-01', to: '2026-10-31' });
    const at = new Date(iso);
    return at >= createdAt!.$gte! && at < createdAt!.$lt!;
  };
  it.each([
    ['2026-10-01T00:00:00+07:00', true], ['2026-09-30T23:59:59.999+07:00', false],
    ['2026-10-31T23:59:59.999+07:00', true], ['2026-11-01T00:00:00+07:00', false],
  ])('%s inside is %s', (iso, inside) => expect(match(iso)).toBe(inside));
  it('is unbounded without dates and rejects reversed or impossible dates', () => {
    expect(createdRange({})).toEqual({});
    expect(() => createdRange({ from: '2026-10-02', to: '2026-10-01' })).toThrow(AppError);
    expect(() => createdRange({ from: '2026-02-30' })).toThrow();
  });
});

describe('activity log endpoint', () => {
  beforeEach(async () => {
    await AuditLog.deleteMany({});
    await AuditLog.collection.insertMany([
      { action: 'user.create', actorId: null, target: null, outcome: 'success', status: 201, requestId: 'r1', createdAt: new Date('2026-10-05T10:00:00+07:00') },
      { action: 'import.preview', actorId: null, target: null, outcome: 'failure', status: 400, requestId: 'r2', createdAt: new Date('2026-10-06T10:00:00+07:00') },
      { action: 'user.create', actorId: null, target: null, outcome: 'success', status: 201, requestId: 'r3', createdAt: new Date('2026-11-01T00:00:00+07:00') },
    ]);
  });
  it('is admin only', async () => {
    expect((await member.agent.get('/api/v1/audit-logs')).status).toBe(403);
    expect((await guest.get('/api/v1/audit-logs')).status).toBe(401);
  });
  it('filters by day range and action, newest first, with pagination meta', async () => {
    const all = await admin.agent.get('/api/v1/audit-logs?from=2026-10-01&to=2026-10-31');
    expect(all.status).toBe(200);
    expect(all.body.data.map((log: { requestId: string }) => log.requestId)).toEqual(['r2', 'r1']);
    expect(all.body.meta).toMatchObject({ page: 1, total: 2 });
    const users = await admin.agent.get('/api/v1/audit-logs?from=2026-10-01&to=2026-10-31&action=user.create');
    expect(users.body.data.map((log: { requestId: string }) => log.requestId)).toEqual(['r1']);
  });
});

// Logs are written after the response is sent.
async function logOf(filter: Record<string, unknown>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const log = await AuditLog.findOne(filter).lean();
    if (log) return log;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return null;
}

describe('admin access control', () => {
  it.each(['/api/v1/dashboard/summary', '/api/v1/audit-logs', '/api/v1/users', '/api/v1/imports'])('GET %s: admin 200, user 403, guest 401', async url => {
    expect((await admin.agent.get(url)).status).toBe(200);
    expect((await member.agent.get(url)).status).toBe(403);
    expect((await guest.get(url)).status).toBe(401);
  });
  it('refuses admin writes from a user account', async () => {
    expect((await write(member, 'post', '/api/v1/imports/preview').attach('file', await workbook([[7, 28, 4, 12, 5.6, 0.3, 0.1, 4600]]), 'a.xlsx')).status).toBe(403);
    expect((await write(member, 'post', '/api/v1/users').send({ name: 'Nope', email: 'nope@example.test', password: PASSWORD })).status).toBe(403);
  });
});

describe('dashboard summary', () => {
  it('counts documents created in the selected days', async () => {
    const target = await station();
    const createdBy = new mongoose.Types.ObjectId();
    const inside = new Date('2026-06-15T12:00:00+07:00');
    const outside = new Date('2026-08-15T12:00:00+07:00');
    const record = (status: string, createdAt: Date, day: number) => ({ stationId: target._id, measuredAt: new Date(2025, 0, day), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', validationStatus: status, source: { kind: 'manual' }, createdBy, version: 1, createdAt });
    await WaterRecord.collection.insertMany([record('pending', inside, 1), record('verified', inside, 2), record('verified', inside, 3), record('rejected', outside, 4)]);
    await ImportBatch.collection.insertMany([
      { fileName: 'a.xlsx', contentHash: 'c'.repeat(64), rowCount: 5, issueCount: 1, status: 'ready', uploadedBy: createdBy, createdAt: inside },
      { fileName: 'b.xlsx', contentHash: 'd'.repeat(64), rowCount: 7, issueCount: 0, status: 'ready', uploadedBy: createdBy, createdAt: outside },
    ]);
    await Station.collection.updateOne({ _id: target._id }, { $set: { createdAt: inside } });
    const response = await admin.agent.get('/api/v1/dashboard/summary?from=2026-06-01&to=2026-06-30');
    expect(response.status).toBe(200);
    const range = createdRange({ from: '2026-06-01', to: '2026-06-30' });
    expect(response.body.data).toEqual({
      users: { total: await User.countDocuments(range), active: await User.countDocuments({ ...range, isActive: true }), admins: await User.countDocuments({ ...range, role: 'admin' }) },
      stations: { active: 1 }, imports: { batches: 1, rows: 5 }, records: { pending: 1, verified: 2, rejected: 0 }, predictions: 0,
    });
  });
});

describe('FR-08 output is public', () => {
  it('shows a verified record of an active station to a guest, but not a pending one', async () => {
    const target = await station();
    const createdBy = new mongoose.Types.ObjectId();
    const base = { stationId: target._id, parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', source: { kind: 'manual' }, createdBy };
    await WaterRecord.create([{ ...base, measuredAt: new Date('2025-01-01'), validationStatus: 'verified' }, { ...base, measuredAt: new Date('2025-01-02') }]);
    const response = await guest.get('/api/v1/water-records');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ validationStatus: 'verified', parameters: base.parameters });
  });
});

describe('admin actions are logged', () => {
  beforeEach(() => AuditLog.deleteMany({}));
  it('logs account creation, a failed login without the typed e-mail, and a refused self lock', async () => {
    const created = await write(admin, 'post', '/api/v1/users').send({ name: 'Logged User', email: 'logged@example.test', password: PASSWORD, role: 'user' });
    expect(created.status).toBe(201);
    const adminId = (await User.findOne({ email: 'admin@example.test' }))!.id;
    expect(await logOf({ action: 'user.create' })).toMatchObject({ outcome: 'success', status: 201, target: created.body.data._id, actorId: new mongoose.Types.ObjectId(adminId) });
    const csrf = (await guest.get('/api/v1/auth/csrf')).body.data.csrfToken;
    expect((await guest.post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-CSRF-Token', csrf).send({ email: 'user@example.test', password: 'wrong-password' })).status).toBe(401);
    const failed = await logOf({ action: 'auth.login' });
    expect(failed).toMatchObject({ outcome: 'failure', status: 401, actorId: null });
    expect(JSON.stringify(failed)).not.toContain('user@example.test');
    const locked = await write(admin, 'patch', `/api/v1/users/${adminId}`).send({ isActive: false });
    expect(locked.body.error.code).toBe('SELF_LOCKOUT');
    expect(await logOf({ action: 'user.lock' })).toMatchObject({ outcome: 'failure', status: 409, target: adminId });
  });
  it('logs a rejected preview, station creation and record review', async () => {
    const sixColumns = await workbook([[7, 28, 4, 12, 5.6, 0.3]], ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni']);
    const preview = await write(admin, 'post', '/api/v1/imports/preview').attach('file', sixColumns, 'six.xlsx');
    expect(preview.body.error.code).toBe('INVALID_WORKBOOK');
    expect(await logOf({ action: 'import.preview' })).toMatchObject({ outcome: 'failure', status: 400 });
    const created = await write(admin, 'post', '/api/v1/stations').send({ code: 'AKH-LOG', name: 'Logged station', administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] } });
    expect(created.status).toBe(201);
    expect(await logOf({ action: 'station.create' })).toMatchObject({ outcome: 'success', target: created.body.data._id });
    const record = await WaterRecord.create({ stationId: created.body.data._id, measuredAt: new Date(), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', source: { kind: 'manual' }, createdBy: new mongoose.Types.ObjectId() });
    expect((await write(admin, 'patch', `/api/v1/water-records/${record.id}/validation`).send({ status: 'verified', note: 'Đã đối chiếu', version: 1 })).status).toBe(200);
    expect(await logOf({ action: 'record.review' })).toMatchObject({ outcome: 'success', target: record.id });
  });
});

describe('admin lists filter by creation day', () => {
  it('returns users created in range with createdAt and without secrets', async () => {
    await User.collection.insertOne({ name: 'January User', email: 'jan@example.test', passwordHash: 'x', role: 'user', isActive: true, createdAt: new Date('2026-01-15T09:00:00+07:00'), updatedAt: new Date() });
    const response = await admin.agent.get('/api/v1/users?from=2026-01-01&to=2026-01-31');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ email: 'jan@example.test', createdAt: '2026-01-15T02:00:00.000Z' });
    expect(response.body.data[0].passwordHash).toBeUndefined();
    expect(response.body.meta.total).toBe(1);
  });
  it('filters import batches and admin water records by creation day', async () => {
    const uploadedBy = new mongoose.Types.ObjectId();
    await ImportBatch.collection.insertMany([
      { fileName: 'in.xlsx', contentHash: 'a'.repeat(64), rowCount: 3, issueCount: 0, status: 'ready', uploadedBy, createdAt: new Date('2026-03-10T08:00:00+07:00') },
      { fileName: 'out.xlsx', contentHash: 'b'.repeat(64), rowCount: 3, issueCount: 0, status: 'ready', uploadedBy, createdAt: new Date('2026-04-10T08:00:00+07:00') },
    ]);
    const batches = await admin.agent.get('/api/v1/imports?from=2026-03-01&to=2026-03-31');
    expect(batches.body.data.map((batch: { fileName: string }) => batch.fileName)).toEqual(['in.xlsx']);
    const target = await station();
    const base = { stationId: target._id, parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', validationStatus: 'pending', source: { kind: 'manual' }, createdBy: uploadedBy, version: 1 };
    await WaterRecord.collection.insertMany([
      { ...base, measuredAt: new Date('2025-01-01'), createdAt: new Date('2026-03-10T08:00:00+07:00') },
      { ...base, measuredAt: new Date('2025-01-02'), createdAt: new Date('2026-04-10T08:00:00+07:00') },
    ]);
    const records = await admin.agent.get('/api/v1/water-records?status=pending&createdFrom=2026-03-01&createdTo=2026-03-31');
    expect(records.body.meta.total).toBe(1);
  });
});

describe('record detail', () => {
  it('returns the record with station, people and its raw source row, for admins only', async () => {
    const target = await station();
    const adminUser = (await User.findOne({ email: 'admin@example.test' }))!;
    const batch = await ImportBatch.create({ fileName: 'detail.xlsx', contentHash: 'e'.repeat(64), rowCount: 1, issueCount: 0, status: 'ready', uploadedBy: adminUser._id });
    const values = { PH: 7.2, Temp: 28, BOD5: 4, COD: 12, DO: 5.6, Amoni: 0.3, Phosphat: 0.1, Coliforms: 4600 };
    const row = await ImportedRow.create({ batchId: batch._id, rowNumber: 2, values, issues: [] });
    const record = await WaterRecord.create({ stationId: target._id, measuredAt: new Date('2026-05-10T01:00:00Z'), parameters: { coliform: 4600, nh4: 0.3, ph: 7.2, po4: 0.1, do: 5.6, cod: 12 }, unitBasis: 'training-source-unverified', validationStatus: 'verified', reviewedBy: adminUser._id, reviewedAt: new Date(), reviewNote: 'Đã đối chiếu', source: { kind: 'excel', rowId: row._id, note: 'Phiếu đo số 1 thử nghiệm' }, createdBy: adminUser._id });
    const response = await admin.agent.get(`/api/v1/water-records/${record.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      stationId: { code: 'AKH-T1' }, createdBy: { name: 'Admin Test' }, reviewedBy: { name: 'Admin Test' }, reviewNote: 'Đã đối chiếu',
      source: { kind: 'excel', note: 'Phiếu đo số 1 thử nghiệm', rowId: { rowNumber: 2, values, batchId: { fileName: 'detail.xlsx' } } },
    });
    expect(JSON.stringify(response.body.data)).not.toContain('passwordHash');
    expect((await member.agent.get(`/api/v1/water-records/${record.id}`)).status).toBe(403);
    expect((await guest.get(`/api/v1/water-records/${record.id}`)).status).toBe(401);
    expect((await admin.agent.get(`/api/v1/water-records/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
});

describe('admin import uses the prediction column rules', () => {
  const preview = (file: Buffer) => write(admin, 'post', '/api/v1/imports/preview').attach('file', file, 'rules.xlsx');
  it('accepts the six model columns in any order and leaves Temp and BOD5 empty', async () => {
    const file = await workbook([[4600, 5.6, 7.2, 12, 0.1, 0.3]], ['Coliforms', 'DO', 'PH', 'COD', 'Phosphat', 'Amoni']);
    const response = await preview(file);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ rowCount: 1, issueCount: 0 });
    expect(response.body.data.rows[0].values).toMatchObject({ PH: 7.2, Coliforms: 4600, Temp: null, BOD5: null });
    expect((await write(admin, 'post', '/api/v1/imports/commit').attach('file', file, 'rules.xlsx')).status).toBe(201);
  });
  it('accepts all eight columns in a different order', async () => {
    const file = await workbook([[28, 4, 4600, 5.6, 7.2, 12, 0.1, 0.3]], ['Temp', 'BOD5', 'Coliforms', 'DO', 'PH', 'COD', 'Phosphat', 'Amoni']);
    expect((await preview(file)).body.data).toMatchObject({ rowCount: 1, issueCount: 0 });
  });
  it('rejects a missing model column or a duplicated column name, with the six-column message', async () => {
    const missing = await preview(await workbook([[7, 5.6, 0.3, 0.1, 4600]], ['PH', 'DO', 'Amoni', 'Phosphat', 'Coliforms']));
    expect(missing.body.error.code).toBe('INVALID_WORKBOOK');
    const duplicated = await preview(await workbook([[7, 12, 5.6, 0.3, 0.1, 4600, 8]], ['PH', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms', 'PH']));
    expect(duplicated.body.error.code).toBe('INVALID_WORKBOOK');
    expect(apiErrorMessage(400, 'INVALID_WORKBOOK')).toContain('PH, COD, DO, Amoni, Phosphat, Coliforms');
  });
  it('skips blank rows, flags formula and text only in model columns, ignores a text Temp', async () => {
    const header = ['PH', 'Temp', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms'];
    const file = await workbook([[7, 'n/a', 12, 5.6, 0.3, 0.1, 4600], [null, null, null, null, null, null, null], [7, 28, 12, 5.6, { formula: '0.1+0.2', result: 0.3 } as never, 0.1, 4600]], header);
    const response = await preview(file);
    expect(response.status).toBe(200);
    expect(response.body.data.rowCount).toBe(2);
    expect(response.body.data.rows[0].issues).toEqual([]);
    expect(response.body.data.rows[1].issues.join()).toContain('Amoni:');
  });
});

describe('import normalization copies the six CatBoost parameters from raw values', () => {
  it('creates a pending record with the raw numbers and rejects a row whose six values are invalid', async () => {
    const target = await station();
    const file = await workbook([[7.2, 28, 4, 12, 5.6, 0.3, 0.1, 4600], [7, 28, 4, 12, 5.6, 'abc', 0.1, 4600]]);
    const committed = await write(admin, 'post', '/api/v1/imports/commit').attach('file', file, 'akh.xlsx');
    expect(committed.status).toBe(201);
    const batchId = committed.body.data.batch._id;
    const rows = (await admin.agent.get(`/api/v1/imports/${batchId}/rows`)).body.data.rows;
    const body = { stationId: target.id, measuredAt: '2026-05-10T08:00:00+07:00', sourceNote: 'Phiếu đo thử nghiệm số 1' };
    const created = await write(admin, 'post', `/api/v1/imports/${batchId}/rows/${rows[0]._id}/normalize`).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ parameters: { ph: 7.2, do: 5.6, cod: 12, nh4: 0.3, po4: 0.1, coliform: 4600 }, unitBasis: 'training-source-unverified', validationStatus: 'pending' });
    const rejected = await write(admin, 'post', `/api/v1/imports/${batchId}/rows/${rows[1]._id}/normalize`).send(body);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('ROW_INVALID');
    expect(await WaterRecord.countDocuments()).toBe(1);
  });
});
