import { describe, expect, it } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { csrfProtection, csrfToken } from '../src/middleware/authenticate.js';
import { errorHandler } from '../src/middleware/error-handler.js';

// The Android app (07/11) sends no Origin header: it must still prove the session-bound token, while foreign origins stay blocked.
const ORIGIN = 'http://allowed.test';
const app = express();
app.use(session({ secret: 'csrf-test-secret-at-least-32-characters', resave: false, saveUninitialized: false, store: new session.MemoryStore() }));
app.use(csrfProtection([ORIGIN]));
app.get('/csrf', (req, res) => { req.session.csrfToken ??= csrfToken(); res.json({ csrfToken: req.session.csrfToken }); });
app.post('/write', (_req, res) => { res.status(204).end(); });
app.use(errorHandler);

async function signedAgent() {
  const agent = request.agent(app);
  const token = (await agent.get('/csrf')).body.csrfToken as string;
  return { agent, token };
}
const code = (response: request.Response) => response.body.error?.code;

describe('csrfProtection', () => {
  it('accepts the allowed origin with the session token', async () => {
    const { agent, token } = await signedAgent();
    expect((await agent.post('/write').set('Origin', ORIGIN).set('X-CSRF-Token', token)).status).toBe(204);
  });
  it('rejects a foreign origin even with a valid token', async () => {
    const { agent, token } = await signedAgent();
    const response = await agent.post('/write').set('Origin', 'https://evil.test').set('X-CSRF-Token', token);
    expect([response.status, code(response)]).toEqual([403, 'ORIGIN_REJECTED']);
  });
  it('rejects the opaque "null" origin', async () => {
    const { agent, token } = await signedAgent();
    const response = await agent.post('/write').set('Origin', 'null').set('X-CSRF-Token', token);
    expect([response.status, code(response)]).toEqual([403, 'ORIGIN_REJECTED']);
  });
  it('accepts a native request without Origin when it carries the session token', async () => {
    const { agent, token } = await signedAgent();
    expect((await agent.post('/write').set('X-CSRF-Token', token)).status).toBe(204);
  });
  it('rejects a request without Origin when the token is missing, wrong or from another session', async () => {
    const { agent, token } = await signedAgent();
    const other = await signedAgent();
    for (const sent of [undefined, 'a'.repeat(64), other.token]) {
      const call = agent.post('/write');
      const response = await (sent ? call.set('X-CSRF-Token', sent) : call);
      expect([response.status, code(response)], String(sent)).toEqual([403, 'CSRF_REJECTED']);
    }
    // Without the session cookie a copied token is useless too.
    const response = await request(app).post('/write').set('X-CSRF-Token', token);
    expect([response.status, code(response)]).toEqual([403, 'CSRF_REJECTED']);
  });
});
