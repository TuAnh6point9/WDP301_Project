// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { AuthProvider } from '@/features/auth/AuthContext';
import { FeatureGuide } from '@/features/guides/FeatureGuide';
import { http, setCsrfToken } from '@/lib/http';
import { i18n } from '@/i18n';

const original = http.defaults.adapter;
let account: string | null = null, firstLogin = false;
const writes: string[] = [];
const open = () => render(<MemoryRouter><AuthProvider><FeatureGuide id="calculate" stage="overview"/></AuthProvider></MemoryRouter>);
const skip = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip' }));
beforeEach(async () => {
  localStorage.clear(); setCsrfToken(null); account = null; firstLogin = false; writes.length = 0;
  await i18n.changeLanguage('en');
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  http.defaults.adapter = async config => {
    if (config.method !== 'get') writes.push(config.url!);
    if (config.url === '/auth/me' && !account) throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { config, status: 401, statusText: 'Unauthorized', headers: {}, data: { error: { code: 'UNAUTHENTICATED' } } });
    return { config, status: 200, statusText: 'OK', headers: {}, data: { data: config.url === '/auth/csrf' ? { csrfToken: 'a'.repeat(64) } : { _id: account, name: 'Guide tester', email: 'guide@example.test', role: 'user', isActive: true }, guidance: { autoStart: firstLogin } } };
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); http.defaults.adapter = original; setCsrfToken(null); });

describe('guest versus account automatic guide policy', () => {
  it('opens for guests on every fresh visit, even when old browser keys say done', async () => {
    localStorage.setItem('wqi.guide.calculate.v1', 'done');
    const first = open(); await screen.findByRole('dialog'); skip();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    first.unmount(); open(); await screen.findByRole('dialog');
    expect(writes).toEqual([]);
  });
  it('keeps guests closed after skipping until they leave, while manual replay remains available', async () => {
    open(); await screen.findByRole('dialog'); skip();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'WQI calculation guide' }));
    expect(screen.getByRole('dialog')).toBeVisible(); expect(writes).toEqual([]);
  });
  it('never auto-opens for an authenticated later login, even without browser storage', async () => {
    account = 'A'; firstLogin = false; open();
    const help = await screen.findByRole('button', { name: 'WQI calculation guide' });
    await waitFor(() => expect(help).toBeEnabled());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(help); expect(screen.getByRole('dialog')).toBeVisible();
  });
  it('automatically guides a first-login account independently of guest preferences', async () => {
    localStorage.setItem('wqi.guide.calculate.v1', 'done'); account = 'A'; firstLogin = true;
    open(); await screen.findByRole('dialog'); skip();
    expect(localStorage.getItem('wqi.guide.account.A.calculate.v1')).toBe('done');
  });
  it('keeps different accounts independent on a shared browser', async () => {
    account = 'A'; firstLogin = true; const a = open(); await screen.findByRole('dialog'); skip(); a.unmount();
    account = 'B'; const b = open(); await screen.findByRole('dialog'); skip(); b.unmount();
    account = 'A'; firstLogin = false; localStorage.clear(); open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'WQI calculation guide' })).toBeEnabled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
