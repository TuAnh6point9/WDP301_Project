import { afterEach, describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { submitPrediction } from './predict';

// Requirement section 7: the same six numbers give the same request on Web, Mobile and the AI service.
const typed = { coliform: '5000', nh4: '0,2', ph: '7,2', po4: '0,3', do: '5,7', cod: '25' };
const expectedBody = { parameters: { coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 }, unitBasis: 'training-source-unverified' };
const original = http.defaults.adapter;
afterEach(() => { http.defaults.adapter = original; setCsrfToken(null); });

function capture() {
  const sent: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async config => {
    sent.push(config);
    const data = config.url === '/auth/csrf' ? { data: { csrfToken: 'f'.repeat(64) } }
      : config.url === '/predictions' ? { data: { _id: 'p1', ...expectedBody, wqi: 41, qualityClass: 'Trung bình', createdAt: '2026-11-07T00:00:00Z' } }
        : { data: { ...expectedBody, wqi: 41, qualityClass: 'Trung bình', createdAt: '2026-11-07T00:00:00Z' } };
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  http.defaults.adapter = adapter;
  return sent;
}
const writes = (sent: InternalAxiosRequestConfig[]) => sent.filter(config => config.method === 'post');

describe('prediction request parity with the web', () => {
  it('sends a guest preview with the exact web body and a CSRF token', async () => {
    const sent = capture();
    const outcome = await submitPrediction(typed, false);
    const [post] = writes(sent);
    expect(post.url).toBe('/predictions/preview');
    expect(JSON.parse(post.data as string)).toEqual(expectedBody);
    expect(post.headers['X-CSRF-Token']).toBe('f'.repeat(64));
    expect(outcome).toMatchObject({ kind: 'preview', preview: { wqi: 41, qualityClass: 'Trung bình' } });
  });
  it('saves a signed-in prediction with the same body', async () => {
    const sent = capture();
    const outcome = await submitPrediction(typed, true);
    const [post] = writes(sent);
    expect(post.url).toBe('/predictions');
    expect(JSON.parse(post.data as string)).toEqual(expectedBody);
    expect(outcome).toEqual({ kind: 'saved', id: 'p1' });
  });
  it('sends nothing while a field is invalid and reports the first field to fix', async () => {
    const sent = capture();
    const outcome = await submitPrediction({ ...typed, ph: '15' }, false);
    expect(writes(sent)).toHaveLength(0);
    expect(outcome).toMatchObject({ kind: 'invalid', firstInvalid: 2 });
  });
});
