// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { http, setCsrfToken } from '@/lib/http';
import { i18n } from '@/i18n';
import { CalculatePage } from './CalculatePage';

const originalAdapter = http.defaults.adapter;
const writes: unknown[] = [];
let available = true;
const storageKey = 'wqi.guide.calculate.v1';
function open() {
  return render(<StrictMode><MemoryRouter initialEntries={['/calculate']}><AuthProvider><Routes>
    <Route path="/calculate" element={<CalculatePage/>}/>
  </Routes></AuthProvider></MemoryRouter></StrictMode>);
}
beforeEach(async () => {
  localStorage.clear(); writes.length = 0; available = true; setCsrfToken(null);
  await i18n.changeLanguage('vi');
  // jsdom has no layout or native modal implementation; browser tests cover both.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  http.defaults.adapter = async config => {
    if (config.method !== 'get') writes.push(config.data);
    const data = config.url === '/auth/csrf' ? { csrfToken: 'a'.repeat(64) }
      : config.url === '/auth/me' ? { _id: 'guide-user', role: 'user', name: 'Guide tester', email: 'guide@example.test', isActive: true }
      : { available, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' };
    return { data: { data }, config, status: 200, statusText: 'OK', headers: {} };
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('WQI calculation walkthrough', () => {
  it('opens on the first visit, remembers skipping and can always be reopened from step one', async () => {
    const first = open();
    const tour = await screen.findByRole('dialog', { name: 'Hướng dẫn tính WQI' });
    expect(within(tour).getByText('Bước 1 / 5')).toBeTruthy();
    fireEvent.click(within(tour).getByRole('button', { name: 'Bỏ qua' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe('done');
    first.unmount(); open();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn tính WQI' }));
    expect(within(screen.getByRole('dialog')).getByText('Bước 1 / 5')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('allows back/next/completion without modifying entered measurements or calculating', async () => {
    localStorage.setItem(storageKey, 'done'); open();
    await screen.findByLabelText('pH');
    fireEvent.change(screen.getByLabelText('pH'), { target: { value: '7.2' } });
    const originalInput = screen.getByLabelText('pH');
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn tính WQI' }));
    const tour = screen.getByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
    expect(within(tour).getByText('Bước 2 / 5')).toBeTruthy();
    expect(within(tour).getByText('Coliforms')).toBeTruthy();
    fireEvent.click(within(tour).getByRole('button', { name: 'Quay lại' }));
    expect(within(tour).getByText('Bước 1 / 5')).toBeTruthy();
    for (let index = 0; index < 4; index++) fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
    fireEvent.click(within(tour).getByRole('button', { name: 'Hoàn tất' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((originalInput as HTMLInputElement).value).toBe('7.2');
    expect(screen.getByLabelText('pH')).toBe(originalInput);
    expect(writes).toEqual([]);
  });

  it('switches languages in the open tour without resetting the current step', async () => {
    open();
    const tour = await screen.findByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
    fireEvent.click(within(tour).getByRole('button', { name: 'English' }));
    expect(within(tour).getByText('Step 2 / 5')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'WQI calculation guide' })).toBe(tour);
    fireEvent.click(within(tour).getByRole('button', { name: 'Skip' }));
    expect(writes).toEqual([]);
  });

  it('lets Escape dismiss the tour and restores focus to its reusable help button', async () => {
    localStorage.setItem(storageKey, 'done'); open();
    const help = screen.getByRole('button', { name: 'Hướng dẫn tính WQI' });
    help.focus(); fireEvent.click(help);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(document.activeElement).toBe(help));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem(storageKey)).toBe('done');
  });

  it('still explains the workflow when the AI is offline', async () => {
    available = false; open();
    const tour = await screen.findByRole('dialog');
    expect(within(tour).getByRole('button', { name: 'Tiếp theo' })).toBeTruthy();
    fireEvent.click(within(tour).getByRole('button', { name: 'Bỏ qua' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tính WQI' }) as HTMLButtonElement).disabled).toBe(true));
    expect(writes).toEqual([]);
  });

  it('keeps skip and replay working for this session when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = open();
    const tour = await screen.findByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Bỏ qua' }));
    first.unmount(); open();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn tính WQI' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('en'); });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(writes).toEqual([]);
  });
});
