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
  await page.addInitScript(() => localStorage.setItem('wqi.guide.calculate.v1', 'done'));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const method = request.method();
    if (method === 'GET') gets.push(path); else writes.push(path);
    const meta = { page: 1, limit: 10, total: 1, pages: 1 };
    const send = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, meta }) });
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
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByRole('button', { name: 'So sánh COD', exact: true }).click();
  const from = await page.locator('#from').inputValue();
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
  await expect(page.locator('#from')).toHaveValue(from);
  await expect(page.getByRole('button', { name: 'Compare COD', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('wqi-trend-config-v2'))).toBeNull();
  await page.getByRole('button', { name: 'Chart settings', exact: true }).click();
  await expect(page.locator('#trend-panel').getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Chart guide', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#trend-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chart guide', exact: true })).toBeFocused();
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

test('private Excel guidance follows preview, polling and completion without triggering operations', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/calculate');
  // Fields unlock in model order (decision 28), so the first open field is Coliforms.
  await page.locator('#coliform').fill('7,2');
  await page.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }).click();
  await finish(page, 3);
  await expect(page.locator('#coliform')).toHaveValue('7,2'); expect(f.writes).toEqual([]);
  await page.getByLabel('File Excel', { exact: true }).setInputFiles({ name: 'samples.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'preview');
  await finish(page, 3); expect(f.writes).toEqual(['/prediction-batches/preview']);
  await page.getByRole('button', { name: 'Tính 1 dòng hợp lệ', exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }).click();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'progress');
  const reads = f.gets.length; f.state.userStatus = 'completed_with_errors';
  await expect.poll(() => f.gets.length).toBeGreaterThan(reads);
  await expect(page.locator('.excel-progress')).toHaveAttribute('value', '2');
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'progress');
  await finish(page, 2);
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'results');
  await page.screenshot({ path: 'docs/local/screenshots/feature-guides/excel-user-results-vi.png' });
  await finish(page, 3);
  const errorsOnly = page.getByLabel('Chỉ hiện dòng lỗi', { exact: true }); await errorsOnly.check();
  await page.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }).click();
  await guide(page).getByRole('button', { name: 'English', exact: true }).click();
  await skip(page); await expect(page.getByRole('checkbox')).toBeChecked();
  await page.reload(); await expect(page.getByRole('button', { name: 'Excel WQI guide' })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await page.goto('/history/excel');
  await page.getByRole('button', { name: 'Excel WQI guide' }).click(); await finish(page, 2);
  expect(f.writes).toEqual(['/prediction-batches/preview', `/prediction-batches/${id}/start`]); expect(f.errors).toEqual([]);
});

test('admin nested guides preserve fill drafts, overwrite choices and never submit on Escape', async ({ page }) => {
  const f = await fixtures(page); f.state.adminMissing = true;
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/admin/import'); await finish(page, 3);
  await page.locator('#file').setInputFiles({ name: 'measurements.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'fill'); await finish(page, 3);
  const fillModal = page.locator('.modal[open]');
  await fillModal.getByLabel('Mã đợt', { exact: true }).fill('D01-2026');
  await fillModal.getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc' }).click();
  await inViewport(page);
  await page.screenshot({ path: 'docs/local/screenshots/feature-guides/admin-fill-vi-mobile.png' });
  for (let index = 0; index < 8; index++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.wqi-guide')))).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(fillModal).toBeVisible(); await expect(fillModal.getByLabel('Mã đợt', { exact: true })).toHaveValue('D01-2026');
  await fillModal.getByRole('button', { name: 'Gán', exact: true }).click();
  await fillModal.getByRole('combobox').last().selectOption('AH1');
  f.state.adminMissing = false;
  await fillModal.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(fillModal).toHaveCount(0); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Lưu 1 dòng', exact: true }).click();
  const overwrite = page.locator('.modal[open]');
  const checkbox = overwrite.getByRole('checkbox', { name: 'Ghi đè đợt D01-2026' });
  await checkbox.check();
  await overwrite.getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc' }).click();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'overwrite');
  await next(page); await page.screenshot({ path: 'docs/local/screenshots/feature-guides/admin-overwrite-vi.png' });
  await page.keyboard.press('Escape');
  await expect(overwrite).toBeVisible(); await expect(checkbox).toBeChecked();
  expect(f.writes).toEqual(['/imports/preview', '/imports/preview']);
  await overwrite.getByRole('button', { name: 'Lưu 1 dòng', exact: true }).click();
  await expect(overwrite).toHaveCount(0); await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc' }).click();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'results'); await finish(page, 3);
  expect(f.writes).toEqual(['/imports/preview', '/imports/preview', '/imports/commit']); expect(f.errors).toEqual([]);
});

test('admin stages auto-open once, defer while saving, and finish on mobile in English', async ({ page }) => {
  const f = await fixtures(page); f.delaySave();
  await page.addInitScript(() => localStorage.setItem('wqi.language', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/import'); await finish(page, 3);
  await page.locator('#file').setInputFiles({ name: 'measurements.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'preview'); await inViewport(page); await finish(page, 3);
  await page.getByRole('button', { name: /^Save 1 rows?$/ }).click();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'overwrite'); await inViewport(page);
  await finish(page, 2);
  const modal = page.locator('.modal[open]'); const checkbox = modal.getByRole('checkbox', { name: 'Overwrite batch D01-2026' });
  await expect(checkbox).not.toBeChecked(); await checkbox.check();
  await modal.getByRole('button', { name: /^Save 1 rows?$/ }).click();
  await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Monitoring Excel import guide' })).toBeDisabled();
  await expect.poll(() => f.writes.includes('/imports/commit')).toBe(true); f.releaseSave();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'results'); await inViewport(page);
  await page.screenshot({ path: 'docs/local/screenshots/feature-guides/admin-results-en-mobile.png' });
  await finish(page, 3);
  expect(f.writes).toEqual(['/imports/preview', '/imports/commit']); expect(f.errors).toEqual([]);
});

test('paused, invalid and unavailable user batches retain manual guidance without starting work', async ({ page }) => {
  const f = await fixtures(page); f.state.userStatus = 'paused'; f.state.userPause = 'AI_MODEL_CHANGED';
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/excel/${id}`);
  const help = page.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel', exact: true });
  await expect(help).toBeEnabled(); await expect(guide(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tiếp tục', exact: true })).toBeDisabled();
  await help.click(); await expect(guide(page)).toHaveAttribute('data-guide-stage', 'progress');
  await inViewport(page); await finish(page, 2);
  f.state.userStatus = 'preview'; f.state.userValid = 0;
  await page.reload(); await expect(guide(page)).toHaveAttribute('data-guide-stage', 'preview');
  await finish(page, 3); await expect(page.getByRole('button', { name: 'Tính 0 dòng hợp lệ', exact: true })).toBeDisabled();
  f.state.userReadError = true; await page.reload();
  await expect(help).toBeEnabled(); await expect(guide(page)).toHaveCount(0);
  await help.click(); await inViewport(page); await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('admin guidance remains available after file and save failures without retrying requests', async ({ page }) => {
  const f = await fixtures(page); f.state.adminReadError = true;
  await page.goto('/admin/import'); await finish(page, 3);
  const file = { name: 'measurements.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') };
  await page.locator('#file').setInputFiles(file);
  await expect(page.locator('[data-tour="excel-admin-upload"] [role="alert"]')).toBeVisible();
  const help = page.getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc', exact: true });
  await help.click(); await finish(page, 3);
  f.state.adminReadError = false; f.state.adminNoValid = true;
  await page.getByRole('button', { name: 'Bỏ chọn', exact: true }).click();
  await page.locator('#file').setInputFiles(file); await expect(guide(page)).toHaveAttribute('data-guide-stage', 'preview');
  await finish(page, 3); await expect(page.getByRole('button', { name: 'Lưu 0 dòng', exact: true })).toBeDisabled();
  f.state.adminNoValid = false; f.state.adminCommitError = true;
  await page.getByRole('button', { name: 'Bỏ chọn', exact: true }).click(); await page.locator('#file').setInputFiles(file);
  await page.getByRole('button', { name: 'Lưu 1 dòng', exact: true }).click(); await finish(page, 2);
  const modal = page.locator('.modal[open]');
  await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Lưu 1 dòng', exact: true }).click();
  await expect(help).toBeEnabled(); await expect(page.locator('.toast.show')).toBeVisible();
  await expect(guide(page)).toHaveCount(0); await help.click();
  await expect(guide(page)).toHaveAttribute('data-guide-stage', 'preview'); await finish(page, 3);
  expect(f.writes.filter(path => path === '/imports/commit')).toHaveLength(1);
  expect(f.writes.filter(path => path === '/imports/preview')).toHaveLength(3); expect(f.errors).toEqual([]);
});
