// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { AdminUsersPage } from './AdminUsersPage';

const originalAdapter = http.defaults.adapter;
const account = { _id: 'u1', name: 'Bob Tran', email: 'bob@example.test', role: 'user', isActive: true, createdAt: '2020-01-01T00:00:00Z' };
let queries: Record<string, unknown>[] = [];
let patches: unknown[] = [];
function server() {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/csrf') return reply({ data: { csrfToken: 'a'.repeat(64) } });
    if (config.url === '/users' && config.method === 'get') { queries.push(config.params); return reply({ data: [account], meta: { page: 1, limit: 10, total: 1, pages: 1 } }); }
    if (config.url === '/users/u1') { patches.push(JSON.parse(config.data as string)); return reply({ data: account }); }
    throw new Error(`Unexpected request ${config.url}`);
  }) as AxiosAdapter;
}
beforeEach(async () => {
  await i18n.changeLanguage('en'); setCsrfToken(null); queries = []; patches = []; server();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; });

describe('Accounts', () => {
  it('lists every account by default, 10 per page', async () => {
    render(<MemoryRouter><AdminUsersPage/></MemoryRouter>);
    await screen.findByText('Bob Tran');
    expect(queries[0]).toMatchObject({ limit: 10, page: 1 });
    expect(queries[0].from).toBeUndefined();
    expect(queries[0].to).toBeUndefined();
  });

  it('searches on the server, not just the page on screen', async () => {
    render(<MemoryRouter><AdminUsersPage/></MemoryRouter>);
    await screen.findByText('Bob Tran');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), { target: { value: ' old account ' } });
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ q: 'old account', page: 1 }));
  });

  it('asks before locking an account', async () => {
    render(<MemoryRouter><AdminUsersPage/></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Lock Bob Tran' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Bob Tran');
    expect(patches).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(patches).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Lock Bob Tran' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lock account' })); });
    expect(patches).toEqual([{ isActive: false }]);
  });
});
