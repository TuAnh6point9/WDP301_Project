// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { AdminSettingsPage } from './AdminSettingsPage';

const originalAdapter = http.defaults.adapter;
let stored = { qcvnColumn: 'A2', version: 0, updatedAt: null as string | null };
const patches: unknown[] = [];

beforeEach(async () => {
  stored = { qcvnColumn: 'A2', version: 0, updatedAt: null }; patches.length = 0; setCsrfToken('a'.repeat(64));
  await i18n.changeLanguage('en');
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown, status = 200) => ({ data: status < 400 ? { data } : { error: data }, status, statusText: 'OK', headers: {}, config });
    if (config.url !== '/settings') throw new Error(`Unexpected request ${config.url}`);
    if (config.method === 'patch') {
      const body = JSON.parse(config.data as string);
      patches.push(body);
      if (body.version !== stored.version) return Promise.reject(Object.assign(new Error('conflict'), { isAxiosError: true, config, response: reply({ code: 'RECORD_CHANGED' }, 409) }));
      stored = { qcvnColumn: body.qcvnColumn, version: stored.version + 1, updatedAt: '2026-11-11T01:00:00.000Z' };
    }
    return reply(stored);
  }) as AxiosAdapter;
});
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('admin Settings: QCVN column', () => {
  it('shows the stored column, saves a new one with its version and says so', async () => {
    render(<MemoryRouter><AdminSettingsPage/></MemoryRouter>);
    const a2 = await screen.findByRole('radio', { name: /Column A2/ });
    expect(a2).toBeChecked();
    // Phosphat is in the limits table, BOD5 is not.
    expect(screen.getByRole('rowheader', { name: 'Phosphat' })).toBeInTheDocument();
    expect(screen.queryByText('BOD5')).toBeNull();
    expect(document.querySelector('.save-bar')).toHaveAttribute('hidden');

    fireEvent.click(screen.getByRole('radio', { name: /Column B1/ }));
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('Save to apply column B1 to every chart.');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Settings saved'));
    expect(patches).toEqual([{ qcvnColumn: 'B1', version: 0 }]);
    expect(screen.getByRole('radio', { name: /Column B1/ })).toBeChecked();
    expect(document.querySelector('.save-bar')).toHaveAttribute('hidden');
  });

  it('lets the admin turn the QCVN limits off', async () => {
    render(<MemoryRouter><AdminSettingsPage/></MemoryRouter>);
    await screen.findByRole('radio', { name: /Column A2/ });
    fireEvent.click(screen.getByRole('radio', { name: /No QCVN limits/ }));
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('Save to turn QCVN limits off on every chart.');
    expect(document.querySelector('.qcvn-table .is-focus')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Settings saved'));
    expect(patches).toEqual([{ qcvnColumn: 'none', version: 0 }]);
  });

  it('reloads the stored column when another admin saved first', async () => {
    render(<MemoryRouter><AdminSettingsPage/></MemoryRouter>);
    await screen.findByRole('radio', { name: /Column A2/ });
    stored = { qcvnColumn: 'A1', version: 1, updatedAt: '2026-11-11T01:00:00.000Z' };
    fireEvent.click(screen.getByRole('radio', { name: /Column B2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Column A1/ })).toBeChecked());
    expect(screen.getByRole('status')).toHaveTextContent('The data has changed');
  });
});
