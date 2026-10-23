// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { http, setCsrfToken } from '@/lib/http';
import { AuthProvider, useAuth } from './AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RequireAuth } from './RequireAuth';
import { AdminLayout } from '@/layouts/AdminLayout';

const originalAdapter = http.defaults.adapter;
const user = { _id: '123456789012345678901234', name: 'Jane Researcher', email: 'jane@example.com', role: 'user', isActive: true };
const firstToken = 'a'.repeat(64), rotatedToken = 'b'.repeat(64);
function UserView() { const auth = useAuth(); return <><p>{auth.user?.name || 'Anonymous'}</p><button onClick={() => void auth.signIn({ email: 'jane@example.com', password: 'real-password' })}>Start session</button><button onClick={() => void auth.signOut()}>End session</button></>; }
beforeEach(() => { sessionStorage.clear(); setCsrfToken(null); });
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; sessionStorage.clear(); setCsrfToken(null); });

describe('real session authentication', () => {
  it('waits for session restoration before deciding whether to redirect', async () => {
    let restore!: (value: unknown) => void;
    http.defaults.adapter = async config => ({ data: config.url === '/auth/csrf' ? { data: { csrfToken: firstToken } } : await new Promise(resolve => { restore = resolve; }), status: 200, statusText: 'OK', headers: {}, config });
    render(<MemoryRouter initialEntries={['/private']}><AuthProvider><Routes><Route path="/login" element={<p>Login required</p>}/><Route element={<RequireAuth/>}><Route path="/private" element={<p>Private page</p>}/></Route></Routes></AuthProvider></MemoryRouter>);
    await waitFor(() => expect(restore).toBeTypeOf('function'));
    expect(screen.queryByText('Login required')).toBeNull();
    restore({ data: user });
    await screen.findByText('Private page');
  });

  it('does not let a late anonymous restore overwrite a successful login', async () => {
    let failRestore!: () => void;
    http.defaults.adapter = async config => {
      if (config.url === '/auth/me') return new Promise((_resolve, reject) => { failRestore = () => reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } }, status: 401, statusText: 'Unauthorized', headers: {}, config })); });
      return { data: config.url === '/auth/csrf' ? { data: { csrfToken: firstToken } } : { data: { user, csrfToken: rotatedToken } }, status: 200, statusText: 'OK', headers: {}, config };
    };
    render(<AuthProvider><UserView/></AuthProvider>);
    await waitFor(() => expect(failRestore).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await screen.findByText('Jane Researcher');
    await act(async () => failRestore());
    expect(screen.getByText('Jane Researcher')).toBeTruthy();
  });

  it('denies an ordinary server user access to the admin layout', async () => {
    sessionStorage.setItem('wqi-demo-role', 'admin');
    http.defaults.adapter = async config => ({ data: config.url === '/auth/csrf' ? { data: { csrfToken: firstToken } } : { data: user }, status: 200, statusText: 'OK', headers: {}, config });
    render(<MemoryRouter initialEntries={['/admin']}><AuthProvider><AdminLayout/></AuthProvider></MemoryRouter>);
    await screen.findByText('Access denied');
    expect(screen.queryByText('System Admin')).toBeNull();
  });

  it('ignores a stored demo admin role and restores the actual session', async () => {
    sessionStorage.setItem('wqi-demo-role', 'admin');
    http.defaults.adapter = async config => ({ data: config.url === '/auth/csrf' ? { data: { csrfToken: firstToken } } : { data: user }, status: 200, statusText: 'OK', headers: {}, config });
    render(<AuthProvider><UserView/></AuthProvider>);
    await screen.findByText('Jane Researcher');
    expect(screen.queryByText('Demo Admin')).toBeNull();
  });

  it('logs in with credentials and uses the rotated CSRF token for logout', async () => {
    const requests: { url?: string; body: unknown; token: unknown }[] = [];
    http.defaults.adapter = async config => {
      requests.push({ url: config.url, body: config.data ? JSON.parse(config.data) : null, token: config.headers.get('X-CSRF-Token') });
      if (config.url === '/auth/me') throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } }, status: 401, statusText: 'Unauthorized', headers: {}, config });
      const data = config.url === '/auth/csrf' ? { data: { csrfToken: firstToken } } : config.url === '/auth/login' ? { data: { user, csrfToken: rotatedToken } } : undefined;
      return { data, status: config.url === '/auth/logout' ? 204 : 200, statusText: 'OK', headers: {}, config };
    };
    render(<MemoryRouter><AuthProvider><LoginPage/><UserView/></AuthProvider></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'real-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await screen.findByText('Jane Researcher');
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(requests.find(item => item.url === '/auth/logout')?.token).toBe(rotatedToken));
    expect(requests.find(item => item.url === '/auth/login')).toMatchObject({ body: { email: 'jane@example.com', password: 'real-password' }, token: firstToken });
    await screen.findByText('Anonymous');
    expect(sessionStorage.getItem('wqi-demo-role')).toBeNull();
  });
});
