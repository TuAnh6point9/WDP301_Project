import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import session from 'express-session';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { AuditLog } from '../src/modules/audit/audit.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, expect as browserExpect } from '@playwright/test';

const ORIGIN = 'http://guide-login.test';
const password = 'guide-fixture-password';
let db: MongoMemoryServer, app: Express, original: NodeJS.ProcessEnv;
let passwordHash: string;
let fixtureAddress = '192.0.2.1', fixtureNumber = 0;
type Agent = ReturnType<typeof request.agent>;
async function login(email: string, agent = request.agent(app), secret = password) {
  const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
  const response = await agent.post('/api/v1/auth/login').set('X-Forwarded-For', fixtureAddress).set('Origin', ORIGIN).set('X-CSRF-Token', csrf).send({ email, password: secret });
  // Audit writes happen after the response; settle them before the next case or DB teardown.
  await vi.waitFor(async () => expect(await AuditLog.exists({ requestId: response.headers['x-request-id'] })).not.toBeNull());
  return { agent, response };
}
async function logout(agent: Agent, csrf: string) {
  expect((await agent.post('/api/v1/auth/logout').set('Origin', ORIGIN).set('X-CSRF-Token', csrf)).status).toBe(204);
}
beforeAll(async () => {
  original = { ...process.env };
  const binary = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'guide_login_test_only' }, binary: existsSync(binary) ? { systemBinary: binary } : undefined });
  await mongoose.connect(db.getUri());
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: db.getUri(), SESSION_SECRET: 'guide-login-test-secret-at-least-32-chars', CLIENT_ORIGIN: ORIGIN, AI_MODE: 'disabled' });
  passwordHash = await hashPassword(password); await User.init();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), AuditLog.deleteMany({})]);
  process.env.CLIENT_ORIGIN = ORIGIN;
  fixtureAddress = `192.0.2.${++fixtureNumber}`;
  app = createApp(new session.MemoryStore());
  app.set('trust proxy', 1);
});

// Opt in after building the client and installing Playwright. Uses only the isolated DB above.
it.runIf(process.env.WQI_GUIDE_BROWSER_TEST === '1')('verifies guest revisits and first versus later user/admin logins in a real browser', async () => {
  const server = createServer((req, res) => app(req, res));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CLIENT_ORIGIN = base;
  process.argv.push('--serve-client');
  try { app = createApp(new session.MemoryStore()); }
  finally { process.argv.splice(process.argv.lastIndexOf('--serve-client'), 1); }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
    await page.goto(`${base}/calculate`);
    const tour = page.locator('.wqi-guide[open]');
    await browserExpect(tour).toBeVisible();
    await tour.getByRole('button', { name: 'Skip', exact: true }).click();
    await browserExpect(tour).toHaveCount(0);
    await page.reload(); await browserExpect(tour).toBeVisible();
    await page.keyboard.press('Escape');
    for (const role of ['user', 'admin'] as const) {
      const email = `${role}@browser-guide.test`;
      await User.create({ name: 'Browser guide fixture', email, passwordHash, role });
      async function signIn() {
        await page.goto(`${base}/login`);
        await page.getByLabel('Email', { exact: true }).fill(email);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Log In', exact: true }).click();
        await page.waitForURL(url => url.pathname !== '/login');
      }
      await signIn();
      const path = role === 'admin' ? '/admin/import' : '/calculate';
      await page.goto(`${base}${path}`); await browserExpect(tour).toBeVisible();
      await tour.getByRole('button', { name: 'Skip', exact: true }).click();
      await page.reload(); await browserExpect(page.locator('.wqi-guide-trigger').first()).toBeEnabled();
      await browserExpect(tour).toHaveCount(0);
      const csrf = (await (await page.request.get(`${base}/api/v1/auth/csrf`)).json()).data.csrfToken;
      browserExpect((await page.request.post(`${base}/api/v1/auth/logout`, { headers: { Origin: base, 'X-CSRF-Token': csrf } })).status()).toBe(204);
      await page.evaluate(() => localStorage.clear());
      await signIn(); await page.goto(`${base}${path}`);
      const help = page.locator('.wqi-guide-trigger').first();
      await browserExpect(help).toBeEnabled(); await page.waitForTimeout(150);
      await browserExpect(tour).toHaveCount(0);
      await help.click(); await browserExpect(tour).toBeVisible();
      await page.keyboard.press('Escape'); await browserExpect(help).toBeFocused();
      const nextCsrf = (await (await page.request.get(`${base}/api/v1/auth/csrf`)).json()).data.csrfToken;
      browserExpect((await page.request.post(`${base}/api/v1/auth/logout`, { headers: { Origin: base, 'X-CSRF-Token': nextCsrf } })).status()).toBe(204);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    process.env.CLIENT_ORIGIN = ORIGIN;
  }
}, 60000);
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); process.env = original; });

describe('automatic guidance is granted only to an account first login session', () => {
  it.each(['user', 'admin'] as const)('grants the first %s session, restores it, and denies subsequent logins across devices', async role => {
    const account = await User.create({ name: 'Guide tester', email: `${role}@guide.test`, passwordHash, role });
    const first = await login(account.email);
    expect(first.response.status).toBe(200);
    expect(first.response.body.guidance).toEqual({ autoStart: true });
    expect((await first.agent.get('/api/v1/auth/me')).body.guidance).toEqual({ autoStart: true });
    await logout(first.agent, first.response.body.data.csrfToken);
    const second = await login(account.email);
    expect(second.response.body.guidance).toEqual({ autoStart: false });
    expect((await second.agent.get('/api/v1/auth/me')).body.guidance).toEqual({ autoStart: false });
    const third = await login(account.email);
    expect(third.response.body.guidance).toEqual({ autoStart: false });
    expect((await User.findById(account.id).select('+guideLoginSeenAt'))?.get('guideLoginSeenAt')).toBeInstanceOf(Date);
  });
  it('keeps first-login eligibility independent for two accounts on the same browser', async () => {
    await User.create([{ name: 'A account', email: 'a@guide.test', passwordHash }, { name: 'B account', email: 'b@guide.test', passwordHash }]);
    const a = await login('a@guide.test'); await logout(a.agent, a.response.body.data.csrfToken);
    const b = await login('b@guide.test', a.agent);
    expect(b.response.body.guidance).toEqual({ autoStart: true });
    expect((await login('a@guide.test')).response.body.guidance).toEqual({ autoStart: false });
  });
  it('does not consume the first login after a wrong password or an inactive account', async () => {
    const account = await User.create({ name: 'Guide tester', email: 'a@guide.test', passwordHash, isActive: false });
    expect((await login(account.email)).response.status).toBe(401);
    await User.updateOne({ _id: account.id }, { $set: { isActive: true } });
    expect((await login(account.email, request.agent(app), 'wrong-password')).response.status).toBe(401);
    expect((await login(account.email)).response.body.guidance).toEqual({ autoStart: true });
  });
  it('grants automatic guidance to only one concurrent first login', async () => {
    const account = await User.create({ name: 'Guide tester', email: 'a@guide.test', passwordHash });
    const responses = await Promise.all([login(account.email), login(account.email)]);
    expect(responses.map(item => item.response.status)).toEqual([200, 200]);
    expect(responses.filter(item => item.response.body.guidance?.autoStart)).toHaveLength(1);
  });
  it('recognizes a successful login from before this feature without restarting onboarding', async () => {
    const account = await User.create({ name: 'Existing account', email: 'old@guide.test', passwordHash });
    await AuditLog.create({ action: 'auth.login', actorId: account._id, outcome: 'success', status: 200, requestId: 'prior-login' });
    expect((await login(account.email)).response.body.guidance).toEqual({ autoStart: false });
  });
  it('rolls back a first-login claim if session persistence fails', async () => {
    const store = new session.MemoryStore(); const save = store.set.bind(store); let fail = false;
    store.set = (sid, value, callback) => fail ? callback?.(new Error('fixture store unavailable')) : save(sid, value, callback);
    app = createApp(store);
    app.set('trust proxy', 1);
    const account = await User.create({ name: 'Guide tester', email: 'a@guide.test', passwordHash });
    const agent = request.agent(app); const csrf = (await agent.get('/api/v1/auth/csrf')).body.data.csrfToken;
    fail = true;
    expect((await agent.post('/api/v1/auth/login').set('X-Forwarded-For', fixtureAddress).set('Origin', ORIGIN).set('X-CSRF-Token', csrf).send({ email: account.email, password })).status).toBe(500);
    fail = false;
    expect((await login(account.email)).response.body.guidance).toEqual({ autoStart: true });
  });
});
