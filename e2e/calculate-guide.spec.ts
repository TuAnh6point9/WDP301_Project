import { expect, test, type Page } from '@playwright/test';

test.use({ channel: process.env.E2E_CHANNEL });
const storageKey = 'wqi.guide.calculate.v1';
const id = '123456789012345678901234';
const parameters = { coliform: 5000, nh4: .2, ph: 7.2, po4: .3, do: 5.7, cod: 25 };
async function fixtures(page: Page, available = true) {
  const writes: { path: string; body: unknown }[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    const send = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path === '/auth/csrf') return send({ csrfToken: 'a'.repeat(64) });
    if (path === '/auth/me') return send({ _id: id, name: 'Guide tester', email: 'guide@example.test', role: 'user', isActive: true });
    if (path === '/predictions/status') return send({ available, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' });
    if (path === '/predictions' || path === `/predictions/${id}`) return send({ _id: id, parameters, wqi: 91, rawWqi: 90.5,
      qualityClass: 'Rất tốt', unitBasis: 'training-source-unverified', modelVersion: 'callisto 2.0', algorithm: 'CatBoost',
      unitStatus: 'unverified', referenceBasis: 'lecturer-provided', createdAt: '2026-10-29T03:00:00Z' }, request.method() === 'POST' ? 201 : 200);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
  });
  return { writes, errors };
}
const guide = (page: Page) => page.getByRole('dialog');
async function expectCardInViewport(page: Page) {
  const panel = page.locator('.wqi-guide-panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('first visit, skip, reload, replay and keyboard focus work in the real browser', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/calculate');
  await expect(guide(page)).toHaveAccessibleName('Hướng dẫn tính WQI');
  await expect(guide(page)).toContainText('Bước 1 / 5');
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  }
  await guide(page).getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  await expect(guide(page)).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe('done');
  const help = page.getByRole('button', { name: 'Hướng dẫn tính WQI', exact: true });
  await expect(help).toBeFocused();
  await page.reload();
  await expect(help).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await help.focus(); await page.keyboard.press('Enter');
  await expect(guide(page)).toContainText('Bước 1 / 5');
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await expect(guide(page)).toHaveCount(0);
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('all five steps preserve draft/errors, switch language, highlight targets and never calculate', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/calculate');
  await guide(page).getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  await page.locator('#ph').fill('15'); await page.locator('#ph').blur();
  await expect(page.locator('#ph')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Hướng dẫn tính WQI', exact: true }).click();
  for (const [index, target] of ['intro', 'inputs', 'validation', 'actions'].entries()) {
    await expect(guide(page)).toContainText(`Bước ${index + 1} / 5`);
    await expect(page.locator('.wqi-guide-spotlight')).toHaveAttribute('data-guide-target', target);
    await expectCardInViewport(page);
    await guide(page).getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  }
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await guide(page).getByRole('button', { name: 'English', exact: true }).click();
  await expect(guide(page)).toContainText('Step 5 / 5');
  await guide(page).getByRole('button', { name: 'Back', exact: true }).click();
  await expect(guide(page)).toContainText('Step 4 / 5');
  await guide(page).getByRole('button', { name: 'Next', exact: true }).click();
  await page.screenshot({ path: 'docs/local/screenshots/wqi-guide/results-en-desktop.png' });
  await guide(page).getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('#ph')).toHaveValue('15');
  await expect(page.locator('#ph')).toHaveAttribute('aria-invalid', 'true');
  expect(f.writes).toEqual([]);
  await page.reload(); await expect(page.getByRole('button', { name: 'WQI calculation guide', exact: true })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  for (const [key, value] of Object.entries(parameters)) await page.locator(`#${key}`).fill(String(value));
  await page.getByRole('button', { name: 'Calculate WQI', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/result\\?id=${id}$`));
  expect(f.writes).toEqual([{ path: '/predictions', body: { parameters, unitBasis: 'training-source-unverified' } }]);
  expect(f.errors).toEqual([]);
});

test('mobile/landscape cards stay in view with long bilingual content and reduced motion', async ({ page }) => {
  const f = await fixtures(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calculate');
  for (const language of ['vi', 'en'] as const) {
    if (language === 'en') {
      await page.getByRole('button', { name: 'Hướng dẫn tính WQI', exact: true }).click();
      await guide(page).getByRole('button', { name: 'English', exact: true }).click();
    }
    for (let step = 0; step < 5; step++) {
      for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await expectCardInViewport(page);
        const action = guide(page).getByRole('button', { name: step === 4 ? language === 'vi' ? 'Hoàn tất' : 'Finish' : language === 'vi' ? 'Tiếp theo' : 'Next', exact: true });
        await expect(action).toBeInViewport();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      if (step === 1) await page.screenshot({ path: `docs/local/screenshots/wqi-guide/inputs-${language}-mobile.png` });
      await guide(page).getByRole('button', { name: step === 4 ? language === 'vi' ? 'Hoàn tất' : 'Finish' : language === 'vi' ? 'Tiếp theo' : 'Next', exact: true }).click();
    }
  }
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('guide works with blocked storage and offline AI, including invisible-target fallback', async ({ page }) => {
  const f = await fixtures(page, false);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  await page.goto('/calculate');
  await expect(guide(page)).toBeVisible();
  await page.locator('[data-wqi-guide="inputs"]').evaluate(element => { (element as HTMLElement).style.display = 'none'; });
  await guide(page).getByRole('button', { name: 'Tiếp theo', exact: true }).click();
  await expect(page.locator('.wqi-guide-spotlight')).toHaveCount(0);
  await expectCardInViewport(page);
  await guide(page).getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tính WQI', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Hướng dẫn tính WQI', exact: true }).click();
  await expect(guide(page)).toContainText('Bước 1 / 5');
  await page.keyboard.press('Escape');
  expect(f.writes).toEqual([]); expect(f.errors).toEqual([]);
});

test('replay stays disabled while calculating or uploading and becomes available after failure', async ({ page }) => {
  const f = await fixtures(page);
  await page.goto('/calculate');
  await guide(page).getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  let finishRequest: (() => void) | undefined;
  const delay = async () => new Promise<void>(resolve => { finishRequest = resolve; });
  await page.route('**/api/v1/predictions', async route => {
    await delay();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AI_UNAVAILABLE' } }) });
  });
  for (const [key, value] of Object.entries(parameters)) await page.locator(`#${key}`).fill(String(value));
  await page.getByRole('button', { name: 'Tính WQI', exact: true }).click();
  const help = page.getByRole('button', { name: 'Hướng dẫn tính WQI', exact: true });
  await expect(help).toBeDisabled();
  await expect.poll(() => Boolean(finishRequest)).toBe(true); finishRequest!();
  await expect(help).toBeEnabled();
  await page.route('**/api/v1/prediction-batches/preview', async route => {
    await delay();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AI_UNAVAILABLE' } }) });
  });
  finishRequest = undefined;
  await page.getByLabel('Tệp Excel', { exact: true }).setInputFiles({ name: 'guide-fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('HTTP fixture only') });
  await expect(help).toBeDisabled();
  await expect.poll(() => Boolean(finishRequest)).toBe(true); finishRequest!();
  await expect(help).toBeEnabled();
  await help.click(); await expect(guide(page)).toContainText('Bước 1 / 5');
  expect(f.errors).toEqual([]);
});
