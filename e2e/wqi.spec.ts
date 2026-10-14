import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Local credentials stay in the ignored file; CI can supply a dedicated account.
const screenshotDirectory = `docs/local/screenshots/e2e-${Date.now()}`;
const credentialPath = resolve('.local/local-admin.json');
const credentials: { email: string; password: string } | null = process.env.E2E_EMAIL && process.env.E2E_PASSWORD
  ? { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
  : existsSync(credentialPath) ? JSON.parse(readFileSync(credentialPath, 'utf8')) : null;

test('real session: six inputs → trained model → result → persistent owner history', async ({ page }) => {
  test.skip(!credentials, 'Provide E2E_EMAIL/E2E_PASSWORD or the local ignored admin credentials file.');
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/calculate');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(credentials!.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials!.password);
  await page.getByRole('button', { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/calculate$/);
  await expect(page.locator('input[type="number"]')).toHaveCount(6);
  const submit = page.getByRole('button', { name: /calculate wqi/i });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/calculate$/);
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(6);
  // Synthetic integration vector; this verifies serving, not model accuracy.
  for (const [key, value] of Object.entries({ ph: 7.2, do: 5.7, cod: 25, nh4: 0.2, po4: 0.3, coliform: 5000 })) {
    await page.locator(`#${key}`).fill(String(value));
  }
  const responsePromise = page.waitForResponse(response => response.url().includes('/api/v1/predictions') && response.request().method() === 'POST');
  await submit.click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const { data: prediction } = await response.json();
  expect(Object.keys(prediction.parameters).sort()).toEqual(['cod', 'coliform', 'do', 'nh4', 'ph', 'po4']);
  expect(prediction.referenceBasis).toBe('lecturer-provided');
  expect(prediction.unitStatus).toBe('unverified');
  expect(prediction.algorithm).toBe('CatBoost');
  expect(prediction.predictionSchemaVersion).toBe('catboost-top6-amoni-v1');
  expect(prediction.modelVersion).toBe('callisto 2.0');
  // Compute the independent native reference; the test needs no session-only evidence file.
  const python = resolve('ai/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const reference = spawnSync(python, ['-B', '-c', `
import hashlib,json,math
from pathlib import Path
from catboost import CatBoostRegressor
path=Path('.local/ai/catboost/model.cbm')
model=CatBoostRegressor();model.load_model(str(path))
value=float(model.predict([[5000,0.2,7.2,0.3,5.7,25]])[0])
print(json.dumps(dict(rawWqi=value,wqi=math.floor(value+0.5),artifactSha256=hashlib.sha256(path.read_bytes()).hexdigest())))
`], { encoding: 'utf8', windowsHide: true });
  expect(reference.status).toBe(0);
  const direct = JSON.parse(reference.stdout);
  expect(prediction.rawWqi).toBeCloseTo(direct.rawWqi, 6);
  expect(prediction.wqi).toBe(direct.wqi);
  expect(prediction.artifactSha256).toBe(direct.artifactSha256);
  await expect(page).toHaveURL(new RegExp(`/result\\?id=${prediction._id}$`));
  await expect(page.getByText(prediction.qualityClass, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(prediction.modelVersion, { exact: true }).first()).toBeVisible();
  await page.goto('/history');
  await expect(page.locator(`a[href="/result?id=${prediction._id}"]`)).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/wqi-history-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/result?id=${prediction._id}`);
  await expect(page.getByText(prediction.qualityClass, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${screenshotDirectory}/result-desktop.png`, fullPage: true });
  const legacy = await page.request.get('/api/v1/predictions?limit=100');
  expect(legacy.ok()).toBe(true);
  const historical = (await legacy.json()).data.find((item: { parameters: Record<string, number> }) => Object.hasOwn(item.parameters, 'bod5'));
  if (historical) {
    await page.goto(`/result?id=${historical._id}`);
    await expect(page.getByText('BOD5', { exact: true })).toBeVisible();
    await expect(page.getByText('COD', { exact: true })).toHaveCount(0);
  }
  expect(failures).toEqual([]);
});
