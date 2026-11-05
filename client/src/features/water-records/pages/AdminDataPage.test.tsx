// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
// `raw` stands in for cells whose text differs from the stored number, such as "<0,05".
const detail = (base: ReturnType<typeof record> & { raw?: Record<string, unknown> }) => ({
  ...base, createdBy: { _id: 'u', name: 'Jane Admin', email: 'jane@example.com' }, reviewedBy: null, reviewedAt: null, reviewNote: null, wqiSource: null,
  source: { kind: 'excel', note: 'dot.xlsx · D11-2026', rowId: { _id: 'r', rowNumber: 3, issues: [], values: { PH: 7.1, Temp: 30, BOD5: null, COD: 14, DO: 6.7, Amoni: 0.47, Phosphat: 0.39, Coliforms: 3305, ...base.raw }, batchId: { _id: 'b', fileName: 'dot.xlsx', createdAt: '2026-10-16T13:27:00Z' } } },
});

let list: ReturnType<typeof record>[] = [];
let queries: Record<string, unknown>[] = [];
let reviews: unknown[] = [];
function server() {
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/csrf') return reply({ data: { csrfToken: 'a'.repeat(64) } });
    if (config.url === '/stations') return reply({ data: [{ _id: 'sx', code: 'AH9', name: 'Cửa sông', administrativeArea: 'Hải Phòng', location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive: true,
      latest: { batchCode: 'D12-2027', batchRow: 8, wqi: 73, qualityClass: 'Trung bình', parameters, reviewedAt: null, batches: 2 } }], meta: { pages: 1 } });
    if (config.url === '/water-records') {
      queries.push(config.params);
      const rows = list.filter(row => (!config.params.status || row.validationStatus === config.params.status) && (!config.params.stationId || row.stationId._id === config.params.stationId));
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

  // Preprocessing v1 (05/11/2026): flags only draw the eye; every row can still be approved or rejected.
  it('marks a likely typo in red and a pH the model cannot score in amber', async () => {
    list = [record('a', 'AH2', 'pending'), record('b', 'AH3', 'pending', { parameters: { ...parameters, ph: 3.1 } }), record('t', 'AH5', 'pending', { parameters: { ...parameters, do: 585 } })];
    open();
    const cell = async (code: string, text: string) => within((await screen.findByRole('button', { name: new RegExp(`^Review ${code}`) })).closest('tr')!).getByText(text).closest('td')!;
    const ai = await cell('AH3', '3.1');
    expect(ai.className).toBe('cell-flag is-warn');
    expect(ai.textContent).toContain('AI may be off');
    const typo = await cell('AH5', '585');
    expect(typo.className).toBe('cell-flag');
    expect(typo.textContent).toContain('Likely a typo');
    expect((await cell('AH2', '7.1')).className).toBe('');
    expect(screen.getByText('Numbers marked ! need a closer look: red is a likely typo, orange means the AI cannot score this pH well.')).toBeTruthy();
  });

  it('names the flag in the review box and says when the lab reported below the detection limit', async () => {
    list = [record('t', 'AH5', 'pending', { parameters: { ...parameters, do: 585, nh4: 0.05 }, raw: { DO: 585, Amoni: '<0,05' } })];
    open();
    const dialog = await openReview('AH5');
    const values = within(await within(dialog).findByRole('group', { name: 'Measured values' }));
    const typo = values.getByText('585').closest('.tile')!;
    expect(typo.className).toBe('tile is-danger');
    expect(typo.textContent).toContain('Likely a typo');
    expect(values.getByText('0.05').closest('.tile')!.textContent).toContain('Below the detection limit');
    expect(values.getByText('7.1').closest('.tile')!.className).toBe('tile');
    expect(values.queryAllByText('Below the detection limit')).toHaveLength(1);
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

describe('Review Data for one station (from the Stations page)', () => {
  function Where() { const where = useLocation(); return <output data-testid="url">{where.pathname + where.search}</output>; }
  const openAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><AdminDataPage/><Where/></MemoryRouter>);
  const url = () => screen.getByTestId('url').textContent;
  beforeEach(() => {
    const ah9 = { stationId: { _id: 'sx', code: 'AH9', name: 'Cửa sông' } };
    list = [record('a', 'AH2', 'verified'), record('x8', 'AH9', 'verified', { ...ah9, batchCode: 'D12-2027', batchRow: 8 }), record('x7', 'AH9', 'verified', { ...ah9, batchCode: 'D12-2027', batchRow: 7 }), record('x9', 'AH9', 'rejected', { ...ah9, batchCode: 'D12-2027', batchRow: 9 })];
  });

  it('reads the station and status from the URL, says which station and marks the row on the map', async () => {
    openAt('/admin/data?station=sx&status=verified');
    expect(await screen.findByText('Station AH9 · Cửa sông')).toBeTruthy();
    expect(queries[0]).toMatchObject({ status: 'verified', stationId: 'sx' });
    expect(screen.getByRole('button', { name: 'Verified' }).getAttribute('aria-pressed')).toBe('true');
    const cells = [...document.querySelectorAll('tbody tr td:nth-child(2)')].map(cell => cell.textContent);
    expect(cells).toEqual(['D12-2027 · row 8Shown on the map', 'D12-2027 · row 7']);
  });

  it('keeps the station when the tab changes, and clearing it goes back to every station', async () => {
    openAt('/admin/data?station=sx&status=verified');
    await screen.findByText('Station AH9 · Cửa sông');
    fireEvent.click(screen.getByRole('button', { name: 'Rejected' }));
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ status: 'rejected', stationId: 'sx' }));
    expect(url()).toBe('/admin/data?station=sx&status=rejected');
    fireEvent.click(screen.getByRole('button', { name: 'Show all stations' }));
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ status: 'rejected' }));
    expect(queries.at(-1)!.stationId).toBeUndefined();
    expect(url()).toBe('/admin/data?status=rejected');
    expect(screen.queryByText(/Station AH9/)).toBeNull();
  });

  it('says plainly when the station has nothing in this tab', async () => {
    list = [];
    openAt('/admin/data?station=sx&status=verified');
    expect(await screen.findByText('AH9 · Cửa sông has no measurements here yet.')).toBeTruthy();
  });
});
