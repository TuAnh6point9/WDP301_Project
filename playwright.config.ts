import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 10000 }, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } } : {}) } }],
  webServer: [
    { command: 'npx tsx e2e/start-server.ts', url: 'http://127.0.0.1:5001/api/v1/health/ready', reuseExistingServer: false, timeout: 60000 },
    { command: 'npm run dev -w @wqi/client -- --port 5174', url: 'http://127.0.0.1:5174', env: { API_PROXY_URL: 'http://127.0.0.1:5001' }, reuseExistingServer: false, timeout: 60000 },
  ],
});
