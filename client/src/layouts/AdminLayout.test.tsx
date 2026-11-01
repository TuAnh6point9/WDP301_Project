// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AxiosAdapter } from 'axios';
import { i18n } from '@/i18n';
import { AuthProvider } from '@/features/auth/AuthContext';
import { http, setCsrfToken } from '@/lib/http';
import { AdminDashboardPage } from '@/features/system/pages/AdminDashboardPage';
import { AdminLayout } from './AdminLayout';

const originalAdapter = http.defaults.adapter;
const admin = { _id: 'admin-1', name: 'Jane Admin', email: 'jane@example.com', role: 'admin', isActive: true };
const summary = {
  users: { total: 4, active: 3, admins: 1 }, stations: { active: 0 }, imports: { batches: 2, rows: 1200 },
  records: { pending: 1, verified: 5, rejected: 0 }, predictions: 9, queue: { pendingRecords: 3 },
};
function server(answers: Record<string, unknown>) {
  http.defaults.adapter = (async config => {
    const data = config.url === '/auth/csrf' ? { csrfToken: 'a'.repeat(64) } : config.url === '/auth/me' ? admin : answers[config.url ?? ''];
    if (data === undefined) throw new Error(`Unexpected request ${config.url}`);
    return { data: config.url === '/audit-logs' ? data : { data }, status: 200, statusText: 'OK', headers: {}, config };
  }) as AxiosAdapter;
}
function open() {
  return render(<MemoryRouter initialEntries={['/admin']}><AuthProvider><Routes>
    <Route element={<AdminLayout/>}><Route path="/admin" element={<AdminDashboardPage/>}/></Route>
  </Routes></AuthProvider></MemoryRouter>);
}
beforeEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); setCsrfToken(null); });
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; localStorage.clear(); });

const healthy = {
  '/dashboard/summary': summary, '/audit-logs': { data: [], meta: { page: 1, limit: 5, total: 0, pages: 0 } },
  '/health/live': { status: 'ok' }, '/health/ready': { database: 'connected' }, '/predictions/status': { available: true, configured: true },
};

describe('admin layout', () => {
  it('groups the menu by daily job and remembers a collapsed menu', async () => {
    server(healthy);
    const { unmount } = open();
    const daily = await screen.findByRole('group', { name: 'Daily work' });
    expect(within(daily).getAllByRole('link').map(link => link.textContent)).toEqual(['Dashboard', 'Import Excel Data', 'Review Data']);
    expect(within(screen.getByRole('group', { name: 'Manage' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Stations', 'Accounts']);
    expect(within(screen.getByRole('group', { name: 'System' })).getAllByRole('link').map(link => link.textContent)).toEqual(['System Health', 'Settings']);
    const toggle = screen.getByRole('button', { name: 'Collapse menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand menu' }).getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('wqi.admin.sidebar-collapsed')).toBe('true');
    unmount();
    open();
    expect((await screen.findByRole('button', { name: 'Expand menu' })).getAttribute('aria-expanded')).toBe('false');
  });
});

describe('admin dashboard', () => {
  it('puts waiting work first and explains a waking AI in plain words', async () => {
    server({ ...healthy, '/predictions/status': { available: false, configured: true, reason: 'AI_TIMEOUT' } });
    open();
    expect(await screen.findByRole('heading', { name: 'Hello, Jane Admin' })).toBeTruthy();
    const todo = (await screen.findByText('3 measurements are waiting for your review.')).closest('ul')!;
    // Imports save records directly since decision 24, so there are no Excel rows left to convert.
    expect(within(todo).getAllByRole('listitem')).toHaveLength(2);
    expect(within(todo).getByText('No station is active, so the public map is empty.')).toBeTruthy();
    expect(within(todo).getByRole('link', { name: 'Review now' }).getAttribute('href')).toBe('/admin/data');
    expect((await screen.findByText(/AI Service is starting up/)).closest('[role="status"]')).toBeTruthy();
  });
});
