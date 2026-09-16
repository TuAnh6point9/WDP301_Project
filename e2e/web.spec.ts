import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test('public web shows empty real-data states and protects administration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Chất lượng nước An Kim Hải' })).toBeVisible();
  await expect(page.getByText('Chưa có trạm với tọa độ được cung cấp.')).toBeVisible();
  await expect(page.getByText('Chưa có bản ghi đã kiểm định để hiển thị.')).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/dashboard.png', fullPage: true });
  await page.goto('/admin/imports');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill('user@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('isolated-test-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/predict');
  await page.goto('/admin/imports');
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
  await page.goto('/predict');
  await expect(page.getByText(/Chức năng dự đoán chưa khả dụng/).first()).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/prediction-disabled.png', fullPage: true });
});

test('administrator can inspect and import the supplied real workbook without creating measurements', async ({ page }) => {
  const source = process.env.WQI_SOURCE_XLSX;
  test.skip(!source || !existsSync(source), 'Set WQI_SOURCE_XLSX to run the supplied-workbook browser check.');
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('isolated-test-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL('/admin/imports');
  await page.goto('/admin/imports');
  await page.locator('input[type=file]').setInputFiles(source!);
  await page.getByRole('button', { name: /xem trước/i }).click();
  await expect(page.getByText(/756/).first()).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/import-preview.png', fullPage: true });
});
