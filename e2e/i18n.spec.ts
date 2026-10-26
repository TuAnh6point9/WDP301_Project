import { expect, test, type Page } from '@playwright/test';

// All API calls are fulfilled in-browser. These tests never connect to Atlas or run model inference.
test.use({ channel: process.env.E2E_CHANNEL });
const id = '123456789012345678901234';
const stationId = '123456789012345678901235';
const parameters = { coliform: 5000, nh4: .2, ph: 7.2, po4: .3, do: 5.7, cod: 25 };
const at = new Date().toISOString();
const prediction = { _id: id, parameters, wqi: 91, rawWqi: 90.5, qualityClass: 'Rất tốt',
  unitBasis: 'training-source-unverified', modelVersion: 'callisto 2.0', algorithm: 'CatBoost',
  referenceBasis: 'lecturer-provided', unitStatus: 'unverified', createdAt: at };
async function fixtures(page: Page) {
  let signedIn = true;
  const writes: { path: string; body: unknown }[] = [];
  const station = { _id: stationId, code: 'AH1', name: 'Tên trạm gốc — UI fixture', administrativeArea: 'Hải Dương',
    location: { type: 'Point', coordinates: [106.48548944, 20.93261429] }, isActive: true };
  const meta = { page: 1, limit: 100, total: 1, pages: 1 };
  const user = { _id: 'test-admin', name: 'Người dùng kiểm thử', email: 'test@example.test', role: 'admin', isActive: true, createdAt: at };
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (method !== 'GET') writes.push({ path, body: request.postDataJSON() });
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/csrf') return send({ data: { csrfToken: 'a'.repeat(64) } });
    if (path === '/auth/me') return signedIn ? send({ data: user }) : send({ error: { code: 'UNAUTHENTICATED' } }, 401);
    if (path === '/auth/logout') { signedIn = false; return send({ data: null }); }
    if (path === '/auth/login') { signedIn = true; return send({ data: { user, csrfToken: 'a'.repeat(64) } }); }
    if (path === '/predictions/status') return send({ data: { available: true, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' } });
    if (path === '/predictions' && method === 'POST') return send({ data: prediction }, 201);
    if (path === '/predictions') return send({ data: [prediction], meta });
    if (path.startsWith('/predictions/')) return send({ data: prediction });
    if (path === '/stations' && method === 'GET') return send({ data: [station], meta });
    if (path.startsWith('/stations/') && method === 'PATCH') return send({ data: { ...station, ...request.postDataJSON() } });
    if (path === '/stations' && method === 'POST') return send({ data: { ...station, ...request.postDataJSON() } }, 201);
    if (path === '/water-records') return send({ data: [{ _id: id, stationId: station, parameters, measuredAt: at, validationStatus: 'verified', wqi: 91, qualityClass: 'Rất tốt', createdAt: at, version: 0 }], meta });
    if (path === '/health/live') return send({ data: { status: 'ok' } });
    if (path === '/health/ready') return send({ data: { database: 'connected' } });
    if (path === '/dashboard/summary') return send({ data: { users: { total: 1, active: 1, admins: 1 }, stations: { active: 1 }, imports: { batches: 0, rows: 0 }, records: { pending: 0, verified: 1, rejected: 0 }, predictions: 1 } });
    if (path === '/users') return send({ data: [user], meta });
    if (path === '/audit-logs' || path === '/imports') return send({ data: [], meta: { ...meta, total: 0 } });
    return send({ error: { code: 'NOT_FOUND' } }, 404);
  });
  return { writes, pageErrors };
}
async function switchTo(page: Page, language: 'vi' | 'en') {
  const name = language === 'vi' ? 'Tiếng Việt' : 'English';
  await expect(page.locator('.language-switcher').first()).toBeAttached();
  const button = page.getByRole('button', { name, exact: true });
  const menu = page.getByRole('button', { name: /Danh mục|Menu/, exact: true });
  await button.or(menu).filter({ visible: true }).first().waitFor();
  if (!await button.first().isVisible()) {
    await menu.click();
  }
  await button.filter({ visible: true }).first().click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

test('Vietnamese default, persistence, navigation, logout and mobile keyboard controls', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/calculate');
  await expect(page.getByRole('heading', { name: 'Tính WQI bằng AI' })).toBeVisible();
  await page.locator('#ph').fill('7.2');
  const field = await page.locator('#ph').elementHandle();
  await switchTo(page, 'en');
  expect(await page.locator('#ph').evaluate((node, original) => node === original, field)).toBe(true);
  await expect(page.locator('#ph')).toHaveValue('7.2');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Calculate WQI with AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Log Out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const vietnamese = page.getByRole('button', { name: 'Tiếng Việt', exact: true }).filter({ visible: true });
  await vietnamese.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(vietnamese).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.navigation-drawer')).toHaveCount(0);
  await page.screenshot({ path: 'docs/local/screenshots/i18n/home-vi-mobile.png', fullPage: true });
  expect(f.writes.filter(write => write.path === '/predictions')).toHaveLength(0);
  expect(f.pageErrors).toEqual([]);
});

test('real browser tabs synchronize language without losing drafts or posting calculations', async ({ page, context }) => {
  const first = await fixtures(page);
  const other = await context.newPage();
  const second = await fixtures(other);
  await page.goto('/calculate');
  await other.goto('/calculate');
  await other.locator('#ph').fill('7.2');
  await switchTo(page, 'en');
  await expect(other.locator('html')).toHaveAttribute('lang', 'en');
  await expect(other.locator('#ph')).toHaveValue('7.2');
  await switchTo(other, 'vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.evaluate(() => localStorage.setItem('wqi.language', 'invalid-locale'));
  await other.reload();
  await expect(other.locator('html')).toHaveAttribute('lang', 'vi');
  expect([...first.writes, ...second.writes].filter(write => write.path === '/predictions')).toHaveLength(0);
  expect([...first.pageErrors, ...second.pageErrors]).toEqual([]);
});

test('blocked browser storage still allows in-memory language switching', async ({ page }) => {
  const f = await fixtures(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/calculate');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.locator('#ph').fill('7.2');
  await switchTo(page, 'en');
  await expect(page.locator('#ph')).toHaveValue('7.2');
  await switchTo(page, 'vi');
  expect(f.pageErrors).toEqual([]);
});

for (const language of ['vi', 'en'] as const) {
  test(`${language}: prediction, history, English CSV and report`, async ({ page }) => {
    const f = await fixtures(page);
    await page.addInitScript(locale => localStorage.setItem('wqi.language', locale), language);
    await page.goto('/calculate');
    const button = page.getByRole('button', { name: language === 'vi' ? 'Tính WQI' : 'Calculate WQI', exact: true });
    await expect(button).toBeEnabled();
    for (const [key, value] of Object.entries(parameters)) await page.locator(`#${key}`).fill(String(value));
    await button.click();
    await expect(page).toHaveURL(new RegExp(`/result\\?id=${id}$`));
    await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '91');
    expect(f.writes.filter(write => write.path === '/predictions')).toEqual([{ path: '/predictions', body: { parameters, unitBasis: 'training-source-unverified' } }]);
    await page.goto('/history');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: language === 'vi' ? 'Xuất trang này (CSV)' : 'Export this page (CSV)', exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = []; for await (const part of stream!) chunks.push(part);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv).toContain('Calculated At'); expect(csv).toContain('Very good'); expect(csv).not.toContain('Thời gian tính');
    await page.goto('/report');
    const paper = page.locator('article.paper');
    await expect(paper).toContainText('WQI Calculation History Report');
    await expect(paper).toContainText('Very good');
    await expect(paper).not.toContainText('Rất tốt');
    await page.screenshot({ path: `docs/local/screenshots/i18n/report-${language}-desktop.png`, fullPage: true });
    expect(f.pageErrors).toEqual([]);
  });

  test(`${language}: map and admin preserve camera, area preference and station draft`, async ({ page }) => {
    const f = await fixtures(page);
    await page.addInitScript(locale => localStorage.setItem('wqi.language', locale), language);
    await page.goto('/map');
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
    await page.getByRole('searchbox').fill('AH1');
    await page.getByRole('switch').uncheck();
    const pane = page.locator('.leaflet-map-pane');
    const transform = await pane.getAttribute('style');
    const map = await page.locator('.leaflet-container').elementHandle();
    await switchTo(page, language === 'vi' ? 'en' : 'vi');
    await expect(page.getByRole('searchbox')).toHaveValue('AH1');
    await expect(page.getByRole('switch')).not.toBeChecked();
    expect(await pane.getAttribute('style')).toBe(transform);
    expect(await page.locator('.leaflet-container').evaluate((node, original) => node === original, map)).toBe(true);
    await page.goto('/admin/stations');
    // The init script restores the requested fixture locale on each full page navigation.
    await page.getByRole('button', { name: language === 'vi' ? 'Thêm trạm' : 'Add Station', exact: true }).click();
    await page.locator('#e-name').fill('Vị trí nhập thử — không ghi Atlas');
    await page.locator('#e-lat').fill('20.93261429');
    await page.locator('#e-lng').fill('106.48548944');
    const dialog = await page.getByRole('dialog').elementHandle();
    // Language controls remain keyboard-accessible while a native dialog is modal.
    await page.getByRole('dialog').getByRole('button', { name: language === 'vi' ? 'English' : 'Tiếng Việt', exact: true }).click();
    await expect(page.locator('#e-name')).toHaveValue('Vị trí nhập thử — không ghi Atlas');
    await expect(page.locator('#e-lat')).toHaveValue('20.93261429');
    expect(await page.getByRole('dialog').evaluate((node, original) => node === original, dialog)).toBe(true);
    await page.getByRole('button', { name: language === 'vi' ? 'Save Station' : 'Lưu trạm', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const saved = f.writes.filter(write => write.path === '/stations');
    expect(saved).toHaveLength(1);
    expect(saved[0].body).toMatchObject({ name: 'Vị trí nhập thử — không ghi Atlas', location: { coordinates: [106.48548944, 20.93261429] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Danh mục|Menu/, exact: true }).click();
    await expect(page.getByRole('button', { name: 'English', exact: true }).filter({ visible: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.navigation-drawer')).toHaveCount(0);
    await switchTo(page, language);
    await page.keyboard.press('Escape');
    await expect(page.locator('.navigation-drawer')).toHaveCount(0);
    await page.screenshot({ path: `docs/local/screenshots/i18n/stations-${language}-mobile.png`, fullPage: true });
    expect(f.pageErrors).toEqual([]);
  });
}

test('chart filters, selection, date formatting and CSV stay correct on live language changes', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/historical-data');
  await page.locator('#station').selectOption('AH1');
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByRole('button', { name: 'So sánh COD', exact: true }).click();
  const dates = await page.locator('#from').inputValue();
  const chart = await page.locator('.trend-plot').elementHandle();
  await switchTo(page, 'en');
  await expect(page.locator('#station')).toHaveValue('AH1');
  await expect(page.locator('#from')).toHaveValue(dates);
  await expect(page.getByRole('button', { name: 'Compare COD', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.trend-plot').evaluate((node, original) => node === original, chart)).toBe(true);
  const getCsv = async () => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Excel|Xuất Excel/, exact: true }).click();
    const stream = await (await pending).createReadStream(); const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  };
  const english = await getCsv();
  await switchTo(page, 'vi');
  expect(await getCsv()).toBe(english);
  expect(english).toContain('Date,Station');
  const labels = await page.locator('.trend-plot text.tc-end, .trend-plot text.tc-ref-label').evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (let index = 0; index < labels.length; index++) for (const other of labels.slice(index + 1)) {
    const label = labels[index];
    expect(label.right <= other.left || other.right <= label.left || label.bottom <= other.top || other.bottom <= label.top).toBe(true);
  }
  await page.screenshot({ path: 'docs/local/screenshots/i18n/chart-vi-desktop.png', fullPage: true });
  expect(f.pageErrors).toEqual([]);
});

test('remaining admin pages, responsive layout and localized login errors', async ({ page }) => {
  const f = await fixtures(page);
  for (const language of ['vi', 'en'] as const) {
    await page.addInitScript(locale => localStorage.setItem('wqi.language', locale), language);
    for (const [path, vi, en] of [
      ['/admin', 'Tổng quan', 'Dashboard'],
      ['/admin/import', 'Nhập dữ liệu Excel', 'Import Excel Data'],
      ['/admin/data', 'Bản ghi quan trắc', 'Measurement Records'],
      ['/admin/users', 'Tài khoản người dùng', 'User Accounts'],
      ['/admin/status', 'Trạng thái hệ thống', 'System Status'],
      ['/admin/settings', 'Cài đặt', 'Settings'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: language === 'vi' ? vi : en, exact: true })).toBeVisible();
    }
  }
  await page.route('**/api/v1/auth/login', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Hidden diagnostic CODE_123' } }) }));
  await page.goto('/login');
  await switchTo(page, 'vi');
  await page.getByLabel('Email', { exact: true }).fill('wrong@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('invalid-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng.');
  await switchTo(page, 'en');
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('invalid-password');
  await expect(page.locator('body')).not.toContainText('CODE_123');
  await page.screenshot({ path: 'docs/local/screenshots/i18n/login-en-desktop.png', fullPage: true });
  await page.goto('/calculate');
  await expect(page.getByRole('heading', { name: /Tính WQI bằng AI|Calculate WQI with AI/ })).toBeVisible();
  for (const width of [1100, 1280, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(f.pageErrors).toEqual([]);
});
