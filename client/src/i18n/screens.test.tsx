// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosAdapter } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { PublicLayout } from '@/layouts/PublicLayout';
import { CalculatePage } from '@/features/predictions/pages/CalculatePage';
import { ResultPage } from '@/features/predictions/pages/ResultPage';
import { HistoryPage } from '@/features/predictions/pages/HistoryPage';
import { BatchPage } from '@/features/predictions/pages/BatchPage';
import { ReportPage } from '@/features/reports/pages/ReportPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { http, setCsrfToken } from '@/lib/http';
import { i18n } from './index';

const original = http.defaults.adapter;
const parameters = { coliform: 5000, nh4: .2, ph: 7.2, po4: .3, do: 5.7, cod: 25 };
const prediction = { _id: '123456789012345678901234', parameters, wqi: 91, rawWqi: 90.5,
  qualityClass: 'Rất tốt', unitBasis: 'training-source-unverified', modelVersion: 'callisto 2.0',
  algorithm: 'CatBoost', unitStatus: 'unverified', referenceBasis: 'lecturer-provided', createdAt: '2026-10-20T03:00:00Z' };
const calls: { url: string; method: string; body: unknown }[] = [];
function server(handler?: (config: Parameters<AxiosAdapter>[0]) => unknown | Promise<unknown>) {
  http.defaults.adapter = async config => {
    calls.push({ url: config.url!, method: config.method!, body: config.data });
    let data;
    if (config.url === '/auth/csrf') data = { data: { csrfToken: 'a'.repeat(64) } };
    else if (config.url === '/auth/me') data = { data: { _id: 'test', role: 'admin', name: 'Tên trạm nguyên gốc', email: 'test@example.test' } };
    else if (config.url === '/predictions/status') data = { data: { available: true, configured: true } };
    else data = await handler?.(config) ?? { data: prediction };
    return { data, config, status: 200, statusText: 'OK', headers: {} };
  };
}
function open(path = '/calculate') {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage/>}/>
    <Route element={<PublicLayout/>}>
      <Route path="/calculate" element={<CalculatePage/>}/>
      <Route path="/result" element={<ResultPage/>}/>
      <Route path="/history" element={<HistoryPage/>}/>
      <Route path="/excel/:id" element={<BatchPage/>}/>
      <Route path="/report" element={<ReportPage/>}/>
    </Route>
  </Routes></AuthProvider></MemoryRouter>);
}
function english() { fireEvent.click(screen.getByRole('button', { name: 'English' })); }
function vietnamese() { fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' })); }
function fill() {
  for (const [key, value] of Object.entries(parameters)) fireEvent.change(document.getElementById(key)!, { target: { value: String(value) } });
}
beforeEach(async () => { localStorage.clear(); localStorage.setItem('wqi.guide.calculate.v1', 'done'); calls.length = 0; setCsrfToken(null); await i18n.changeLanguage('vi'); });
afterEach(() => { cleanup(); http.defaults.adapter = original; setCsrfToken(null); });

describe('bilingual user workflows with isolated HTTP fixtures', () => {
  it('starts in Vietnamese, retains inputs/errors on switch, avoids refetch and submits unchanged measurements once', async () => {
    server();
    open();
    expect(screen.getByRole('heading', { name: 'Tính WQI bằng AI' })).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tính WQI' }) as HTMLButtonElement).disabled).toBe(false));
    fill();
    const input = screen.getByLabelText('Amoni') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.blur(input);
    expect(document.getElementById('nh4-hint')!.textContent).toBe('Giá trị không được âm.');
    const count = calls.length;
    english();
    expect(document.getElementById('nh4')).toBe(input);
    expect(input.value).toBe('-1');
    expect(document.getElementById('nh4-hint')!.textContent).toBe('Value cannot be negative.');
    expect(calls).toHaveLength(count);
    fireEvent.change(input, { target: { value: '.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate WQI' }));
    await screen.findByRole('heading', { name: 'WQI Result' });
    const posted = calls.filter(call => call.method === 'post');
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0].body as string)).toEqual({ parameters, unitBasis: 'training-source-unverified' });
    expect(screen.getAllByText('Very good').length).toBeGreaterThan(0);
    vietnamese();
    expect(screen.getAllByText('Rất tốt').length).toBeGreaterThan(0);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('91');
    expect(calls.filter(call => call.method === 'post')).toHaveLength(1);
  });

  it('translates an already displayed API error in both directions and retains entered values', async () => {
    server(config => {
      if (config.method === 'post') throw new AxiosError('Private stack', 'ERR_BAD_REQUEST', config, undefined,
        { data: { error: { code: 'AI_OUTPUT_OUT_OF_RANGE', message: 'Private stack CODE_123' } }, status: 422, statusText: 'Error', headers: {}, config });
      return { data: prediction };
    });
    open();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tính WQI' }) as HTMLButtonElement).disabled).toBe(false));
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Tính WQI' }));
    await screen.findByText('Mô hình trả WQI ngoài 0–100; kết quả đã bị loại và không được lưu.');
    const requests = calls.length;
    english();
    expect(screen.getByRole('alert').textContent).toContain('discarded and not saved');
    vietnamese();
    expect(screen.getByRole('alert').textContent).toContain('không được lưu');
    expect(document.body.textContent).not.toContain('CODE_123');
    expect((document.getElementById('ph') as HTMLInputElement).value).toBe('7.2');
    expect(calls).toHaveLength(requests);
  });

  it('does not duplicate or reset an in-flight prediction on language change', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    server(config => config.method === 'post' ? new Promise(done => { resolve = done; }) : { data: prediction });
    open();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tính WQI' }) as HTMLButtonElement).disabled).toBe(false));
    fill(); fireEvent.click(screen.getByRole('button', { name: 'Tính WQI' }));
    await waitFor(() => expect(resolve).toBeDefined());
    english();
    expect((screen.getByRole('button', { name: 'Calculating WQI…' }) as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('ph') as HTMLInputElement).value).toBe('7.2');
    expect(calls.filter(call => call.method === 'post')).toHaveLength(1);
    await act(async () => resolve!({ data: prediction }));
    await screen.findByRole('heading', { name: 'WQI Result' });
  });

  it('translates an existing login failure without clearing credentials or resubmitting', async () => {
    server(config => {
      if (config.url === '/auth/login') throw new AxiosError('Private diagnostic', 'ERR_BAD_REQUEST', config, undefined,
        { data: { error: { code: 'INVALID_CREDENTIALS', message: 'Private diagnostic CODE_123' } }, status: 401, statusText: 'Error', headers: {}, config });
      return { data: prediction };
    });
    open('/login');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Đăng nhập' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'wrong@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), { target: { value: 'invalid-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByText('Email hoặc mật khẩu không đúng.');
    const requests = calls.length;
    english();
    expect(screen.getByRole('alert').textContent).toContain('Incorrect email or password.');
    expect((screen.getByLabelText('Password', { exact: true }) as HTMLInputElement).value).toBe('invalid-password');
    expect(document.body.textContent).not.toContain('CODE_123');
    expect(calls).toHaveLength(requests);
  });

  it('keeps the report article in English while localizing its surrounding controls', async () => {
    server(() => ({ data: [prediction], meta: { page: 1, limit: 20, total: 1, pages: 1 } }));
    open('/report');
    await screen.findByRole('heading', { name: 'Xuất báo cáo' });
    const paper = document.querySelector('article.paper')!;
    const before = paper.textContent;
    expect(paper.getAttribute('lang')).toBe('en');
    expect(before).toContain('Very good');
    expect(before).toContain('Calculated At');
    expect(before).not.toContain('Rất tốt');
    english();
    expect(screen.getByRole('heading', { name: 'Export Report' })).toBeTruthy();
    expect(paper.textContent).toBe(before);
    vietnamese();
    expect(paper.textContent).toBe(before);
  });

  it('translates running batch status and legacy row issues without restarting work', async () => {
    const batch = { _id: 'batch', status: 'running', fileName: 'Dữ liệu nguồn.xlsx', rowCount: 2, validCount: 1, invalidCount: 1, successCount: 0, errorCount: 1 };
    server(config => config.url?.endsWith('/rows')
      ? { data: [{ _id: 'row', rowNumber: 2, values: { PH: 'bad' }, status: 'invalid', issues: ['PH: Only numeric cells are accepted.'] }], meta: { page: 1, limit: 20, total: 1, pages: 1 } }
      : { data: batch });
    open('/excel/batch');
    await screen.findByText('PH: Chỉ chấp nhận ô chứa số.');
    expect(document.querySelector('.badge[role="status"]')?.textContent).toBe('Đang tính');
    const requests = calls.length;
    const progress = screen.getByRole('progressbar');
    english();
    expect(document.querySelector('.badge[role="status"]')?.textContent).toBe('Calculating');
    expect(screen.getByText('PH: Only numeric cells are accepted.')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBe(progress);
    expect(screen.getByText('Dữ liệu nguồn.xlsx')).toBeTruthy();
    expect(calls).toHaveLength(requests);
    expect(calls.filter(call => call.method === 'post')).toHaveLength(0);
  });
});
