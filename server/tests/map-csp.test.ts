import { readFileSync } from 'node:fs';
import session from 'express-session';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

afterEach(() => vi.unstubAllEnvs());

it('allows MapLibre tile hosts and same-origin workers without unsafe scripts on Express and Vercel', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017/map_csp_test_unused');
  vi.stubEnv('SESSION_SECRET', 'map-csp-test-secret-at-least-32-chars');
  vi.stubEnv('AI_MODE', 'disabled');
  const response = await request(createApp(new session.MemoryStore())).get('/api/v1/health/live');
  expect(response.status).toBe(200);
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const vercel = config.headers[0].headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value as string;
  for (const policy of [response.headers['content-security-policy'] as string, vercel]) {
    const directives = Object.fromEntries(policy.split(';').map(directive => directive.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['img-src']).toContain('https://services.arcgisonline.com');
    expect(directives['connect-src']).toContain('https://services.arcgisonline.com');
    expect(directives['worker-src']).toEqual(["'self'"]);
    expect(directives['frame-ancestors']).toEqual(expect.arrayContaining([expect.stringMatching(/^'(self|none)'$/)]));
  }
});
