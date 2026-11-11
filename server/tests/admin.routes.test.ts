import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import session from 'express-session';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { importColumns, apiErrorMessage, batchStationMessage, USER_MESSAGES } from '@wqi/contracts';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Station } from '../src/modules/stations/station.model.js';
import { WaterRecord } from '../src/modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../src/modules/imports/import.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { AuditLog } from '../src/modules/audit/audit.model.js';
import { Setting } from '../src/modules/settings/settings.routes.js';
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
// Test rows follow the old lab-sheet column order on purpose: files with any column order must still import.
const LAB_RAW = ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms'];
const LAB_IMPORT = ['Mã đợt', 'Mã trạm', 'PH', 'DO', 'COD', 'Amoni', 'Phosphat', 'Coliforms', 'Temp', 'BOD5', 'Ghi chú', 'WQI'];
async function workbook(rows: (number | string | null)[][], header: readonly string[] = LAB_RAW) {
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
    const before = (await admin.agent.get('/api/v1/dashboard/summary')).body.data.queue;
    const record = (status: string, createdAt: Date, day: number) => ({ stationId: target._id, measuredAt: new Date(2025, 0, day), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', validationStatus: status, source: { kind: 'manual' }, createdBy, version: 1, createdAt });
    await WaterRecord.collection.insertMany([record('pending', inside, 1), record('verified', inside, 2), record('verified', inside, 3), record('rejected', outside, 4), record('pending', outside, 5)]);
    // Legacy batches have no batch code and stay hidden (decision 24).
    await ImportBatch.collection.insertMany([
      { code: 'D01-2026', fileName: 'a.xlsx', rowCount: 5, issueCount: 1, status: 'ready', uploadedBy: createdBy, createdAt: inside },
      { code: 'D02-2026', fileName: 'b.xlsx', rowCount: 7, issueCount: 0, status: 'ready', uploadedBy: createdBy, createdAt: outside },
      { fileName: 'legacy.xlsx', contentHash: 'e'.repeat(64), rowCount: 9, issueCount: 0, status: 'ready', uploadedBy: createdBy, createdAt: inside },
    ]);
    await Station.collection.updateOne({ _id: target._id }, { $set: { createdAt: inside } });
    const response = await admin.agent.get('/api/v1/dashboard/summary?from=2026-06-01&to=2026-06-30');
    expect(response.status).toBe(200);
    const range = createdRange({ from: '2026-06-01', to: '2026-06-30' });
    const { queue, ...counts } = response.body.data;
    expect(counts).toEqual({
      users: { total: await User.countDocuments(range), active: await User.countDocuments({ ...range, isActive: true }), admins: await User.countDocuments({ ...range, role: 'admin' }) },
      stations: { active: 1 }, imports: { batches: 1, rows: 5 }, records: { pending: 1, verified: 2, rejected: 0, locked: 0 }, predictions: 0,
    });
    // The work queue ignores the selected days: older pending work must not disappear from the dashboard.
    expect(queue).toEqual({ pendingRecords: before.pendingRecords + 2 });
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
    expect(preview.body.error.code).toBe('INVALID_IMPORT_WORKBOOK');
    expect(await logOf({ action: 'import.preview' })).toMatchObject({ outcome: 'failure', status: 400 });
    const created = await write(admin, 'post', '/api/v1/stations').send({ code: 'AKH-LOG', name: 'Logged station', administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] } });
    expect(created.status).toBe(201);
    expect(await logOf({ action: 'station.create' })).toMatchObject({ outcome: 'success', target: created.body.data._id });
    const record = await WaterRecord.create({ stationId: created.body.data._id, measuredAt: new Date(), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', source: { kind: 'manual' }, createdBy: new mongoose.Types.ObjectId() });
    expect((await write(admin, 'patch', `/api/v1/water-records/${record.id}/validation`).send({ status: 'verified', note: 'Đã đối chiếu', version: 1 })).status).toBe(200);
    expect(await logOf({ action: 'record.review' })).toMatchObject({ outcome: 'success', target: record.id });
  });
});

describe('reviewing a record', () => {
  const pending = async () => WaterRecord.create({ stationId: (await station())._id, measuredAt: new Date(), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', source: { kind: 'manual' }, createdBy: new mongoose.Types.ObjectId() });
  const review = (id: string, body: object) => write(admin, 'patch', `/api/v1/water-records/${id}/validation`).send({ version: 1, ...body });

  it('approves without a note', async () => {
    const record = await pending();
    const response = await review(record.id, { status: 'verified' });
    expect(response.status).toBe(200);
    expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: 'verified', reviewNote: null });
  });
  it.each([undefined, '', '  ', 'ab'])('refuses to reject with the note %j', async note => {
    const record = await pending();
    expect((await review(record.id, { status: 'rejected', ...(note === undefined ? {} : { note }) })).status).toBe(400);
    expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: 'pending' });
  });
  it('rejects with a reason', async () => {
    const rejected = await pending();
    expect((await review(rejected.id, { status: 'rejected', note: 'Sai số pH' })).status).toBe(200);
    expect(await WaterRecord.findById(rejected.id).lean()).toMatchObject({ validationStatus: 'rejected', reviewNote: 'Sai số pH' });
  });
  it('keeps an optional approval note', async () => {
    const approved = await pending();
    expect((await review(approved.id, { status: 'verified', note: 'Đã đối chiếu' })).status).toBe(200);
    expect(await WaterRecord.findById(approved.id).lean()).toMatchObject({ reviewNote: 'Đã đối chiếu' });
  });

  describe('locking a published record', () => {
    const published = async () => WaterRecord.create({ stationId: (await station())._id, measuredAt: new Date(), parameters: { coliform: 1, nh4: 1, ph: 7, po4: 1, do: 1, cod: 1 }, unitBasis: 'training-source-unverified', source: { kind: 'manual' }, createdBy: new mongoose.Types.ObjectId(), validationStatus: 'verified', wqi: 62, qualityClass: 'Trung bình' });
    const publicIds = async () => (await guest.get('/api/v1/water-records')).body.data.map((row: { _id: string }) => row._id);

    it.each([undefined, '', 'ab'])('refuses to lock with the note %j', async note => {
      const record = await published();
      expect((await review(record.id, { status: 'locked', ...(note === undefined ? {} : { note }) })).status).toBe(400);
      expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: 'verified' });
    });
    it('hides a locked record from guests and brings it back, with the same WQI, when unlocked', async () => {
      const record = await published();
      expect(await publicIds()).toEqual([record.id]);
      expect((await review(record.id, { status: 'locked', note: 'Chờ kiểm tra lại mẫu' })).status).toBe(200);
      expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: 'locked', reviewNote: 'Chờ kiểm tra lại mẫu', version: 2 });
      expect(await publicIds()).toEqual([]);
      expect((await admin.agent.get('/api/v1/water-records?status=locked')).body.data.map((row: { _id: string }) => row._id)).toEqual([record.id]);
      expect((await review(record.id, { status: 'verified', version: 2 })).status).toBe(200);
      expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: 'verified', wqi: 62, qualityClass: 'Trung bình', version: 3 });
      expect(await publicIds()).toEqual([record.id]);
    });
    it.each([
      ['a pending record is locked', 'pending', 'locked'],
      ['a rejected record is approved', 'rejected', 'verified'],
      ['a published record is rejected', 'verified', 'rejected'],
      ['a locked record is rejected', 'locked', 'rejected'],
    ])('answers RECORD_STATE when %s', async (_name, from, to) => {
      const record = await published();
      await WaterRecord.updateOne({ _id: record._id }, { validationStatus: from });
      const response = await review(record.id, { status: to, note: 'Lý do rõ ràng' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RECORD_STATE');
      expect(await WaterRecord.findById(record.id).lean()).toMatchObject({ validationStatus: from, version: 1 });
    });
    it('still reports a stale version as RECORD_CHANGED', async () => {
      const record = await published();
      const response = await review(record.id, { status: 'locked', note: 'Lý do rõ ràng', version: 9 });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('RECORD_CHANGED');
    });
  });
});

describe('system settings: QCVN column', () => {
  beforeEach(() => Setting.deleteMany({}));
  it('defaults to column A2 for everyone, guests included', async () => {
    const response = await guest.get('/api/v1/settings');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ qcvnColumn: 'A2', version: 0, updatedAt: null });
  });
  it('lets only an admin save, logs it, and refuses a stale version', async () => {
    expect((await write(member, 'patch', '/api/v1/settings').send({ qcvnColumn: 'B1', version: 0 })).status).toBe(403);
    expect((await write(admin, 'patch', '/api/v1/settings').send({ qcvnColumn: 'C1', version: 0 })).status).toBe(400);
    const first = await write(admin, 'patch', '/api/v1/settings').send({ qcvnColumn: 'B1', version: 0 });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ qcvnColumn: 'B1', version: 1 });
    expect((await guest.get('/api/v1/settings')).body.data).toMatchObject({ qcvnColumn: 'B1', version: 1 });
    expect(await logOf({ action: 'settings.update', outcome: 'success' })).toMatchObject({ status: 200, target: 'qcvnColumn:B1' });
    // An admin still holding an older version must reload first.
    const stale = await write(admin, 'patch', '/api/v1/settings').send({ qcvnColumn: 'A1', version: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('RECORD_CHANGED');
    expect((await write(admin, 'patch', '/api/v1/settings').send({ qcvnColumn: 'B2', version: 1 })).body.data).toMatchObject({ qcvnColumn: 'B2', version: 2 });
    expect((await write(admin, 'patch', '/api/v1/settings').send({ qcvnColumn: 'A1', version: 1 })).status).toBe(409);
  });
});

describe('searching accounts', () => {
  const emails = (body: { data: { email: string }[] }) => body.data.map(user => user.email).sort();
  beforeAll(async () => {
    await User.collection.insertMany([
      { name: 'Lê Thu Hà', email: 'ha@example.test', passwordHash: 'x', role: 'user', isActive: true, createdAt: new Date('2020-01-01'), updatedAt: new Date() },
      { name: 'Phạm Bảo', email: 'bao.pham@sample.test', passwordHash: 'x', role: 'user', isActive: true, createdAt: new Date('2020-01-02'), updatedAt: new Date() },
    ]);
  });
  it('finds by part of a name or an email, ignoring case, with a matching total', async () => {
    const byName = await admin.agent.get(`/api/v1/users?q=${encodeURIComponent('thu hà')}&limit=1`);
    expect(emails(byName.body)).toEqual(['ha@example.test']);
    expect(byName.body.meta.total).toBe(1);
    expect(emails((await admin.agent.get('/api/v1/users?q=BAO.PHAM')).body)).toEqual(['bao.pham@sample.test']);
  });
  it('treats special characters as plain text', async () => {
    expect((await admin.agent.get(`/api/v1/users?q=${encodeURIComponent('.*')}`)).body.data).toEqual([]);
  });
  it('still respects the date filter', async () => {
    expect((await admin.agent.get('/api/v1/users?q=ha@&from=2021-01-01')).body.data).toEqual([]);
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
      { code: 'D03-2026', fileName: 'in.xlsx', rowCount: 3, issueCount: 0, status: 'ready', uploadedBy, createdAt: new Date('2026-03-10T08:00:00+07:00') },
      { code: 'D04-2026', fileName: 'out.xlsx', rowCount: 3, issueCount: 0, status: 'ready', uploadedBy, createdAt: new Date('2026-04-10T08:00:00+07:00') },
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

// Decision 24 as changed by the user on 29/10 and 31/10: no sampling date; a batch belongs to one station and holds many rows,
// a station has many batches; a file with the six parameters is accepted; an existing batch is skipped unless the admin chooses to overwrite it.
describe('Excel import by batch code', () => {
  type Cell = number | string | null;
  const sample = (code: Cell, stationCode: string, ph: Cell = 7.2, note: Cell = null): Cell[] => [code, stationCode, ph, 5.6, 18, 0.25, 0.12, 4600, 27.5, null, note];
  const file = (rows: Cell[][], header: readonly string[] = LAB_IMPORT) => workbook(rows, header);
  type Fill = [number, string, string];
  const preview = (buffer: Buffer, fills: Fill[] = []) => {
    const call = write(admin, 'post', '/api/v1/imports/preview');
    if (fills.length) call.field('fills', JSON.stringify(fills));
    return call.attach('file', buffer, 'dot.xlsx');
  };
  const commit = (buffer: Buffer, confirm: string[] = [], fills: Fill[] = []) => {
    const call = write(admin, 'post', '/api/v1/imports/commit');
    if (confirm.length) call.field('confirm', confirm.join(','));
    if (fills.length) call.field('fills', JSON.stringify(fills));
    return call.attach('file', buffer, 'dot.xlsx');
  };
  const SIX = ['PH', 'DO', 'COD', 'Amoni', 'Phosphat', 'Coliforms'];
  const six = (ph: Cell = 7.2): Cell[] => [ph, 5.6, 18, 0.25, 0.12, 4600];
  const binary = (res: NodeJS.ReadableStream, done: (error: Error | null, body: Buffer) => void) => { const chunks: Buffer[] = []; res.on('data', (chunk: Buffer) => chunks.push(chunk)); res.on('end', () => done(null, Buffer.concat(chunks))); };
  beforeEach(async () => {
    await Station.create(['AH1', 'AH2', 'AH3', 'AH9'].map(code => ({ code, name: `Station ${code}`, administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive: code !== 'AH9' })));
  });

  it('serves a template whose header and three examples, one with decimal commas, import as two batches', async () => {
    const template = await admin.agent.get('/api/v1/imports/template').buffer(true).parse(binary);
    expect(template.status).toBe(200);
    expect(template.headers['content-type']).toContain('spreadsheetml');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(template.body);
    const sheet = book.worksheets[0];
    expect((sheet.getRow(1).values as Cell[]).slice(1)).toEqual([...importColumns]);
    expect(sheet.actualRowCount).toBe(4);
    expect(sheet.getRow(2).getCell(3).value).toBe(4600);
    expect(sheet.getRow(3).getCell(5).value).toBe('6,9');
    const saved = await commit(template.body);
    expect(saved.status).toBe(201);
    expect(saved.body.data.batches).toEqual([
      { code: 'D01-2026', created: true, added: 2, overwritten: 0, issueCount: 0 },
      { code: 'D02-2026', created: true, added: 1, overwritten: 0, issueCount: 0 },
    ]);
    const records = await WaterRecord.find().populate<{ stationId: { code: string } }>('stationId', 'code').lean();
    expect(records.map(record => `${record.batchCode} ${record.stationId.code} ${record.validationStatus} ${record.measuredAt}`).sort())
      .toEqual(['D01-2026 AH1 pending null', 'D01-2026 AH1 pending null', 'D02-2026 AH2 pending null']);
    expect(records.find(record => record.parameters.ph === 6.9)!.parameters).toMatchObject({ ph: 6.9, do: 5.2, nh4: 0.31, po4: 0.1 });
  });

  it('previews per batch, rejects rows without a valid code and flags station and value issues', async () => {
    const response = await preview(await file([
      sample('d01-2026', ' ah1 ', '7,2'), sample(null, 'AH1'), sample('D01-2026', 'AH1'), sample('D02-2026', 'AH2'),
      sample('D01-2026', 'AH1', 'abc'), sample('X', 'AH1'), sample('D01-2026', 'AH3'), sample('D03-2026', 'AH9'), sample('D04-2026', 'AH7'),
    ]));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      rowCount: 9, confirm: [],
      batches: [
        { code: 'D01-2026', rowCount: 4, stations: ['AH1', 'AH3'], issueCount: 2, validCount: 2, replaces: 0, existing: null },
        { code: 'D02-2026', rowCount: 1, stations: ['AH2'], issueCount: 0, validCount: 1, replaces: 0, existing: null },
        { code: 'D03-2026', issueCount: 1, validCount: 0 }, { code: 'D04-2026', issueCount: 1, validCount: 0 },
      ],
      rejected: [{ rowNumber: 3, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }, { rowNumber: 7, reason: USER_MESSAGES.BATCH_CODE_INVALID }],
    });
    expect(Object.fromEntries(response.body.data.rows.map((row: { rowNumber: number; issues: string[] }) => [row.rowNumber, row.issues]))).toEqual({
      6: [`PH: ${USER_MESSAGES.INVALID_NUMBER}`], 8: [`Mã trạm: ${batchStationMessage('AH1', 2)}`],
      9: [`Mã trạm: ${USER_MESSAGES.STATION_UNKNOWN}`], 10: [`Mã trạm: ${USER_MESSAGES.STATION_UNKNOWN}`],
    });
    expect(await WaterRecord.countDocuments()).toBe(0);
  });

  it('saves many rows of one batch at one station, and many batches at the same station', async () => {
    const saved = await commit(await file([sample('D01-2026', 'AH1', 7.1), sample('D01-2026', 'AH1', 7.2), sample('D01-2026', 'AH1', 7.3), sample('D02-2026', 'AH1', 7.4), sample('D02-2026', 'AH1', 7.5)]));
    expect(saved.status).toBe(201);
    expect(saved.body.data.batches).toEqual([
      { code: 'D01-2026', created: true, added: 3, overwritten: 0, issueCount: 0 },
      { code: 'D02-2026', created: true, added: 2, overwritten: 0, issueCount: 0 },
    ]);
    const ah1 = (await Station.findOne({ code: 'AH1' }))!._id;
    expect(await WaterRecord.countDocuments({ stationId: ah1 })).toBe(5);
    expect(await WaterRecord.countDocuments({ batchCode: 'D01-2026', stationId: ah1 })).toBe(3);
  });

  it('reads trimmed, case-insensitive, NFC-normalized headers and needs only the six parameters', async () => {
    const header = ['  mã ĐỢT '.normalize('NFD'), 'MÃ TRẠM', 'coliforms', 'ph', 'do', 'cod', 'AMONI', 'phosphat'];
    const response = await preview(await file([['D01-2026', 'AH1', 4600, 7.2, 5.6, 18, 0.25, 0.12]], header));
    expect(response.body.data.batches).toMatchObject([{ code: 'D01-2026', stations: ['AH1'], validCount: 1, issueCount: 0 }]);
    expect(response.body.data.missing).toEqual([]);
    for (const absent of SIX) {
      const rejected = await preview(await file([six()], SIX.filter(name => name !== absent)));
      expect(rejected.body.error.code).toBe('INVALID_IMPORT_WORKBOOK');
    }
    expect((await preview(await file([six()], SIX))).status).toBe(200);
    expect(apiErrorMessage(400, 'INVALID_IMPORT_WORKBOOK')).toContain('Coliforms, Amoni, PH, Phosphat, DO, COD;');
    expect(apiErrorMessage(400, 'INVALID_IMPORT_WORKBOOK')).toContain('Mã đợt and Mã trạm are also required: if the file lacks them, you fill them in after it is read.');
  });

  it('lists rows missing a code or station, the stations that can be chosen and the codes written beside the rows', async () => {
    const checked = (await preview(await file([[...six(), 'D9-2018'], six(), six()], [...SIX, '']))).body.data;
    expect(checked.rowCount).toBe(3);
    expect(checked.missing).toEqual([
      { rowNumber: 2, code: '', station: '', label: 'D9-2018' },
      { rowNumber: 3, code: '', station: '' },
      { rowNumber: 4, code: '', station: '' },
    ]);
    expect(checked.stations).toEqual(['AH1', 'AH2', 'AH3']);
    expect(checked.batches).toEqual([]);
    expect(checked.rejected).toHaveLength(3);
    const free = (await preview(await file([[...six(), 'free text']], [...SIX, '']))).body.data;
    expect(free.missing).toEqual([{ rowNumber: 2, code: '', station: '' }]);
  });

  it('orders the stations to choose from by number, so AH10 comes after AH3', async () => {
    await Station.create({ code: 'AH10', name: 'Station AH10', administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] } });
    expect((await preview(await file([six()], SIX))).body.data.stations).toEqual(['AH1', 'AH2', 'AH3', 'AH10']);
  });

  it('saves filled-in codes and stations, keeps what the file says and rejects rows left without a code', async () => {
    const buffer = await file([six(7.1), six(7.2), six(7.3), six(7.4)], SIX);
    const fills: Fill[] = [[2, 'd9-2018', 'ah1'], [3, 'D9-2018', 'AH1'], [4, 'D9-2018', 'AH1'], [5, '', 'AH1']];
    const checked = (await preview(buffer, fills)).body.data;
    expect(checked.batches).toMatchObject([{ code: 'D9-2018', stations: ['AH1'], validCount: 3, issueCount: 0 }]);
    expect(checked.rejected).toEqual([{ rowNumber: 5, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }]);
    expect(checked.rows).toEqual([]);
    expect(checked.missing).toHaveLength(4);
    const saved = await commit(buffer, [], fills);
    expect(saved.status).toBe(201);
    expect(saved.body.data.batches).toEqual([{ code: 'D9-2018', created: true, added: 3, overwritten: 0, issueCount: 0 }]);
    expect((await ImportedRow.find().sort({ rowNumber: 1 }).lean()).map(row => [(row.values as Record<string, unknown>)['Mã đợt'], (row.values as Record<string, unknown>)['Mã trạm']])).toEqual([['D9-2018', 'AH1'], ['D9-2018', 'AH1'], ['D9-2018', 'AH1']]);

    const written = await file([sample('D10-2026', 'AH1'), sample(null, null as unknown as string)]);
    const kept = await commit(written, [], [[2, 'OTHER', 'AH2'], [3, 'D10-2026', 'AH1']]);
    expect(kept.body.data.batches).toEqual([{ code: 'D10-2026', created: true, added: 2, overwritten: 0, issueCount: 0 }]);
    expect((await ImportBatch.countDocuments({ code: 'OTHER' }))).toBe(0);
  });

  it('flags an inactive station chosen for a batch', async () => {
    const checked = (await preview(await file([six()], SIX), [[2, 'D8-2018', 'AH9']])).body.data;
    expect(checked.rows.map((row: { issues: string[] }) => row.issues)).toEqual([[`Mã trạm: ${USER_MESSAGES.STATION_UNKNOWN}`]]);
  });

  it('says a station is missing, not unknown, when the cell is empty and nothing was chosen', async () => {
    const checked = (await preview(await file([six()], SIX), [[2, 'D9-2018', '']])).body.data;
    expect(checked.rows.map((row: { issues: string[] }) => row.issues)).toEqual([[`Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}`]]);
  });

  it('returns every row with an error, so the details can show them all', async () => {
    const buffer = await file(Array.from({ length: 150 }, () => six()), SIX);
    const fills = Array.from({ length: 150 }, (_, index): Fill => [index + 2, 'D9-2018', '']);
    expect((await preview(buffer, fills)).body.data.rows).toHaveLength(150);
  });

  it.each(['not json', '[[1,2,3]]', JSON.stringify([[2, 'x'.repeat(41), 'AH1']])])('refuses a malformed fills field: %s', async fills => {
    const response = await write(admin, 'post', '/api/v1/imports/preview').field('fills', fills).attach('file', await file([six()], SIX), 'dot.xlsx');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('saves only valid rows as pending records with the batch code, source file and a note', async () => {
    const saved = await commit(await file([sample('D01-2026', 'AH1', 7.2, 'Phiếu 00826'), sample('D01-2026', 'AH1'), sample(null, 'AH2'), sample('D01-2026', 'AH1', -1)]));
    expect(saved.status).toBe(201);
    expect(saved.body.data).toMatchObject({ batches: [{ code: 'D01-2026', created: true, added: 2, overwritten: 0, issueCount: 1 }], rejected: [{ rowNumber: 4 }] });
    const records = await WaterRecord.find().sort({ 'source.note': 1 }).lean();
    expect(records.map(record => [record.validationStatus, record.batchCode, record.measuredAt, record.source?.kind, record.source?.note])).toEqual([
      ['pending', 'D01-2026', null, 'excel', 'Phiếu 00826'],
      ['pending', 'D01-2026', null, 'excel', 'dot.xlsx · D01-2026 · dòng 3'],
    ]);
    const rows = await ImportedRow.find().lean();
    expect(rows.map(row => [row.fileName, row.rowNumber, (row.values as Record<string, unknown>)['Mã đợt']])).toEqual([['dot.xlsx', 2, 'D01-2026'], ['dot.xlsx', 3, 'D01-2026']]);
    expect(await ImportBatch.findOne({ code: 'D01-2026' }).lean()).toMatchObject({ rowCount: 2, fileName: 'dot.xlsx' });
  });

  it('skips an existing batch unless the admin chose to overwrite it, and still saves the others', async () => {
    expect((await commit(await file([sample('D01-2026', 'AH1'), sample('D01-2026', 'AH1')]))).status).toBe(201);
    await WaterRecord.updateMany({}, { $set: { validationStatus: 'verified', reviewNote: 'Đã đối chiếu' } });
    const second = await file([sample('D01-2026', 'AH1', '7,4'), sample('D01-2026', 'AH1'), sample('D01-2026', 'AH1'), sample('D02-2026', 'AH1')]);
    const checked = (await preview(second)).body.data;
    expect(checked.batches[0]).toMatchObject({ code: 'D01-2026', validCount: 3, replaces: 2, existing: { rowCount: 2, uploadedBy: { name: 'Admin Test' } } });
    expect(checked.confirm).toEqual(['D01-2026', 'D01-2026|2']);
    const skipped = await commit(second);
    expect(skipped.status).toBe(201);
    expect(skipped.body.data.batches).toEqual([
      { code: 'D01-2026', created: false, added: 0, overwritten: 0, issueCount: 0, skipped: 3 },
      { code: 'D02-2026', created: true, added: 1, overwritten: 0, issueCount: 0 },
    ]);
    expect(await WaterRecord.countDocuments({ batchCode: 'D01-2026', validationStatus: 'verified' })).toBe(2);
    expect(await WaterRecord.countDocuments({ batchCode: 'D01-2026' })).toBe(2);
    // A batch that changed since the admin looked at it is skipped too, never overwritten unseen.
    expect((await commit(second, ['D01-2026', 'D01-2026|9', 'D02-2026', 'D02-2026|1'])).body.data.batches[0]).toMatchObject({ skipped: 3 });
    expect(await WaterRecord.countDocuments({ batchCode: 'D01-2026' })).toBe(2);
    const saved = await commit(second, checked.confirm.concat('D02-2026', 'D02-2026|1'));
    expect(saved.status).toBe(201);
    expect(saved.body.data.batches).toEqual([
      { code: 'D01-2026', created: false, added: 1, overwritten: 2, issueCount: 0 },
      { code: 'D02-2026', created: false, added: 0, overwritten: 1, issueCount: 0 },
    ]);
    expect(await WaterRecord.countDocuments({ batchCode: 'D01-2026' })).toBe(3);
    expect(await WaterRecord.findOne({ batchCode: 'D01-2026', batchRow: 2 }).lean()).toMatchObject({ parameters: { ph: 7.4 }, validationStatus: 'pending', reviewNote: null, version: 2 });
    const batch = (await ImportBatch.findOne({ code: 'D01-2026' }).lean())!;
    expect(batch.rowCount).toBe(3);
    const rows = await ImportedRow.find({ batchId: batch._id }).lean();
    expect(rows.map(row => String((row.values as Record<string, unknown>).PH)).sort()).toEqual(['7,4', '7.2', '7.2']);
  });

  it('replaces the whole old batch when overwriting: no old row stays behind, and the station can change', async () => {
    await commit(await file([sample('D01-2026', 'AH1', 7.1), sample('D01-2026', 'AH1', 7.2), sample('D01-2026', 'AH1', 7.3)]));
    const saved = await commit(await file([sample('D01-2026', 'AH2', 7.9)]), ['D01-2026', 'D01-2026|3']);
    expect(saved.status).toBe(201);
    const records = await WaterRecord.find({ batchCode: 'D01-2026' }).populate<{ stationId: { code: string } }>('stationId', 'code').lean();
    expect(records.map(record => [record.stationId.code, record.parameters.ph])).toEqual([['AH2', 7.9]]);
    expect(await ImportedRow.countDocuments()).toBe(1);
    expect(await ImportBatch.findOne({ code: 'D01-2026' }).lean()).toMatchObject({ rowCount: 1 });
  });

  it('answers that nothing can be saved when every batch in the file is skipped', async () => {
    const buffer = await file([sample('D01-2026', 'AH1')]);
    await commit(buffer);
    const response = await commit(buffer);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_ROWS_TO_IMPORT');
  });

  it('never doubles records when the same file is committed twice at once', async () => {
    const buffer = await file([sample('D05-2026', 'AH1'), sample('D05-2026', 'AH1')]);
    await Promise.all([commit(buffer), commit(buffer)]);
    expect(await WaterRecord.countDocuments()).toBe(2);
    expect(await ImportBatch.countDocuments({ code: 'D05-2026' })).toBe(1);
    expect(await ImportedRow.countDocuments()).toBe(2);
  });

  it('lists only coded batches by code, hides legacy batches and their rows, and has no per-row record creation', async () => {
    const legacy = await ImportBatch.collection.insertOne({ fileName: 'old.xlsx', contentHash: 'f'.repeat(64), rowCount: 1, issueCount: 0, status: 'ready', uploadedBy: new mongoose.Types.ObjectId(), createdAt: new Date() });
    const legacyRow = await ImportedRow.collection.insertOne({ batchId: legacy.insertedId, rowNumber: 2, values: {}, issues: [], waterRecordId: null });
    await commit(await file([sample('D02-2026', 'AH1')]));
    await commit(await file([sample('D01-2026', 'AH1')]));
    const list = await admin.agent.get('/api/v1/imports');
    expect(list.body.data.map((batch: { code: string }) => batch.code)).toEqual(['D01-2026', 'D02-2026']);
    expect(list.body.meta.total).toBe(2);
    expect((await admin.agent.get(`/api/v1/imports/${legacy.insertedId}/rows`)).status).toBe(404);
    const rows = await admin.agent.get(`/api/v1/imports/${list.body.data[0]._id}/rows`);
    expect(rows.body.data.rows).toMatchObject([{ fileName: 'dot.xlsx', rowNumber: 2 }]);
    expect((await write(admin, 'post', `/api/v1/imports/${legacy.insertedId}/rows/${legacyRow.insertedId}/normalize`).send({})).status).toBe(404);
  });
});
describe('stations show their newest approved batch (decision 28)', () => {
  const place = (code: string, isActive = true) => Station.create({ code, name: `Station ${code}`, administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive });
  type Row = { batchCode?: string; batchRow?: number; validationStatus: 'pending' | 'verified' | 'rejected'; reviewedAt?: Date };
  const rows = (stationId: mongoose.Types.ObjectId, list: Row[]) => WaterRecord.create(list.map(row => ({
    stationId, parameters: { coliform: 10, nh4: 0.2, ph: 7, po4: 0.1, do: 6, cod: row.batchRow ?? 0 }, unitBasis: 'training-source-unverified',
    source: { kind: 'excel', note: 'private' }, createdBy: new mongoose.Types.ObjectId(), wqi: 73, qualityClass: 'Trung bình',
    reviewedBy: row.validationStatus === 'pending' ? null : new mongoose.Types.ObjectId(), reviewNote: 'private', reviewedAt: row.validationStatus === 'pending' ? null : new Date('2026-11-01'), ...row,
  })));
  const latest = async (code: string, who: ReturnType<typeof request.agent> = admin.agent) => {
    const response = await who.get('/api/v1/stations?limit=100');
    expect(response.status).toBe(200);
    return response.body.data.find((item: { code: string }) => item.code === code)?.latest;
  };

  it('takes the newest code by year then number, and its lowest approved row', async () => {
    const a = await place('AH-A');
    await rows(a._id, [
      { batchCode: 'D17-2026', batchRow: 2, validationStatus: 'verified' }, { batchCode: 'D17-2026', batchRow: 3, validationStatus: 'verified' },
      { batchCode: 'D3-2027', batchRow: 4, validationStatus: 'verified' },
      { batchCode: 'D12-2027', batchRow: 7, validationStatus: 'verified' }, { batchCode: 'D12-2027', batchRow: 8, validationStatus: 'verified' },
      { batchCode: 'D12-2027', batchRow: 9, validationStatus: 'rejected' }, { batchCode: 'D12-2027', batchRow: 10, validationStatus: 'pending' },
    ]);
    const shown = await latest('AH-A');
    expect(shown).toMatchObject({ batchCode: 'D12-2027', batchRow: 8, wqi: 73, qualityClass: 'Trung bình', batches: 3, parameters: { cod: 8 } });
    // Only public fields leave the database: no reviewer, review note or source row.
    expect(Object.keys(shown).sort()).toEqual(['batchCode', 'batchRow', 'batches', 'parameters', 'qualityClass', 'reviewedAt', 'wqi']);
    // Guests see the same public fields on the public map (user, 05/11 reverses 04/11).
    const forGuest = await latest('AH-A', guest);
    expect(forGuest).toMatchObject({ batchCode: 'D12-2027', batchRow: 8, wqi: 73, qualityClass: 'Trung bình', batches: 3 });
    expect(Object.keys(forGuest).sort()).toEqual(['batchCode', 'batchRow', 'batches', 'parameters', 'qualityClass', 'reviewedAt', 'wqi']);
  });
  it('ranks a D<n>-<yyyy> code above any other code, and other codes by their latest approval', async () => {
    const b = await place('AH-B'), c = await place('AH-C');
    await rows(b._id, [{ batchCode: 'LAB-X', batchRow: 1, validationStatus: 'verified', reviewedAt: new Date('2027-06-01') }, { batchCode: 'D1-2020', batchRow: 2, validationStatus: 'verified', reviewedAt: new Date('2020-01-01') }]);
    await rows(c._id, [{ batchCode: 'ZZZ', batchRow: 3, validationStatus: 'verified', reviewedAt: new Date('2026-01-01') }, { batchCode: 'AAA', batchRow: 4, validationStatus: 'verified', reviewedAt: new Date('2026-03-01') }]);
    expect(await latest('AH-B')).toMatchObject({ batchCode: 'D1-2020', batches: 2 });
    expect(await latest('AH-C')).toMatchObject({ batchCode: 'AAA', reviewedAt: '2026-03-01T00:00:00.000Z' });
  });
  it('shows nothing without an approved batch, ignores rows without a code and keeps inactive stations off the public map', async () => {
    const d = await place('AH-D'), off = await place('AH-OFF', false);
    await place('AH-E');
    await rows(d._id, [{ batchCode: 'D5-2026', batchRow: 1, validationStatus: 'pending' }, { batchCode: 'D5-2026', batchRow: 2, validationStatus: 'rejected' }, { validationStatus: 'verified' }]);
    await rows(off._id, [{ batchCode: 'D6-2026', batchRow: 1, validationStatus: 'verified' }]);
    expect(await latest('AH-D')).toBeNull();
    expect(await latest('AH-E')).toBeNull();
    expect((await guest.get('/api/v1/stations?limit=100')).body.data.map((item: { code: string }) => item.code)).not.toContain('AH-OFF');
    expect(await latest('AH-OFF')).toMatchObject({ batchCode: 'D6-2026', batchRow: 1 });
  });
  it('moves to a lower row once an admin approves it', async () => {
    const g = await place('AH-G');
    const [, below] = await rows(g._id, [{ batchCode: 'D1-2026', batchRow: 1, validationStatus: 'verified' }, { batchCode: 'D1-2026', batchRow: 2, validationStatus: 'pending' }]);
    expect(await latest('AH-G')).toMatchObject({ batchRow: 1 });
    expect((await write(admin, 'patch', `/api/v1/water-records/${below.id}/validation`).send({ version: 1, status: 'verified' })).status).toBe(200);
    expect(await latest('AH-G')).toMatchObject({ batchRow: 2 });
  });
  it('lists one station for admins with its newest batch first and the lowest Excel row on top', async () => {
    const a = await place('AH-A'), other = await place('AH-X');
    await rows(a._id, [
      { batchCode: 'D17-2026', batchRow: 2, validationStatus: 'verified' }, { batchCode: 'D17-2026', batchRow: 3, validationStatus: 'verified' },
      { batchCode: 'D12-2027', batchRow: 7, validationStatus: 'verified' }, { batchCode: 'D12-2027', batchRow: 8, validationStatus: 'verified' },
      { batchCode: 'D12-2027', batchRow: 9, validationStatus: 'rejected' }, { batchCode: 'LAB-X', batchRow: 1, validationStatus: 'verified', reviewedAt: new Date('2030-01-01') },
    ]);
    await rows(other._id, [{ batchCode: 'D99-2030', batchRow: 1, validationStatus: 'verified' }]);
    const list = async (query: string) => (await admin.agent.get(`/api/v1/water-records?stationId=${a.id}&${query}`)).body;
    const order = (body: { data: { batchCode: string; batchRow: number; stationId: { code: string } }[] }) => body.data.map(r => `${r.stationId.code} ${r.batchCode}/${r.batchRow}`);
    const verified = await list('status=verified');
    expect(order(verified)).toEqual(['AH-A D12-2027/8', 'AH-A D12-2027/7', 'AH-A D17-2026/3', 'AH-A D17-2026/2', 'AH-A LAB-X/1']);
    // The first verified row is the one the station shows on the map.
    expect(verified.data[0]).toMatchObject({ batchCode: (await latest('AH-A')).batchCode, batchRow: (await latest('AH-A')).batchRow });
    expect(order(await list('status=rejected'))).toEqual(['AH-A D12-2027/9']);
    const paged = await list('page=2&limit=2');
    expect(order(paged)).toEqual(['AH-A D12-2027/7', 'AH-A D17-2026/3']);
    expect(paged.meta).toMatchObject({ total: 6, page: 2, pages: 3 });
  });
});
