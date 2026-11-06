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
function advanceTo(step: number) {
  const tour = screen.getByRole('dialog');
  for (let index = 1; index < step; index++) fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
  return tour;
}
beforeEach(async () => {
  localStorage.clear(); writes.length = 0; batchStatus = 'preview'; missingCodes = false; setCsrfToken(null);
  localStorage.setItem('wqi.guide.account.guide-user.calculate.v1', 'done');
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
    return { data: { data, meta, guidance: { autoStart: true } }, config, status: 200, statusText: 'OK', headers: {} };
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
    expect(localStorage.getItem('wqi-trend-config-v3')).toBeNull();
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }));
    expect(within(screen.getByRole('dialog')).getByText('Bước 1 / 6')).toBeTruthy();
  });

  it('preserves saved v3 chart settings and the selected parameter throughout a guide', async () => {
    const saved = JSON.stringify({ focus: 2, refs: false, slots: ['Coliform', 'NH4', 'pH', 'PO4', 'DO', 'COD'].map((key, index) => ({ key, lo: null, hi: 10000, on: index === 2 })) });
    localStorage.setItem('wqi-trend-config-v3', saved);
    open('/historical-data');
    await finish('Hướng dẫn xem biểu đồ', 6);
    expect(localStorage.getItem('wqi-trend-config-v3')).toBe(saved);
    expect(document.querySelectorAll('.param-tile')[2]).toHaveAttribute('aria-pressed', 'true');
    expect(document.getElementById('trend-panel')).toHaveAttribute('hidden');
    expect(writes).toEqual([]);
  });

  it('starts a replay from the current Excel phase and runs through the end', async () => {
    await i18n.changeLanguage('en');
    open('/excel/batch1');
    await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Excel WQI guide' }));
    const tour = screen.getByRole('dialog');
    expect(within(tour).getByText('Step 4 / 13')).toBeTruthy();
    expect(within(tour).queryByRole('button', { name: 'Back' })).toBeNull();
    expect(within(tour).getByRole('button', { name: 'Next' })).toBeTruthy();
    for (let index = 5; index <= 13; index++) {
      fireEvent.click(within(tour).getByRole('button', { name: 'Next' }));
      expect(within(tour).getByText(`Step ${index} / 13`)).toBeTruthy();
    }
    expect(within(tour).getByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('walks the calculation guide in four steps with no source-data note', async () => {
    open('/calculate');
    fireEvent.click(await screen.findByRole('button', { name: 'Hướng dẫn sử dụng mô hình dự đoán WQI' }));
    const tour = screen.getByRole('dialog');
    expect(within(tour).getByText('Bước 1 / 4')).toBeTruthy();
    const titles: (string | null)[] = [];
    for (let index = 1; index <= 4; index++) {
      titles.push(within(tour).getByRole('heading', { level: 2 }).textContent);
      expect(tour.textContent).not.toMatch(/nghiên cứu|chưa được xác minh|quy đổi đơn vị/);
      if (index < 4) fireEvent.click(within(tour).getByRole('button', { name: 'Tiếp theo' }));
    }
    expect(titles).toEqual(['Bắt đầu dự đoán WQI', 'Nhập đủ sáu thông số', 'Dự đoán WQI khi đã sẵn sàng', 'Đọc kết quả và xem lại khi cần']);
    expect(document.querySelector('[data-wqi-guide="validation"]')).toBeNull();
    expect(writes).toEqual([]);
  });

  it('skips the user flow without suppressing the first admin flow', async () => {
    await i18n.changeLanguage('en');
    const first = open('/calculate');
    await screen.findByRole('button', { name: 'Excel WQI guide' });
    fireEvent.click(screen.getByRole('button', { name: 'Excel WQI guide' }));
    const tour = screen.getByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Skip' }));
    expect(JSON.parse(localStorage.getItem('wqi.guide.account.guide-user.excel-user.v2')!).dismissed).toBe(true);
    first.unmount(); open('/admin/import');
    const admin = await screen.findByRole('dialog', { name: 'Monitoring Excel import guide' });
    expect(within(admin).getByText('Step 1 / 14')).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it('keeps the code-fill modal and its draft when its guide is replayed or dismissed', async () => {
    await i18n.changeLanguage('en');
    missingCodes = true; open('/admin/import');
    const first = await screen.findByRole('dialog', { name: 'Monitoring Excel import guide' });
    expect(within(first).getByText('Step 1 / 14')).toBeTruthy();
    expect(within(advanceTo(4)).getByText('Step 4 / 14')).toBeTruthy();
    expect(within(first).getByLabelText('Read-only illustration')).toBeTruthy();
    fireEvent.click(within(first).getByRole('button', { name: 'Skip' }));
    await act(async () => fireEvent.change(document.getElementById('file')!, { target: { files: [new File(['fixture'], 'measurements.xlsx')] } }));
    const modal = screen.getByRole('dialog', { name: 'Complete the batch code and station' });
    fireEvent.change(within(modal).getByLabelText('Batch code'), { target: { value: 'D07-2026' } });
    fireEvent.click(within(modal).getByRole('button', { name: 'Monitoring Excel import guide' }));
    const tour = screen.getByRole('dialog', { name: 'Monitoring Excel import guide' });
    expect(within(tour).getByText('Step 4 / 14')).toBeTruthy();
    expect(within(tour).queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent(tour, new Event('cancel', { cancelable: true, bubbles: true }));
    expect(modal).toHaveAttribute('open');
    expect(within(modal).getByLabelText('Batch code')).toHaveValue('D07-2026');
    expect(writes).toEqual(['/imports/preview']);
  });

  it('intercepts only the first Excel click and preserves the calculation draft', async () => {
    await i18n.changeLanguage('en');
    open('/calculate');
    const field = await screen.findByLabelText('pH');
    fireEvent.change(field, { target: { value: '7,2' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    const fileClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(await screen.findByRole('button', { name: 'Excel' }));
    const tour = screen.getByRole('dialog');
    expect(within(tour).getByText('Step 1 / 13')).toBeTruthy();
    expect(fileClick).not.toHaveBeenCalled();
    expect(within(advanceTo(13)).getByText('Step 13 / 13')).toBeTruthy();
    expect(within(tour).getByLabelText('Read-only illustration')).toBeTruthy();
    fireEvent.click(within(tour).getByRole('button', { name: 'Finish' }));
    expect(fileClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    expect(fileClick).toHaveBeenCalledTimes(1);
    expect(field).toHaveValue('7,2'); expect(writes).toEqual([]);
  });

  it('coordinates automatic guides and does not start one while an operation is busy', async () => {
    const view = render(<MemoryRouter><AuthProvider><FeatureGuide id="chart" stage="overview" busy/><FeatureGuide id="excel-admin" stage="prepare" busy/></AuthProvider></MemoryRouter>);
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<MemoryRouter><AuthProvider><FeatureGuide id="chart" stage="overview"/><FeatureGuide id="excel-admin" stage="prepare"/></AuthProvider></MemoryRouter>);
    const first = await screen.findByRole('dialog', { name: 'Hướng dẫn xem biểu đồ' });
    expect(document.querySelectorAll('.wqi-guide')).toHaveLength(1);
    fireEvent.click(within(first).getByRole('button', { name: 'Bỏ qua' }));
    await screen.findByRole('dialog', { name: 'Hướng dẫn nhập Excel quan trắc' });
    expect(document.querySelectorAll('.wqi-guide')).toHaveLength(1);
  });

  it.each([false, true])('disables admin guidance during a download and replays from the actual phase: %s', async missing => {
    await i18n.changeLanguage('en');
    missingCodes = missing;
    localStorage.setItem('wqi.guide.account.guide-user.excel-admin.v1', JSON.stringify({ dismissed: false, completed: ['prepare'] }));
    const adapter = http.defaults.adapter as AxiosAdapter;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    http.defaults.adapter = async config => {
      if (config.url === '/imports/template') { await pending; throw new Error('Download fixture failed'); }
      return adapter(config);
    };
    open('/admin/import');
    fireEvent.click(await screen.findByRole('button', { name: 'Download template' }));
    const help = screen.getByRole('button', { name: 'Monitoring Excel import guide' });
    expect(help).toBeDisabled();
    await act(async () => fireEvent.change(document.getElementById('file')!, { target: { files: [new File(['fixture'], 'measurements.xlsx')] } }));
    expect(document.querySelector('.wqi-guide')).toBeNull();
    await act(async () => release());
    if (missing) {
      const modal = await screen.findByRole('dialog', { name: 'Complete the batch code and station' });
      fireEvent.click(within(modal).getByRole('button', { name: 'Monitoring Excel import guide' }));
    } else fireEvent.click(help);
    const tour = screen.getByRole('dialog', { name: 'Monitoring Excel import guide' });
    expect(within(tour).getByText(missing ? 'Step 4 / 14' : 'Step 7 / 14')).toBeTruthy();
    expect(writes).toEqual(['/imports/preview']);
  });

  it('restores settings that were already open before a chart replay', async () => {
    localStorage.setItem('wqi.guide.account.guide-user.chart.v1', 'done'); open('/historical-data');
    fireEvent.click(await screen.findByRole('button', { name: 'Cài đặt biểu đồ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn xem biểu đồ' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bỏ qua' }));
    expect(document.getElementById('trend-panel')).not.toHaveAttribute('hidden');
    expect(writes).toEqual([]);
  });

  it('remembers a whole-flow skip in memory when storage is blocked', async () => {
    await i18n.changeLanguage('en');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = open('/calculate');
    const fileClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await screen.findByRole('button', { name: 'Excel' });
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    const tour = screen.getByRole('dialog'); fireEvent.click(within(tour).getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    expect(fileClick).toHaveBeenCalledTimes(1);
    first.unmount(); open('/excel/batch1'); await screen.findByText('samples.xlsx');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Excel WQI guide' }));
    expect(within(screen.getByRole('dialog')).getByText('Step 4 / 13')).toBeTruthy();
    expect(writes).toEqual([]);
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
