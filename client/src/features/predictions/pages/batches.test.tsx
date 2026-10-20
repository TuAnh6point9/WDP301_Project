// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, setCsrfToken } from '@/lib/http';
import { AuthProvider } from '@/features/auth/AuthContext';
import { BatchPage } from './BatchPage';
import { BatchHistoryPage } from './BatchHistoryPage';
import { CalculatePage } from './CalculatePage';

const original = http.defaults.adapter;
const batch = { _id: '111111111111111111111111', fileName: 'samples.xlsx', status: 'preview', createdAt: '2026-10-14T03:00:00Z', rowCount: 2, validCount: 1, invalidCount: 1, successCount: 0, errorCount: 1 };
const values = { PH: 7.2, Temp: 25, BOD5: 3, COD: 25, DO: 5.7, Amoni: 0.2, Phosphat: 0.3, Coliforms: 5000 };
const rows = [{ _id: 'r1', rowNumber: 2, values, status: 'pending', issues: [] }, { _id: 'r2', rowNumber: 8, values: { ...values, PH: '7,2' }, status: 'invalid', issues: ['PH: Only numeric cells are accepted.'] }];
function mock(handler: (url: string, method: string, body: unknown, params: Record<string, unknown>) => unknown) {
  http.defaults.adapter = async config => ({ data: config.url === '/auth/me' ? { data: { _id: 'owner', role: 'user', name: 'Owner', isActive: true } } : config.url === '/auth/csrf' ? { data: { csrfToken: 'a'.repeat(64) } } : await handler(config.url!, config.method!, config.data, config.params ?? {}), status: 200, statusText: 'OK', headers: {}, config });
}
function open(path: string) { render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route path="/calculate" element={<CalculatePage/>}/><Route path="/excel/:id" element={<BatchPage/>}/><Route path="/history/excel" element={<BatchHistoryPage/>}/></Routes></AuthProvider></MemoryRouter>); }
afterEach(() => { cleanup(); http.defaults.adapter = original; setCsrfToken(null); });
describe('Excel calculation UI', () => {
  it('uploads multipart, shows invalid rows and starts only after explicit confirmation', async () => {
    const posted: string[] = [];
    mock((url, method, body) => {
      if (method === 'post') { posted.push(url); if (url.endsWith('/preview')) expect(body).toBeInstanceOf(FormData); return { data: url.endsWith('/start') ? { ...batch, status: 'queued' } : batch }; }
      return url.endsWith('/rows') ? { data: rows, meta: { page: 1, limit: 20, total: 2, pages: 1 } } : { data: batch };
    });
    open('/calculate');
    await screen.findByLabelText('Excel file');
    const input = screen.getByLabelText('Excel file');
    const picker = vi.spyOn(input as HTMLInputElement, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    expect(picker).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'How WQI is calculated' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Excel file'), { target: { files: [new File(['xlsx'], 'samples.xlsx')] } });
    await screen.findByText('samples.xlsx');
    expect(posted).toEqual(['/prediction-batches/preview']);
    expect(screen.getByText('PH: Only numeric cells are accepted.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate 1 valid row' }));
    await waitFor(() => expect(posted).toContain('/prediction-batches/111111111111111111111111/start'));
  });
  it('preserves manual inputs on cancel or invalid file and retries the same file without duplicate uploads', async () => {
    let uploads = 0;
    let rejectUpload: (error: Error) => void = () => {};
    mock((url, method) => {
      if (method === 'post') { uploads++; return new Promise((_resolve, reject) => { rejectUpload = reject; }); }
      return { data: { available: true, configured: true } };
    });
    open('/calculate');
    const input = await screen.findByLabelText('Excel file') as HTMLInputElement;
    fireEvent.change(screen.getByLabelText('pH'), { target: { value: '7.2' } });
    fireEvent.change(input, { target: { files: [] } });
    fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.csv')] } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Please choose an .xlsx file up to 5 MB.');
    const large = new File(['xlsx'], 'large.xlsx'); Object.defineProperty(large, 'size', { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [large] } });
    expect(uploads).toBe(0);
    expect((screen.getByLabelText('pH') as HTMLInputElement).value).toBe('7.2');
    const file = new File(['xlsx'], 'same.xlsx');
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploads).toBe(1));
    expect(input.value).toBe('');
    expect((screen.getByRole('button', { name: 'Calculate WQI' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => rejectUpload(new Error('network')));
    await screen.findByRole('alert');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploads).toBe(2));
    await act(async () => rejectUpload(new Error('network')));
  });
  it('waits for final rows before revealing completion and does not replay the reveal when filtering', async () => {
    let started = false;
    let finishRows: ((value: unknown) => void) | undefined;
    mock((url, method) => {
      if (method === 'post') { started = true; return { data: { ...batch, status: 'queued' } }; }
      if (url.endsWith('/rows')) return started ? new Promise(resolve => { finishRows = resolve; }) : { data: rows, meta: { total: 2, pages: 1 } };
      return { data: started ? { ...batch, status: 'completed_with_errors', successCount: 1 } : batch };
    });
    open(`/excel/${batch._id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Calculate 1 valid row' }));
    await waitFor(() => expect(finishRows).toBeTypeOf('function'));
    expect(document.querySelector('.excel-processing .loading-water')).not.toBeNull();
    expect(screen.queryByText('Completed with errors')).toBeNull();
    await act(async () => finishRows!({ data: [{ ...rows[0], status: 'success', result: { wqi: 83, qualityClass: 'Tốt' } }, rows[1]], meta: { total: 2, pages: 1 } }));
    await screen.findByText('Completed with errors');
    expect(screen.getByText('83')).toBeTruthy();
    expect(document.querySelector('.excel-processing')).toBeNull();
    const table = screen.getByRole('region', { name: 'Data and results' });
    expect(table.classList.contains('excel-results-reveal')).toBe(true);
    finishRows = undefined;
    fireEvent.click(screen.getByLabelText('Show error rows only'));
    await waitFor(() => expect(finishRows).toBeTypeOf('function'));
    await act(async () => finishRows!({ data: [rows[1]], meta: { total: 1, pages: 1 } }));
    expect(screen.getByRole('region', { name: 'Data and results' })).toBe(table);
    expect(table.classList.contains('excel-results-reveal')).toBe(true);
  });
  it('blocks all-invalid batches and exports before completion', async () => {
    mock(url => url.endsWith('/rows') ? { data: rows.slice(1), meta: { page: 1, limit: 20, total: 1, pages: 1 } } : { data: { ...batch, validCount: 0, invalidCount: 2 } });
    open(`/excel/${batch._id}`);
    await screen.findByText('samples.xlsx');
    expect((screen.getByRole('button', { name: 'Calculate 0 valid rows' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Download Excel results' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('offers resume for interrupted work and sends error filter to the server', async () => {
    mock((url, _method, _body, params) => url.endsWith('/rows') ? { data: params.filter === 'errors' ? rows.slice(1) : rows, meta: { page: 1, limit: 20, total: params.filter === 'errors' ? 1 : 2, pages: 1 } } : { data: { ...batch, status: 'paused', pauseCode: 'AI_TIMEOUT' } });
    open(`/excel/${batch._id}`);
    await screen.findByRole('button', { name: 'Continue' });
    fireEvent.click(screen.getByLabelText('Show error rows only'));
    await waitFor(() => expect(screen.queryByText('Pending')).toBeNull());
    expect(screen.getByText('PH: Only numeric cells are accepted.')).toBeTruthy();
  });
  it('lists batches separately with links to their results', async () => {
    mock(() => ({ data: [{ ...batch, status: 'completed_with_errors', successCount: 1 }], meta: { page: 1, limit: 20, total: 1, pages: 1 } }));
    open('/history/excel');
    await screen.findByText('samples.xlsx');
    expect(screen.getByRole('link', { name: 'Open batch' }).getAttribute('href')).toBe(`/excel/${batch._id}`);
  });
});
