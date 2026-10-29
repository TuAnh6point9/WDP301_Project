import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { chromium, type Browser } from '@playwright/test';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { PredictionBatch, PredictionBatchRow } from '../src/modules/prediction-batches/batch.model.js';
import { startBatchWorker } from '../src/modules/prediction-batches/batch.service.js';

// Real model + separate mongod + real session/CSRF. No connection to the user's database.
let db: MongoMemoryServer, ai: ChildProcess, server: Server, browser: Browser | undefined;
let apiChild: ChildProcess | undefined;
let original: NodeJS.ProcessEnv, base: string, aiUrl: string, stopWorker: (() => Promise<void>) | undefined;
let aiLogs = '';
const evidenceDirectory = resolve('docs/local/audits/evidence/wqi-batch-verification/runs', new Date().toISOString().replace(/[:.]/g, '-'));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const python = resolve('ai/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
// Private artifacts are intentionally absent in public CI. Run both checks locally when available.
const realTest = it.runIf(existsSync(python) && existsSync('.local/ai/catboost/model.cbm') && existsSync('.local/ai/catboost/manifest.json') && existsSync('client/dist/index.html'));
const sample = [7.2, 25, 3, 25, 5.7, 0.2, 0.3, 5000];
async function workbook(count: number, invalid = false, sixColumnsOnly = false) {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Samples');
  const indices = sixColumnsOnly ? [0, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  const columns = ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms'];
  sheet.addRow(indices.map(index => columns[index]));
  for (let i = 0; i < count; i++) {
    const values = invalid && i === 1 ? ['7,2', ...sample.slice(1)] : sample;
    sheet.addRow(indices.map(index => values[index]));
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
beforeAll(async () => {
  original = { ...process.env };
  const portHolder = createServer(); await new Promise<void>(resolve => portHolder.listen(0, '127.0.0.1', resolve));
  const aiPort = (portHolder.address() as AddressInfo).port; await new Promise<void>(resolve => portHolder.close(() => resolve()));
  aiUrl = `http://127.0.0.1:${aiPort}`;
  ai = spawn(python, ['-B', '-m', 'uvicorn', 'ai.service:configured_app', '--factory', '--host', '127.0.0.1', '--port', String(aiPort), '--log-level', 'error'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUTF8: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', WQI_MODEL_PATH: resolve('.local/ai/catboost/model.cbm'), WQI_MODEL_MANIFEST: resolve('.local/ai/catboost/manifest.json') },
  });
  ai.stderr?.on('data', chunk => { aiLogs += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${aiUrl}/health`)).ok; } catch { /* fixture starting */ } if (ready) break; if (ai.exitCode !== null) throw new Error(aiLogs || 'AI fixture exited'); await pause(200); }
  if (!ready) throw new Error(`AI fixture not ready: ${aiLogs}`);
  const binary = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'batch_real_verification_only' }, binary: existsSync(binary) ? { systemBinary: binary } : undefined });
  await mongoose.connect(db.getUri()); await Promise.all([PredictionBatch.init(), PredictionBatchRow.init(), User.init()]);
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'isolated-real-batch-test-secret-32-chars', AI_MODE: 'http', AI_SERVICE_URL: `${aiUrl}/predict`, AI_TIMEOUT_MS: '10000' });
  await User.create({ name: 'Batch test', email: 'batch@example.test', passwordHash: await hashPassword('fixture-password-2026'), role: 'user' });
  const webPortHolder = createServer(); await new Promise<void>(resolve => webPortHolder.listen(0, '127.0.0.1', resolve));
  const webPort = (webPortHolder.address() as AddressInfo).port; await new Promise<void>(resolve => webPortHolder.close(() => resolve()));
  base = `http://127.0.0.1:${webPort}`; process.env.CLIENT_ORIGIN = base;
  process.argv.push('--serve-client');
  server = createApp(new session.MemoryStore()).listen(webPort, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
}, 60000);
afterAll(async () => {
  await browser?.close(); await stopWorker?.();
  if (apiChild && apiChild.exitCode === null) { apiChild.kill(); await Promise.race([new Promise(resolve => apiChild!.once('exit', resolve)), pause(5000)]); }
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  if (ai && ai.exitCode === null) { ai.kill(); await Promise.race([new Promise(resolve => ai.once('exit', resolve)), pause(5000)]); }
  await mongoose.disconnect(); await db?.stop();
  process.env = original; process.argv.splice(process.argv.lastIndexOf('--serve-client'), 1);
});

realTest('calculates 10,000 rows with native CatBoost, session/CSRF, full export and measured resource use', async () => {
  const agent = request.agent(base);
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
  const login = await agent.post('/api/v1/auth/login').set('Origin', base).set('X-CSRF-Token', csrf).send({ email: 'batch@example.test', password: 'fixture-password-2026' });
  expect(login.status).toBe(200);
  const token = login.body.data.csrfToken;
  const file = await workbook(10000), initialRss = process.memoryUsage().rss;
  let peakRss = initialRss;
  const monitor = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 50);
  const start = performance.now();
  try {
    expect((await agent.post('/api/v1/prediction-batches/preview').set('Origin', base).attach('file', file, 'fixture.xlsx')).status).toBe(403);
    const preview = await agent.post('/api/v1/prediction-batches/preview').set('Origin', base).set('X-CSRF-Token', token).attach('file', file, '10000-samples.xlsx');
    expect(preview.status).toBe(201);
    const id = preview.body.data._id, previewMs = performance.now() - start;
    const queued = await agent.post(`/api/v1/prediction-batches/${id}/start`).set('Origin', base).set('X-CSRF-Token', token).send({});
    expect(queued.status).toBe(202);
    const computing = performance.now();
    stopWorker = startBatchWorker();
    for (let i = 0; i < 1200; i++) {
      if ((await PredictionBatch.findById(id))?.status === 'completed') break;
      await pause(100);
    }
    await stopWorker(); stopWorker = undefined;
    const computeMs = performance.now() - computing;
    const batch = await PredictionBatch.findById(id);
    expect(batch?.status).toBe('completed'); expect(batch?.successCount).toBe(10000);
    expect(await PredictionBatchRow.countDocuments({ batchId: id, status: 'success' })).toBe(10000);
    const single = await agent.post('/api/v1/predictions').set('Origin', base).set('X-CSRF-Token', token).send({ parameters: { coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 }, unitBasis: 'training-source-unverified' });
    expect(single.status).toBe(201);
    const row = await PredictionBatchRow.findOne({ batchId: id, rowNumber: 2 });
    expect(Math.abs(row?.result.rawWqi - single.body.data.rawWqi)).toBeLessThan(1e-6);
    expect(row?.result.wqi).toBe(single.body.data.wqi); expect(row?.result.qualityClass).toBe(single.body.data.qualityClass);
    const exported = await agent.get(`/api/v1/prediction-batches/${id}/export`).buffer(true).parse((res, callback) => { const parts: Buffer[] = []; res.on('data', c => parts.push(c)); res.on('end', () => callback(null, Buffer.concat(parts))); });
    expect(exported.status).toBe(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(exported.body);
    expect(book.worksheets[0].rowCount).toBe(10001);
    expect(book.worksheets[0].getRow(10001).getCell(10).value).toBe(single.body.data.wqi);
    mkdirSync(evidenceDirectory, { recursive: true });
    const report = { rows: 10000, fileBytes: file.length, previewMs: Math.round(previewMs), computeAndSaveMs: Math.round(computeMs), totalIncludingExportMs: Math.round(performance.now() - start), nodeInitialRssMB: Math.round(initialRss / 1048576), nodePeakRssMB: Math.round(peakRss / 1048576), model: batch?.modelSnapshot, rawScoreDifference: Math.abs(row?.result.rawWqi - single.body.data.rawWqi), note: 'Isolated DB, real background worker. RSS is the Node test/API process only; excludes Python and MongoDB.' };
    writeFileSync(join(evidenceDirectory, '10000-rows.json'), JSON.stringify(report, null, 2));
    console.log('BATCH_BENCHMARK', JSON.stringify(report));
  } finally { clearInterval(monitor); }
}, 180000);

realTest('runs the browser upload → preview → calculate → reload → history → download against real services', async () => {
  stopWorker = startBatchWorker();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.addInitScript(() => { localStorage.setItem('wqi.language', 'en'); localStorage.setItem('wqi.guide.calculate.v1', 'done'); });
  const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${base}/calculate`); await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', { exact: true }).fill('batch@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-2026');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await page.getByRole('button', { name: 'Excel', exact: true }).waitFor();
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: join(evidenceDirectory, 'excel-button.png'), fullPage: true });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Excel', exact: true }).focus();
  await page.keyboard.press('Enter');
  await (await chooserPromise).setFiles({ name: 'browser-samples.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook(203, true) });
  await page.getByRole('button', { name: 'Calculate 202 valid rows', exact: true }).waitFor();
  expect(new URL(page.url()).pathname).toMatch(/^\/excel\/[a-f0-9]{24}$/);
  expect(await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calculate WQI' }).getAttribute('aria-current')).toBe('page');
  await page.screenshot({ path: join(evidenceDirectory, 'excel-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Calculate 202 valid rows', exact: true }).click();
  await page.locator('.excel-processing .loading-water').waitFor();
  await page.screenshot({ path: join(evidenceDirectory, 'excel-processing.png'), fullPage: true });
  await page.getByText('Completed with errors', { exact: true }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: join(evidenceDirectory, 'excel-results.png'), fullPage: true });
  const detailUrl = page.url(); await page.reload();
  await page.getByText('Completed with errors', { exact: true }).waitFor();
  await page.getByLabel('Show error rows only').check();
  await page.waitForFunction(() => document.querySelector('tbody')?.querySelectorAll('tr').length === 1);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Excel results', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^wqi-.*\.xlsx$/);
  await page.getByRole('link', { name: 'Excel Calculation History', exact: true }).click();
  await page.getByText('browser-samples.xlsx', { exact: true }).waitFor();
  expect(await page.locator(`a[href="${new URL(detailUrl).pathname}"]`).count()).toBe(1);
  await page.goto(detailUrl); await page.getByText('browser-samples.xlsx', { exact: true }).waitFor();
  await page.goto(detailUrl.replace('/excel/', '/prediction-batches/'));
  await page.getByText('browser-samples.xlsx', { exact: true }).waitFor();
  expect(page.url()).toBe(detailUrl);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.excel-processing').count()).toBe(0);
  const nextChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose another file' }).click();
  await (await nextChooser).setFiles({ name: 'browser-samples.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook(203, true, true) });
  await page.getByRole('button', { name: 'Calculate 202 valid rows', exact: true }).waitFor();
  expect(await page.locator('tbody tr').first().locator('td').nth(2).innerText()).toBe('—');
  expect(await page.locator('tbody tr').first().locator('td').nth(3).innerText()).toBe('—');
  expect(page.url()).not.toBe(detailUrl);
  await page.getByRole('button', { name: 'Calculate 202 valid rows', exact: true }).click();
  await page.locator('.excel-processing .loading-drop').waitFor();
  expect(await page.locator('.excel-processing .loading-drop').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.getByText('Completed with errors', { exact: true }).waitFor({ timeout: 30000 });
  expect(await page.locator('.excel-results-reveal').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(evidenceDirectory, 'browser-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await page.goto(`${base}/calculate/excel`);
  await page.getByRole('button', { name: 'Excel', exact: true }).waitFor();
  expect(new URL(page.url()).pathname).toBe('/calculate');
  await page.getByRole('button', { name: 'Excel', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidenceDirectory, 'excel-button-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  writeFileSync(join(evidenceDirectory, 'browser.json'), JSON.stringify({ realBrowser: 'Chromium', realModel: true, isolatedDatabase: true, checks: ['login', 'csrf', 'keyboard-native-file-picker', 'auto-preview', 'excel-url', 'active-nav', 'partial-valid', 'water-loader', 'calculate', 'reload', 'error-filter', 'history', 'xlsx-download', 'legacy-redirects', 'same-file-new-batch', 'six-column-file', 'blank-optional-measurements', 'reduced-motion', 'mobile-overflow'], pageErrors }, null, 2));
}, 60000);

realTest('recovers saved rows and sessions after killing and restarting the actual API process', async () => {
  await stopWorker?.(); stopWorker = undefined;
  const holder = createServer(); await new Promise<void>(resolve => holder.listen(0, '127.0.0.1', resolve));
  const port = (holder.address() as AddressInfo).port; await new Promise<void>(resolve => holder.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  async function boot() {
    apiChild = spawn(process.execPath, ['server/dist/server.js'], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), CLIENT_ORIGIN: origin, MONGODB_URI: db.getUri(), AI_SERVICE_URL: `${aiUrl}/predict` } });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${origin}/api/v1/health/ready`)).ok; } catch { /* process starting */ } if (ready) break; await pause(100); }
    expect(ready).toBe(true);
  }
  await boot();
  const agent = request.agent(origin);
  const token = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
  const login = await agent.post('/api/v1/auth/login').set('Origin', origin).set('X-CSRF-Token', token).send({ email: 'batch@example.test', password: 'fixture-password-2026' });
  expect(login.status).toBe(200);
  const preview = await agent.post('/api/v1/prediction-batches/preview').set('Origin', origin).set('X-CSRF-Token', login.body.data.csrfToken).attach('file', await workbook(10000), 'restart-fixture.xlsx');
  expect(preview.status).toBe(201);
  const id = preview.body.data._id;
  expect((await agent.post(`/api/v1/prediction-batches/${id}/start`).set('Origin', origin).set('X-CSRF-Token', login.body.data.csrfToken).send({})).status).toBe(202);
  let savedBefore = 0;
  for (let i = 0; i < 200; i++) { savedBefore = await PredictionBatchRow.countDocuments({ batchId: id, status: 'success' }); if (savedBefore > 0) break; await pause(20); }
  expect(savedBefore).toBeGreaterThan(0); expect(savedBefore).toBeLessThan(10000);
  const child = apiChild!; const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
  const firstSaved = await PredictionBatchRow.findOne({ batchId: id, status: 'success' }).lean();
  const recovering = performance.now(); await boot();
  // Do not edit leases: test real expiry/recovery after a hard process stop.
  for (let i = 0; i < 1700; i++) { if ((await PredictionBatch.findById(id))?.status === 'completed') break; await pause(100); }
  const detail = await agent.get(`/api/v1/prediction-batches/${id}`);
  expect(detail.status).toBe(200); // Mongo-backed login session survived the restart.
  expect(detail.body.data).toMatchObject({ status: 'completed', successCount: 10000 });
  expect(await PredictionBatchRow.countDocuments({ batchId: id })).toBe(10000);
  expect((await PredictionBatchRow.findOne({ batchId: id, rowNumber: firstSaved!.rowNumber }).lean())?.result).toEqual(firstSaved?.result);
  const report = { actualApiProcessRestart: true, isolatedDatabase: true, savedRowsBeforeStop: savedBefore, finalRows: 10000, sessionSurvived: true, recoveryMs: Math.round(performance.now() - recovering) };
  writeFileSync(join(evidenceDirectory, 'restart.json'), JSON.stringify(report, null, 2));
  console.log('BATCH_RESTART', JSON.stringify(report));
  const finalChild = apiChild!; const stopped = new Promise(resolve => finalChild.once('exit', resolve)); finalChild.kill(); await stopped; apiChild = undefined;
}, 240000);
