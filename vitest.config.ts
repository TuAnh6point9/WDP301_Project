import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./client/src', import.meta.url)) } },
  test: {
    include: ['client/src/**/*.test.{ts,tsx}', 'packages/contracts/src/**/*.test.ts', 'server/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
