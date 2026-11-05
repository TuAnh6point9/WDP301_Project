// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AxiosAdapter } from 'axios';
import { AuthProvider } from '@/features/auth/AuthContext';
import { HistoricalDataPage } from '@/features/water-records/pages/HistoricalDataPage';
import { AdminImportPage } from '@/features/imports/pages/AdminImportPage';
import { BatchPage } from '@/features/predictions/pages/BatchPage';
import { CalculatePage } from '@/features/predictions/pages/CalculatePage';
import { http, setCsrfToken } from '@/lib/http';
import { i18n } from '@/i18n';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

const originalAdapter = http.defaults.adapter;
const writes: string[] = [];
let batchStatus = 'preview';
let missingCodes = false;
const meta = { page: 1, limit: 10, total: 0, pages: 1 };
const station = { _id: '123456789012345678901234', code: 'AH1', name: 'Station fixture', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.5, 20.9] }, isActive: true };
function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/historical-data" element={<HistoricalDataPage/>}/>
    <Route path="/admin/import" element={<AdminImportPage/>}/>
    <Route path="/excel/:id" element={<BatchPage/>}/>
    <Route path="/calculate" element={<CalculatePage/>}/>
  </Routes></AuthProvider></MemoryRouter>);
}
async function finish(title: string, steps: number) {
  const tour = await screen.findByRole('dialog', { name: title });
  for (let index = 1; index < steps; index++) fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
  fireEvent.click(within(tour).getByRole('button', { name: 'Hoàn tất' }));
}
beforeEach(async () => {
  localStorage.clear(); writes.length = 0; batchStatus = 'preview'; missingCodes = false; setCsrfToken(null);
  localStorage.setItem('wqi.guide.calculate.v1', 'done');
  await i18n.changeLanguage('vi');
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  http.defaults.adapter = async config => {
    const url = config.url!;
    if (config.method !== 'get') writes.push(url);
    let data: unknown = null;
    if (url === '/auth/csrf') data = { csrfToken: 'a'.repeat(64) };
    else if (url === '/auth/me') data = { _id: 'guide-user', name: 'Guide fixture', role: 'admin', email: 'guide@example.test', isActive: true };
    else if (url === '/stations') data = [station];
    else if (url === '/water-records' || url === '/imports') data = [];
    else if (url === '/predictions/status') data = { available: false, configured: true };
    else if (url.endsWith('/rows')) data = [];
    else if (url.startsWith('/prediction-batches/')) data = { _id: 'batch1', fileName: 'samples.xlsx', status: batchStatus, rowCount: 2, validCount: 1, invalidCount: 1, successCount: batchStatus === 'completed_with_errors' ? 1 : 0, errorCount: 1, createdAt: '2026-11-04T03:00:00Z' };
    else if (url === '/imports/preview') data = { rowCount: 1, batches: [], confirm: [], rejected: [], rows: [], stations: ['AH1'], missing: missingCodes ? [{ rowNumber: 2, code: '', station: '' }] : [] };
    return { data: { data, meta }, config, status: 200, statusText: 'OK', headers: {} };
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); http.defaults.adapter = originalAdapter; setCsrfToken(null); });

describe('feature walkthroughs on real screens', () => {
  it('guides an empty chart and restores the settings panel without changing filters', async () => {
    open('/historical-data');
    const tour = await screen.findByRole('dialog', { name: 'Hướng dẫn xem biểu đồ' });
    const stationSelect = screen.getByLabelText('Trạm');
    const originalValue = (stationSelect as HTMLSelectElement).value;
    for (let step = 0; step < 4; step++) fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
    await waitFor(() => expect(document.getElementById('trend-panel')).not.toHaveAttribute('hidden'));
    fireEvent.click(within(tour).getByRole('button', { name: 'Bỏ qua' }));
    expect(document.getElementById('trend-panel')).toHaveAttribute('hidden');
    expect(stationSelect).toHaveValue(originalValue);
    expect(localStorage.getItem('wqi-trend-config-v2')).toBeNull();
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }));
    expect(within(screen.getByRole('dialog')).getByText('Bước 1 / 6')).toBeTruthy();
  });

  it('finishes only the current Excel stage and automatically explains new results', async () => {
    const first = open('/excel/batch1');
    await finish('Hướng dẫn tính WQI bằng Excel', 3);
    first.unmount();
    const second = open('/excel/batch1');
    await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    second.unmount(); batchStatus = 'completed_with_errors'; open('/excel/batch1');
    const resultTour = await screen.findByRole('dialog', { name: 'Hướng dẫn tính WQI bằng Excel' });
    expect(within(resultTour).getByRole('heading', { name: 'Đọc kết quả từng dòng' })).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('skips the entire user Excel flow while admin guidance stays independent', async () => {
    const first = open('/excel/batch1');
    const tour = await screen.findByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Bỏ qua' }));
    first.unmount(); batchStatus = 'completed';
    const second = open('/excel/batch1'); await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    second.unmount(); open('/admin/import');
    expect(await screen.findByRole('dialog', { name: 'Hướng dẫn nhập Excel quan trắc' })).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('keeps the code-fill modal and its draft when its guide is replayed or dismissed', async () => {
    missingCodes = true; open('/admin/import');
    await finish('Hướng dẫn nhập Excel quan trắc', 3);
    await act(async () => fireEvent.change(document.getElementById('file')!, { target: { files: [new File(['fixture'], 'measurements.xlsx')] } }));
    await finish('Hướng dẫn nhập Excel quan trắc', 3);
    const modal = screen.getByRole('dialog', { name: 'Điền mã đợt và mã trạm' });
    fireEvent.change(within(modal).getByLabelText('Mã đợt'), { target: { value: 'D07-2026' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc' }));
    const tour = screen.getByRole('dialog', { name: 'Hướng dẫn nhập Excel quan trắc' });
    fireEvent(tour, new Event('cancel', { cancelable: true, bubbles: true }));
    expect(modal).toHaveAttribute('open');
    expect(within(modal).getByLabelText('Mã đợt')).toHaveValue('D07-2026');
    expect(writes).toEqual(['/imports/preview']);
  });

  it('never opens a second automatic guide on the calculation page and preserves its draft', async () => {
    open('/calculate');
    const field = await screen.findByLabelText('pH');
    fireEvent.change(field, { target: { value: '7,2' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }));
    const tour = screen.getByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'English' }));
    expect(within(tour).getByText('Step 1 / 3')).toBeTruthy();
    fireEvent.click(within(tour).getByRole('button', { name: 'Skip' }));
    expect(field).toHaveValue('7,2'); expect(writes).toEqual([]);
  });

  it('coordinates automatic guides and does not start one while an operation is busy', async () => {
    const view = render(<MemoryRouter><FeatureGuide id="chart" stage="overview" busy/><FeatureGuide id="excel-admin" stage="prepare" busy/></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<MemoryRouter><FeatureGuide id="chart" stage="overview"/><FeatureGuide id="excel-admin" stage="prepare"/></MemoryRouter>);
    const first = await screen.findByRole('dialog', { name: 'Hướng dẫn xem biểu đồ' });
    expect(document.querySelectorAll('.wqi-guide')).toHaveLength(1);
    fireEvent.click(within(first).getByRole('button', { name: 'Bỏ qua' }));
    await screen.findByRole('dialog', { name: 'Hướng dẫn nhập Excel quan trắc' });
    expect(document.querySelectorAll('.wqi-guide')).toHaveLength(1);
  });

  it.each([false, true])('defers admin guidance during template download, including code-fill modal: %s', async missing => {
    missingCodes = missing;
    localStorage.setItem('wqi.guide.excel-admin.v1', JSON.stringify({ dismissed: false, completed: ['prepare'] }));
    const adapter = http.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    http.defaults.adapter = async config => {
      if (config.url === '/imports/template') { await pending; throw new Error('Download fixture failed'); }
      return adapter(config);
    };
    open('/admin/import');
    fireEvent.click(await screen.findByRole('button', { name: 'Tải file mẫu' }));
    const help = screen.getByRole('button', { name: 'Hướng dẫn nhập Excel quan trắc' });
    expect(help).toBeDisabled();
    await act(async () => fireEvent.change(document.getElementById('file')!, { target: { files: [new File(['fixture'], 'measurements.xlsx')] } }));
    expect(document.querySelector('.wqi-guide')).toBeNull();
    await act(async () => release());
    expect(await screen.findByRole('dialog', { name: 'Hướng dẫn nhập Excel quan trắc' })).toHaveAttribute('data-guide-stage', missing ? 'fill' : 'preview');
    expect(writes).toEqual(['/imports/preview']);
  });

  it('restores settings that were already open before a chart replay', async () => {
    localStorage.setItem('wqi.guide.chart.v1', 'done'); open('/historical-data');
    fireEvent.click(await screen.findByRole('button', { name: 'Cài đặt biểu đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bỏ qua' }));
    expect(document.getElementById('trend-panel')).not.toHaveAttribute('hidden');
    expect(writes).toEqual([]);
  });

  it('remembers stage completion and whole-flow skipping in memory when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = open('/excel/batch1'); await finish('Hướng dẫn tính WQI bằng Excel', 3);
    first.unmount(); const second = open('/excel/batch1'); await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    second.unmount(); batchStatus = 'completed'; const third = open('/excel/batch1');
    const result = await screen.findByRole('dialog'); fireEvent.click(within(result).getByRole('button', { name: 'Bỏ qua' }));
    third.unmount(); batchStatus = 'preview'; open('/excel/batch1'); await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn tính WQI bằng Excel' }));
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(writes).toEqual([]);
  });

  it('remembers completion when storage can be read but writes exceed quota', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const first = open('/historical-data'); await finish('Hướng dẫn xem biểu đồ', 6);
    first.unmount(); open('/historical-data');
    await screen.findByRole('button', { name: 'Cài đặt biểu đồ' });
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }));
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(writes).toEqual([]);
  });
});
