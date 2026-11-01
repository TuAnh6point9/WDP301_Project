// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { AdminDataPage } from './AdminDataPage';

const originalAdapter = http.defaults.adapter;
const parameters = { coliform: 3305, nh4: 0.47, ph: 7.1, po4: 0.39, do: 6.7, cod: 14 };
const record = (id: string, code: string, status: string, extra = {}) => ({
  _id: id, stationId: { _id: `s${id}`, code, name: `${code} name` }, measuredAt: null, batchCode: 'D11-2026', parameters, unitBasis: 'training-source-unverified',
  wqi: null, qualityClass: null, validationStatus: status, version: 1, createdAt: '2026-10-16T13:27:00Z', ...extra,
});
const detail = (base: ReturnType<typeof record>) => ({
  ...base, createdBy: { _id: 'u', name: 'Jane Admin', email: 'jane@example.com' }, reviewedBy: null, reviewedAt: null, reviewNote: null, wqiSource: null,
  source: { kind: 'excel', note: 'dot.xlsx · D11-2026', rowId: { _id: 'r', rowNumber: 3, issues: [], values: { PH: 7.1, Temp: 30, BOD5: null, COD: 14, DO: 6.7, Amoni: 0.47, Phosphat: 0.39, Coliforms: 3305 }, batchId: { _id: 'b', fileName: 'dot.xlsx', createdAt: '2026-10-16T13:27:00Z' } } },
});

let list: ReturnType<typeof record>[] = [];
let queries: Record<string, unknown>[] = [];
let reviews: unknown[] = [];
function server() {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/csrf') return reply({ data: { csrfToken: 'a'.repeat(64) } });
    if (config.url === '/water-records') {
      queries.push(config.params);
      const rows = list.filter(row => !config.params.status || row.validationStatus === config.params.status);
      return reply({ data: rows, meta: { page: 1, limit: 10, total: rows.length, pages: rows.length ? 1 : 0 } });
    }
    const opened = config.url?.match(/^\/water-records\/(\w+)$/);
    if (opened) return reply({ data: detail(list.find(row => row._id === opened[1])!) });
    if (config.url?.endsWith('/validation')) {
      const body = JSON.parse(config.data as string);
      reviews.push(body);
      list = list.map(row => config.url!.includes(`/${row._id}/`) ? { ...row, validationStatus: body.status } : row);
      return reply({ data: {} });
    }
    throw new Error(`Unexpected request ${config.url}`);
  }) as AxiosAdapter;
}
const open = () => render(<MemoryRouter><AdminDataPage/></MemoryRouter>);
async function openReview(code = 'AH2') {
  const button = await screen.findByRole('button', { name: new RegExp(`^Review ${code}`) });
  fireEvent.click(button);
  return screen.findByRole('dialog');
}
beforeEach(async () => {
  await i18n.changeLanguage('en'); setCsrfToken(null); queries = []; reviews = []; server();
  list = [record('a', 'AH2', 'pending'), record('b', 'AH3', 'pending', { parameters: { ...parameters, ph: 3.1 } }), record('c', 'AH4', 'verified')];
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; });

describe('Review Data', () => {
  it('starts on waiting work from any date and says how much is left', async () => {
    open();
    expect(await screen.findByText('2 measurements waiting for review')).toBeTruthy();
    expect(queries[0]).toMatchObject({ status: 'pending', limit: 10 });
    expect(queries[0].createdFrom).toBeUndefined();
    expect(queries[0].createdTo).toBeUndefined();
  });

  it('gives each row one action: review while waiting, details afterwards', async () => {
    open();
    const row = (await screen.findByRole('button', { name: /^Review AH2/ })).closest('tr')!;
    expect(within(row).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    const reviewed = (await screen.findByRole('button', { name: /^Details of AH4/ })).closest('tr')!;
    expect(within(reviewed).getAllByRole('button')).toHaveLength(1);
    expect(within(reviewed).queryByRole('button', { name: /^Review/ })).toBeNull();
  });

  it('marks a value outside the suggested range', async () => {
    open();
    const row = (await screen.findByRole('button', { name: /^Review AH3/ })).closest('tr')!;
    const flagged = within(row).getByText('3.1').closest('td')!;
    expect(flagged.className).toContain('cell-flag');
    expect(flagged.textContent).toContain('Outside the suggested range');
    const normal = (await screen.findByRole('button', { name: /^Review AH2/ })).closest('tr')!;
    expect(within(normal).getByText('7.1').closest('td')!.className).not.toContain('cell-flag');
  });

  it('shows the calculated WQI in the table and the review box', async () => {
    list = [record('a', 'AH2', 'pending', { wqi: 75, qualityClass: 'Trung bình', wqiSource: 'callisto 2.0' })];
    open();
    const row = (await screen.findByRole('button', { name: /^Review AH2/ })).closest('tr')!;
    expect(within(row).getByText('75')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'WQI' })).toBeTruthy();
    const dialog = await openReview();
    await within(dialog).findByRole('group', { name: 'Measured values' });
    expect(within(dialog).getByText('75')).toBeTruthy();
    expect(within(dialog).getByText('Medium')).toBeTruthy();
  });

  it('says a missing WQI will be calculated at approval', async () => {
    open();
    const row = (await screen.findByRole('button', { name: /^Review AH2/ })).closest('tr')!;
    expect(within(row).getByText('—')).toBeTruthy();
    const dialog = await openReview();
    expect(await within(dialog).findByText('Calculated when you approve')).toBeTruthy();
  });

  it('shows the six values in the review box', async () => {
    open();
    const dialog = await openReview();
    const values = within(await within(dialog).findByRole('group', { name: 'Measured values' }));
    for (const value of ['3305', '0.47', '7.1', '0.39', '6.7', '14']) expect(values.getByText(value)).toBeTruthy();
  });

  it('approves without a note and reports which sample', async () => {
    open();
    const dialog = await openReview();
    await act(async () => { fireEvent.click(await within(dialog).findByRole('button', { name: 'Approve' })); });
    expect(reviews).toEqual([{ status: 'verified', note: '', version: 1 }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('.toast')!.textContent).toBe('Approved AH2 · Batch D11-2026');
    expect(await screen.findByText('1 measurement waiting for review')).toBeTruthy();
  });

  it('asks for a reason before rejecting and saves nothing until it is given', async () => {
    open();
    const dialog = await openReview();
    const reject = await within(dialog).findByRole('button', { name: 'Reject' });
    fireEvent.click(reject);
    expect(within(dialog).getByRole('alert').textContent).toBe('Please write why this is rejected.');
    expect(reviews).toEqual([]);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'pH không hợp lý' } });
    await act(async () => { fireEvent.click(reject); });
    expect(reviews).toEqual([{ status: 'rejected', note: 'pH không hợp lý', version: 1 }]);
  });

  it('offers a next step when nothing is left to review', async () => {
    list = [record('c', 'AH4', 'verified')];
    open();
    expect(await screen.findByText('All reviewed. Nothing is waiting.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Import a new Excel file' }).getAttribute('href')).toBe('/admin/import');
  });

  it('offers to widen the dates when only the date filter hides the work', async () => {
    open();
    await screen.findByRole('button', { name: /^Review AH2/ });
    list = [];
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2020-01-01' } });
    expect(await screen.findByText('Nothing in these days.')).toBeTruthy();
    list = [record('a', 'AH2', 'pending')];
    fireEvent.click(screen.getByRole('button', { name: 'Show all days' }));
    expect(await screen.findByRole('button', { name: /^Review AH2/ })).toBeTruthy();
  });
});
