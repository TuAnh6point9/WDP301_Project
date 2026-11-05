import { expect, test, type Page } from '@playwright/test';
import { expectGuideTargetUncovered } from './guide-layout';

test.use({ channel: process.env.E2E_CHANNEL });
const id = '123456789012345678901234';
const at = new Date().toISOString();
const parameters = { coliform: 5000, nh4: .2, ph: 7.2, po4: .3, do: 5.7, cod: 25 };
const values = { PH: 7.2, COD: 25, DO: 5.7, Amoni: .2, Phosphat: .3, Coliforms: 5000 };
const guide = (page: Page) => page.locator('.wqi-guide[open]');
const next = async (page: Page) => { await inViewport(page); await guide(page).getByRole('button', { name: /^(Tiếp theo|Next)$/ }).click(); };
const skip = async (page: Page) => { await inViewport(page); await guide(page).getByRole('button', { name: /^(Bỏ qua|Skip)$/ }).click(); };
async function finish(page: Page, count: number) {
  await expect(guide(page)).toBeVisible();
  for (let index = 1; index < count; index++) await next(page);
  await inViewport(page);
  await guide(page).getByRole('button', { name: /^(Hoàn tất|Finish)$/ }).click();
}
async function inViewport(page: Page) {
  await expect(async () => {
    const box = await page.locator('.wqi-guide-panel').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }).toPass({ timeout: 3000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectGuideTargetUncovered(page);
}
async function fixtures(page: Page) {
  const state = { userStatus: 'preview', userValid: 1, userPause: '', userReadError: false, adminMissing: false, adminSaved: false, adminReadError: false, adminCommitError: false, adminNoValid: false, emptyChart: false, chartError: false };
  const writes: string[] = [], errors: string[] = [], gets: string[] = [];
  let commitRelease: (() => void) | undefined;
  let delayCommit = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('wqi.guide.account.guide-admin.calculate.v1', 'done'));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (method === 'GET') gets.push(path); else writes.push(path);
    const meta = { page: 1, limit: 10, total: 1, pages: 1 };
    const send = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta, guidance: { autoStart: true } }) });
    const station = { _id: id, code: 'AH1', name: 'Station fixture', administrativeArea: 'Hải Dương', isActive: true, location: { type: 'Point', coordinates: [106.5, 20.9] } };
    if (path === '/auth/csrf') return send({ csrfToken: 'a'.repeat(64) });
    if (path === '/auth/me') return send({ _id: 'guide-admin', name: 'Guide fixture', role: 'admin', isActive: true, email: 'guide@example.test' });
    if (path === '/predictions/status') return send({ available: false, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' });
    if (path === '/stations') return send([station]);
    if (path === '/water-records') {
      if (state.chartError) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NETWORK_ERROR' } }) });
      return send(state.emptyChart ? [] : [{ _id: id, stationId: station, measuredAt: at, validationStatus: 'verified', parameters, wqi: 91, qualityClass: 'Rất tốt', createdAt: at }]);
    }
    if (path === '/imports') return send(state.adminSaved ? [{ _id: id, code: 'D01-2026', fileName: 'measurements.xlsx', rowCount: 1, issueCount: 0, status: 'ready', uploadedBy: { name: 'Guide fixture' }, createdAt: at }] : []);
    if (path === '/imports/preview' && state.adminReadError) return route.fulfill({ status: 400, json: { error: { code: 'INVALID_WORKBOOK' } } });
    if (path === '/imports/preview') return send({ rowCount: 2, stations: ['AH1'], missing: state.adminMissing ? [{ rowNumber: 2, code: '', station: '' }, { rowNumber: 3, code: '', station: '' }] : [],
      batches: state.adminMissing ? [] : [{ code: 'D01-2026', rowCount: 2, validCount: state.adminNoValid ? 0 : 1, issueCount: 1, stations: ['AH1'], replaces: 2, existing: { createdAt: at, rowCount: 2, uploadedBy: { name: 'Previous fixture' } } }],
      confirm: state.adminMissing ? [] : ['D01-2026', 'D01-2026|2'], rejected: [], rows: state.adminMissing ? [] : [{ rowNumber: 3, values: { ...values, 'Mã đợt': 'D01-2026', 'Mã trạm': 'AH1', PH: 'bad' }, issues: ['PH: Only numeric cells are accepted.'] }],
    });
    if (path === '/imports/commit') {
      if (delayCommit) await new Promise<void>(resolve => { commitRelease = resolve; });
      if (state.adminCommitError) return route.fulfill({ status: 503, json: { error: { code: 'AI_UNAVAILABLE' } } });
      state.adminSaved = true;
      return send({ batches: [{ code: 'D01-2026', created: false, added: 0, overwritten: 1, issueCount: 1 }], rejected: [], wqi: { calculated: 0, pending: 1 } });
    }
    if (path === '/prediction-batches/preview') return send({ _id: id });
    if (path === '/prediction-batches') return send([batch()]);
    if (path.endsWith('/start')) { state.userStatus = 'running'; return send(batch()); }
    if (path === `/prediction-batches/${id}`) return state.userReadError ? route.fulfill({ status: 503, json: { error: { code: 'AI_UNAVAILABLE' } } }) : send(batch());
    if (path === `/prediction-batches/${id}/rows`) return send([
      { _id: 'row1', rowNumber: 2, values, issues: [], status: state.userStatus.startsWith('completed') ? 'success' : 'pending', ...(state.userStatus.startsWith('completed') ? { result: { wqi: 91, qualityClass: 'Rất tốt' } } : {}) },
      { _id: 'row2', rowNumber: 3, values: { ...values, PH: 'bad' }, issues: ['PH: Only numeric cells are accepted.'], status: 'invalid' },
    ]);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
    function batch() { return { _id: id, fileName: 'samples.xlsx', status: state.userStatus, pauseCode: state.userPause, rowCount: 2, validCount: state.userValid, invalidCount: 2 - state.userValid, successCount: state.userStatus.startsWith('completed') ? 1 : 0, errorCount: 1, createdAt: at }; }
  });
  return { state, writes, errors, gets, delaySave: () => { delayCommit = true; }, releaseSave: () => commitRelease?.() };
}

test('chart walkthrough preserves filters, parameter choices and settings in both languages', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/historical-data');
  await expect(guide(page)).toHaveAttribute('data-guide-id', 'chart');
  await finish(page, 6);
  await page.locator('#station').selectOption('AH1');
  await page.getByRole('button', { name: 'So sánh COD', exact: true }).click();
  const from = await page.locator('#from-batch').inputValue();
  await page.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }).click();
  for (let index = 0; index < 4; index++) await next(page);
  await expect(page.locator('#trend-panel')).toBeVisible();
  await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-settings');
  await expect(page.locator('#trend-panel .param-list input').first()).toBeInViewport();
  await inViewport(page);
  await guide(page).getByRole('button', { name: 'English', exact: true }).click();
  await expect(guide(page)).toContainText('Step 5 / 6');
  await page.screenshot({ path: 'docs/local/screenshots/feature-guides/chart-settings-en.png' });
  await skip(page);
  await expect(page.locator('#trend-panel')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Chart guide', exact: true })).toBeFocused();
  await expect(page.locator('#station')).toHaveValue('AH1');
  await expect(page.locator('#from-batch')).toHaveValue(from);
  await expect(page.getByRole('button', { name: 'Compare COD', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('wqi-trend-config-v3'))).toBeNull();
  await page.getByRole('button', { name: 'Chart settings', exact: true }).click();
  await expect(page.locator('#trend-panel').getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Chart guide', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#trend-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chart guide', exact: true })).toBeFocused();
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('chart parameter guidance includes comparison controls and preserves the existing responsive layout', async ({ page }) => {
  test.setTimeout(90000);
  const f = await fixtures(page);
  await page.goto('/historical-data'); await skip(page);
  const layout = () => page.evaluate(() => Object.fromEntries([
    '.trend-main', '.param-tiles', '.hero-compare', '[data-tour="chart-plot"]',
  ].map(selector => {
    const element = document.querySelector(selector)!; const box = element.getBoundingClientRect();
    return [selector, { tag: element.tagName, parent: element.parentElement!.className,
      x: Math.round(box.x), y: Math.round(box.y + scrollY), width: Math.round(box.width), height: Math.round(box.height) }];
  })));
  for (const language of ['vi', 'en']) for (const viewport of [
    { width: 1365, height: 900 }, { width: 1280, height: 720 },
    { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 },
  ]) {
    await test.step(`${language}: ${viewport.width} x ${viewport.height}`, async () => {
      await page.setViewportSize(viewport);
      await page.evaluate(locale => localStorage.setItem('wqi.language', locale), language);
      await page.reload();
      const help = page.locator('.wqi-guide-trigger').first(); await expect(help).toBeEnabled();
      await expect(page.locator('.param-tiles')).toBeVisible();
      await page.locator('.param-tile').nth(1).click();
      await page.locator('.hero-compare button').last().click();
      await page.locator('.bc-stage').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
      const before = await layout();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const selected = await page.locator('.param-tile, .hero-compare button').evaluateAll(elements => elements.map(element => element.getAttribute('aria-pressed')));
      await help.click(); await next(page); await next(page);
      await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-parameters');
      await inViewport(page);
      await expect(page.locator('.hero-compare')).toBeInViewport({ ratio: .9 });
      await expectGuideTargetUncovered(page, '.hero-compare');
      await expect(async () => {
        const spotlight = (await page.locator('.wqi-guide-spotlight').boundingBox())!;
        const controls = (await page.locator('.hero-compare').boundingBox())!;
        const header = (await page.locator('.topnav').boundingBox())!;
        expect(spotlight.y).toBeGreaterThanOrEqual(header.y + header.height);
        expect(spotlight.y + spotlight.height).toBeGreaterThanOrEqual(controls.y + controls.height - 1);
        expect(spotlight.y).toBeLessThanOrEqual(controls.y + 1);
        if (viewport.width >= 1000) {
          const cards = (await page.locator('.param-tiles').boundingBox())!;
          expect(spotlight.y).toBeLessThanOrEqual(cards.y + 1);
          expect(spotlight.y + spotlight.height).toBeGreaterThanOrEqual(cards.y + cards.height - 1);
        }
      }).toPass({ timeout: 3000 });
      await page.screenshot({ path: `docs/local/screenshots/feature-guides/chart-parameters-${language}-${viewport.width}.png` });
      await page.keyboard.press('Escape'); await expect(help).toBeFocused();
      expect(await layout()).toEqual(before);
      expect(await page.locator('.param-tile, .hero-compare button').evaluateAll(elements => elements.map(element => element.getAttribute('aria-pressed')))).toEqual(selected);
      expect(await page.evaluate(() => localStorage.getItem('wqi-trend-config-v3'))).toBeNull();
    });
  }
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('chart parameter guidance handles hidden members without changing the chart', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/historical-data'); await next(page); await next(page);
  const cards = page.locator('[data-tour="chart-parameters"]'), comparison = page.locator('.hero-compare');
  await comparison.evaluate(element => { (element as HTMLElement).style.visibility = 'hidden'; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-parameters');
  await inViewport(page); await expectGuideTargetUncovered(page, '[data-tour="chart-parameters"]');
  await cards.evaluate(element => { (element as HTMLElement).style.display = 'none'; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0); await inViewport(page);
  await comparison.evaluate(element => { (element as HTMLElement).style.visibility = ''; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-parameters');
  await inViewport(page); await expectGuideTargetUncovered(page, '.hero-compare');
  await cards.evaluate(element => { (element as HTMLElement).style.display = ''; });
  await inViewport(page); await skip(page);
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('empty/error chart guidance stays readable on mobile and restores focus', async ({ page }) => {
  const f = await fixtures(page); f.state.emptyChart = true;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/historical-data');
  for (let index = 0; index < 6; index++) {
    await inViewport(page);
    if (index === 3) await page.screenshot({ path: 'docs/local/screenshots/feature-guides/chart-empty-vi-mobile.png' });
    if (index < 5) await next(page); else await guide(page).getByRole('button', { name: 'Hoàn tất' }).click();
  }
  f.state.chartError = true; await page.reload();
  const help = page.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' });
  await expect(help).toBeEnabled(); await expect(guide(page)).toHaveCount(0);
  await help.click(); await inViewport(page);
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('hidden chart targets use a centered explanation and update when visibility returns', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/historical-data');
  await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-filters');
  const target = page.locator('[data-tour="chart-filters"]');
  await target.evaluate(element => { (element as HTMLElement).style.visibility = 'hidden'; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await inViewport(page);
  await expect(guide(page)).toContainText('Bước 1 / 6');
  await target.evaluate(element => { (element as HTMLElement).style.visibility = ''; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', 'chart-filters');
  await target.evaluate(element => { (element as HTMLElement).style.opacity = '0'; });
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await page.keyboard.press('Escape'); expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

async function finishFrom(page: Page, first: number, total: number) {
  await expect(guide(page)).toContainText(`Step ${first} / ${total}`);
  for (let number = first; number < total; number++) {
    await next(page);
    await expect(guide(page)).toContainText(`Step ${number + 1} / ${total}`);
  }
  await guide(page).getByRole('button', { name: 'Finish', exact: true }).click();
}

test('first Excel click shows all 13 steps without opening a file or calling the batch API', async ({ page }) => {
  const f = await fixtures(page);
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.goto('/calculate');
  await page.locator('#coliform').fill('7.2');
  const picker = page.locator('.excel-file-button').first();
  await picker.click();
  await expect(guide(page)).toContainText('Step 1 / 13');
  expect(f.writes).toEqual([]);
  for (let number = 1; number <= 13; number++) {
    await inViewport(page);
    await expect(guide(page)).toContainText(`Step ${number} / 13`);
    if ([4, 7, 9, 12].includes(number)) {
      await expect(guide(page).getByLabel('Read-only illustration')).toBeVisible();
      await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
    }
    await page.screenshot({ path: `docs/local/screenshots/feature-guides/excel-user-continuous-${String(number).padStart(2, '0')}.png` });
    if (number < 13) await next(page);
  }
  await guide(page).getByRole('button', { name: 'Finish' }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.locator('#coliform')).toHaveValue('7.2');
  expect(f.writes).toEqual([]);
  const chooser = page.waitForEvent('filechooser');
  await picker.click();
  await chooser;
  expect(f.writes).toEqual([]);
  expect(f.errors).toEqual([]);
});

test('user replay starts from preview, progress, results, or history and never auto-reopens', async ({ page }) => {
  const f = await fixtures(page);
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.goto('/calculate');
  await page.locator('.excel-file-button').first().click();
  await finishFrom(page, 1, 13);
  await page.getByLabel('Excel file', { exact: true }).setInputFiles({ name: 'samples.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(page).toHaveURL(new RegExp('/excel/'));
  await expect(guide(page)).toHaveCount(0);
  const help = page.getByRole('button', { name: 'Excel WQI guide' });
  await help.click();
  await expect(guide(page)).toContainText('Step 4 / 13');
  await expect(guide(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
  await finishFrom(page, 4, 13);
  f.state.userStatus = 'paused'; f.state.userPause = 'AI_MODEL_CHANGED';
  await page.reload(); await expect(guide(page)).toHaveCount(0);
  await help.click(); await expect(guide(page)).toContainText('Step 7 / 13'); await skip(page);
  f.state.userStatus = 'completed_with_errors';
  await page.reload(); await expect(guide(page)).toHaveCount(0);
  await help.click(); await expect(guide(page)).toContainText('Step 9 / 13'); await skip(page);
  await page.goto('/history/excel');
  await page.getByRole('button', { name: 'Excel WQI guide' }).click();
  await expect(guide(page)).toContainText('Step 12 / 13');
  await expect(guide(page).getByRole('button', { name: 'Back' })).toHaveCount(0);
  await finishFrom(page, 12, 13);
  expect(f.writes).toEqual(['/prediction-batches/preview']); expect(f.errors).toEqual([]);
});

test('polling changes the real target to an illustration without resetting the guide step', async ({ page }) => {
  const f = await fixtures(page); f.state.userStatus = 'running';
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.goto(`/excel/${id}`);
  await page.getByRole('button', { name: 'Excel WQI guide' }).click();
  await expect(guide(page)).toContainText('Step 7 / 13');
  await next(page); await expect(guide(page)).toContainText('Step 8 / 13');
  const reads = f.gets.length;
  f.state.userStatus = 'completed_with_errors';
  await expect.poll(() => f.gets.length, { timeout: 10000 }).toBeGreaterThan(reads);
  await expect(guide(page)).toContainText('Step 8 / 13');
  await expect(guide(page).getByLabel('Read-only illustration')).toBeVisible();
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await next(page); await expect(guide(page)).toContainText('Step 9 / 13');
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('first admin visit shows all 14 steps with read-only examples before a file exists', async ({ page }) => {
  const f = await fixtures(page);
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/import');
  await expect(guide(page)).toContainText('Step 1 / 14');
  for (let number = 1; number <= 14; number++) {
    await inViewport(page);
    await expect(guide(page)).toContainText(`Step ${number} / 14`);
    if (number >= 4) {
      await expect(guide(page).getByLabel('Read-only illustration')).toBeVisible();
      await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
    }
    await page.screenshot({ path: `docs/local/screenshots/feature-guides/excel-admin-continuous-${String(number).padStart(2, '0')}.png` });
    if (number === 4) {
      await guide(page).getByRole('button', { name: 'Tiếng Việt' }).click();
      await expect(guide(page)).toContainText('Bước 4 / 14');
      await guide(page).getByRole('button', { name: 'English' }).click();
      await expect(guide(page)).toContainText('Step 4 / 14');
    }
    if (number < 14) await next(page);
  }
  await guide(page).getByRole('button', { name: 'Finish' }).click();
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('admin replay follows missing codes, preview, overwrite, and saved result', async ({ page }) => {
  const f = await fixtures(page); f.state.adminMissing = true;
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.goto('/admin/import'); await finishFrom(page, 1, 14);
  const file = { name: 'measurements.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') };
  await page.locator('#file').setInputFiles(file);
  const fillModal = page.locator('.modal[open]');
  await fillModal.getByLabel('Batch code', { exact: true }).fill('D01-2026');
  await fillModal.getByRole('button', { name: 'Monitoring Excel import guide' }).click();
  await expect(guide(page)).toContainText('Step 4 / 14');
  await page.keyboard.press('Escape');
  await expect(fillModal.getByLabel('Batch code', { exact: true })).toHaveValue('D01-2026');
  await fillModal.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Monitoring Excel import guide' }).click();
  await expect(guide(page)).toContainText('Step 4 / 14');
  await expect(guide(page).getByLabel('Read-only illustration')).toBeVisible();
  await skip(page);
  await page.getByRole('button', { name: 'Fill in batch codes and stations' }).click();
  await fillModal.getByLabel('Batch code', { exact: true }).fill('D01-2026');
  await fillModal.getByRole('button', { name: 'Assign', exact: true }).click();
  await fillModal.getByRole('combobox').last().selectOption('AH1');
  f.state.adminMissing = false;
  await fillModal.getByRole('button', { name: 'Check', exact: true }).click();
  const help = page.getByRole('button', { name: 'Monitoring Excel import guide' });
  await help.click(); await expect(guide(page)).toContainText('Step 7 / 14'); await skip(page);
  await page.getByRole('button', { name: /^Save 1 rows?$/ }).click();
  const overwrite = page.locator('.modal[open]');
  const checkbox = overwrite.getByRole('checkbox', { name: 'Overwrite batch D01-2026' });
  await checkbox.check();
  await overwrite.getByRole('button', { name: 'Monitoring Excel import guide' }).click();
  await expect(guide(page)).toContainText('Step 10 / 14'); await next(page);
  await expect(checkbox).toBeChecked(); await skip(page);
  await overwrite.getByRole('button', { name: /^Save 1 rows?$/ }).click();
  await expect(help).toBeEnabled();
  await help.click(); await expect(guide(page)).toContainText('Step 12 / 14');
  await finishFrom(page, 12, 14);
  expect(f.writes).toEqual(['/imports/preview', '/imports/preview', '/imports/commit']);
  expect(f.errors).toEqual([]);
});

test('admin file errors keep the flow available without retrying or saving', async ({ page }) => {
  const f = await fixtures(page); f.state.adminReadError = true;
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.goto('/admin/import'); await finishFrom(page, 1, 14);
  await page.locator('#file').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(page.locator('[data-tour="excel-admin-upload"] [role="alert"]')).toBeVisible();
  await page.getByRole('button', { name: 'Monitoring Excel import guide' }).click();
  await expect(guide(page)).toContainText('Step 1 / 14');
  await next(page); await next(page); await next(page);
  await expect(guide(page).getByLabel('Read-only illustration')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(f.writes).toEqual(['/imports/preview']); expect(f.errors).toEqual([]);
});
