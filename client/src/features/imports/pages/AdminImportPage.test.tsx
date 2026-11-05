// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter } from 'axios';
import { USER_MESSAGES, importColumns } from '@wqi/contracts';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { AuthProvider } from '@/features/auth/AuthContext';
import { AdminImportPage } from './AdminImportPage';

const originalAdapter = http.defaults.adapter;
const values = { 'Mã đợt': 'D01-2026', 'Mã trạm': 'AH3', PH: 'abc', DO: 5.2, COD: 21, Amoni: 0.31, Phosphat: 0.1, Coliforms: 2400, Temp: null, BOD5: null, 'Ghi chú': null };
const preview = {
  rowCount: 5, confirm: ['D01-2026', 'D01-2026|2'],
  batches: [
    { code: 'D01-2026', rowCount: 3, stations: ['AH1'], issueCount: 1, validCount: 2, replaces: 2, existing: { createdAt: '2026-10-29T03:00:00Z', uploadedBy: { name: 'Jane Admin' }, rowCount: 2 } },
    { code: 'D02-2026', rowCount: 1, stations: ['AH2'], issueCount: 0, validCount: 1, replaces: 0, existing: null },
  ],
  rejected: [{ rowNumber: 5, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }],
  rows: [{ rowNumber: 4, values, issues: [`PH: ${USER_MESSAGES.INVALID_NUMBER}`] }],
  missing: [] as { rowNumber: number; code: string; station: string; label?: string }[], stations: ['AH1', 'AH2', 'AH3'],
};
// A file with only the six parameters: no codes and no stations yet.
const bare = {
  rowCount: 6, confirm: [], batches: [], rows: [],
  rejected: [2, 3, 4, 5, 6, 7].map(rowNumber => ({ rowNumber, reason: USER_MESSAGES.BATCH_CODE_REQUIRED })),
  missing: [2, 3, 4, 5, 6, 7].map(rowNumber => ({ rowNumber, code: '', station: '', ...(rowNumber === 5 ? { label: 'D9-2018' } : {}) })),
  stations: ['AH1', 'AH2', 'AH3'],
};
const result = { batches: [{ code: 'D01-2026', created: false, added: 1, overwritten: 1, issueCount: 1 }, { code: 'D02-2026', created: true, added: 1, overwritten: 0, issueCount: 0 }], rejected: [{ rowNumber: 5, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }], wqi: { calculated: 2, pending: 1 } };
const withSkip = { ...result, batches: [{ code: 'D01-2026', created: false, added: 0, overwritten: 0, issueCount: 1, skipped: 2 }, result.batches[1]] };
let commits: (string | null)[] = [];
let answer: typeof preview | typeof bare = preview;
let sentFills: (string | null)[] = [];
function server() {
  http.defaults.adapter = (async config => {
    const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/me') return reply({ data: { _id: 'import-admin', role: 'admin', name: 'Import fixture', email: 'import@fixture.test', isActive: true }, guidance: { autoStart: false } });
    if (config.url === '/auth/csrf') return reply({ data: { csrfToken: 'a'.repeat(64) } });
    if (config.url === '/imports') return reply({ data: [{ _id: 'b1', code: 'D01-2026', fileName: 'dot.xlsx', rowCount: 2, issueCount: 0, status: 'ready', createdAt: '2026-10-29T03:00:00Z', uploadedBy: { _id: 'u1', name: 'Jane Admin', email: 'jane@example.com' } }], meta: { page: 1, limit: 20, total: 1, pages: 1 } });
    if (config.url === '/imports/preview') { sentFills.push((config.data as FormData).get('fills') as string | null); return reply({ data: answer }); }
    if (config.url === '/imports/commit') { commits.push((config.data as FormData).get('confirm') as string | null); sentFills.push((config.data as FormData).get('fills') as string | null); return reply({ data: (config.data as FormData).get('confirm') ? result : withSkip }); }
    throw new Error(`Unexpected request ${config.url}`);
  }) as AxiosAdapter;
}
async function choose() {
  render(<MemoryRouter><AuthProvider><AdminImportPage/></AuthProvider></MemoryRouter>);
  await screen.findByText('D01-2026');
  const file = new File(['x'], 'dot.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await act(async () => { fireEvent.change(document.getElementById('file')!, { target: { files: [file] } }); });
}
async function upload() {
  await choose();
  return screen.findByText(/For example: D0/);
}
beforeEach(async () => {
  localStorage.setItem('wqi.guide.excel-admin.v1', 'done');
  await i18n.changeLanguage('en'); setCsrfToken(null); commits = []; sentFills = []; answer = preview; server();
  // jsdom has no modal dialogs.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
  });
});
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; });

describe('Excel import by batch code', () => {
  it('lists the history by batch code with view-only rows and a template download', async () => {
    render(<MemoryRouter><AuthProvider><AdminImportPage/></AuthProvider></MemoryRouter>);
    const table = (await screen.findByText('D01-2026')).closest('table')!;
    expect(within(table).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Batch code', 'Uploaded by', 'Created', 'Records', 'Action']);
    expect(within(table).getByRole('button', { name: 'Open rows of D01-2026' })).toBeTruthy();
    expect(screen.queryByText('Create record')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download template' })).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter(item => item.closest('.wizard')).map(item => item.textContent)).toEqual(['Template', 'Upload', 'Check', 'Save']);
  });

  it('lists only the column names and shows what a column means after it is opened', async () => {
    render(<MemoryRouter><AuthProvider><AdminImportPage/></AuthProvider></MemoryRouter>);
    const guide = await screen.findByRole('region', { name: 'Columns in the file' });
    expect([...guide.querySelectorAll('summary')].map(name => name.textContent)).toEqual([...importColumns]);
    expect(within(guide).getByText('Required (8)')).toBeVisible();
    expect(within(guide).getByText('Optional (4)')).toBeVisible();
    const meaning = within(guide).getByText(/Acidity or alkalinity of the water/);
    expect(meaning).not.toBeVisible();
    fireEvent.click(within(guide).getByText('PH'));
    expect(meaning).toBeVisible();
    expect(guide.textContent).not.toMatch(/Example:/);
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(within(guide).getByText('Bắt buộc (8)')).toBeVisible();
    expect(meaning.textContent).toMatch(/Độ axit hay kiềm của nước/);
  });

  it('sums up batches and errors on the page and shows the details only when asked', async () => {
    await upload();
    expect(screen.queryByRole('list', { name: 'Batches in this file' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Rows with errors' })).toBeNull();
    expect(screen.getByText('For example: D01-2026, D02-2026 · 1 already in the system')).toBeTruthy();
    expect(screen.getByText(USER_MESSAGES.BATCH_CODE_REQUIRED)).toBeTruthy();
    expect(screen.getByText(`PH: ${USER_MESSAGES.INVALID_NUMBER}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View all: Batches in this file' }));
    const cards = within(within(screen.getByRole('dialog')).getByRole('list', { name: 'Batches in this file' })).getAllByRole('listitem');
    expect(cards.map(card => card.querySelector('.batch-line')?.textContent)).toEqual(['D01-2026 · Rows: 3 · Stations: AH1 · Errors: 1', 'D02-2026 · Rows: 1 · Stations: AH2 · Errors: 0']);
    expect(within(cards[0]).getByText('Code exists')).toBeTruthy();
    expect(cards[0].textContent).toContain('Overwrites 2 old record(s)');
    expect(within(cards[1]).getByText('New batch')).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('vi'); });
    expect(cards[0].querySelector('.batch-line')?.textContent).toBe('D01-2026 · 3 dòng · AH1 · 1 lỗi');
    expect(within(cards[0]).getByText('Mã đã có')).toBeTruthy();
  });

  it('opens one kind of error at a time, with every row of it on pages of ten', async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ rowNumber: index + 10, values, issues: [`Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}`] }));
    answer = { ...preview, rows: [...preview.rows, ...many] };
    await upload();
    expect(screen.getByText('25 row(s) · for example rows 10, 11, 12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `View all: Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}` }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Showing 1–10 of 25 rows');
    expect(within(dialog).getAllByRole('row')).toHaveLength(11);
    expect(within(dialog).getByRole('columnheader', { name: 'PH' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '3' }));
    expect(dialog.textContent).toContain('Showing 21–25 of 25 rows');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks about an existing batch; Cancel saves nothing and keeps the check result', async () => {
    await upload();
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 rows' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Jane Admin', { exact: false })).not.toBeVisible();
    fireEvent.click(within(dialog).getByText('D01-2026'));
    expect(within(dialog).getByText('Jane Admin', { exact: false })).toBeVisible();
    expect(dialog.textContent).toContain('Overwrites 2 old record(s)');
    expect(within(dialog).getByRole('checkbox', { name: 'Overwrite batch D01-2026' })).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(commits).toEqual([]);
    expect(screen.getByText(/For example: D01-2026, D02-2026/)).toBeTruthy();
  });

  it('skips an existing batch unless it is ticked and still saves the new ones', async () => {
    await upload();
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 rows' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: 'Overwrite batch D01-2026' })).not.toBeChecked();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 rows' })); });
    expect(commits).toEqual([null]);
    expect(await screen.findByText('Skipped 1 batch(es) because the code already exists: D01-2026.')).toBeTruthy();
  });

  it('cannot save from the dialog when every batch is a skipped duplicate', async () => {
    answer = { ...preview, batches: [preview.batches[0]] };
    await upload();
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 rows' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save 0 rows' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Overwrite batch D01-2026' }));
    expect(within(dialog).getByRole('button', { name: 'Save 2 rows' })).toBeEnabled();
  });

  it('opens the fill dialog for a file with only the six parameters: batch code first, then one station for the batch', async () => {
    answer = bare;
    await choose();
    const dialog = await screen.findByRole('dialog', { name: 'Complete the batch code and station' });
    const box = (name: string) => within(dialog).getByRole('textbox', { name });
    // The code written beside row 5 starts as a batch; rows 2–4 wait for the admin.
    expect(within(dialog).getByRole('cell', { name: 'D9-2018' })).toBeTruthy();
    expect(within(dialog).getByRole('cell', { name: '5–7' })).toBeTruthy();
    expect(dialog.textContent).toContain('1 batch(es) assigned · 3 row(s) without a batch code · 1 batch(es) without a station');
    expect(box('From row')).toHaveValue('2');
    expect(box('To row')).toHaveValue('4');
    fireEvent.change(box('Batch code'), { target: { value: 'd8-2018' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(within(dialog).getByRole('cell', { name: 'D8-2018' })).toBeTruthy();
    expect(dialog.textContent).toContain('2 batch(es) assigned · 0 row(s) without a batch code · 2 batch(es) without a station');
    expect(within(dialog).queryByRole('button', { name: 'Assign' })).toBeNull();

    // One station per batch, none chosen for the admin, and no box per row.
    expect(within(dialog).queryByRole('combobox', { name: /row/i })).toBeNull();
    const station = (code: string) => within(dialog).getByRole('combobox', { name: 'Station of ' + code });
    expect(station('D8-2018')).toHaveValue('');
    expect(station('D9-2018')).toHaveValue('');
    expect(within(station('D8-2018')).getAllByRole('option').map(option => option.textContent)).toEqual(['Choose station', 'AH1', 'AH2', 'AH3']);
    fireEvent.change(station('D8-2018'), { target: { value: 'AH3' } });
    expect(dialog.textContent).toContain('2 batch(es) assigned · 0 row(s) without a batch code · 1 batch(es) without a station');
    await act(async () => { fireEvent.submit(dialog.querySelector('form')!); });
    expect(screen.queryByRole('dialog')).toBeNull();
    const expected = [[2, 'D8-2018', 'AH3'], [3, 'D8-2018', 'AH3'], [4, 'D8-2018', 'AH3'], [5, 'D9-2018', ''], [6, 'D9-2018', ''], [7, 'D9-2018', '']];
    expect(sentFills.map(fills => fills && JSON.parse(fills))).toEqual([null, expected]);

    answer = { ...preview, confirm: [], batches: [preview.batches[1]], missing: bare.missing };
    fireEvent.click(screen.getByRole('button', { name: 'Fill in batch codes and stations' }));
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Station of D8-2018' })).toHaveValue('AH3');
  });

  it('gives one station to every batch still without one, only when asked', async () => {
    answer = bare;
    await choose();
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Batch code' }), { target: { value: 'D8-2018' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    const station = (code: string) => within(dialog).getByRole('combobox', { name: 'Station of ' + code });
    const all = within(dialog).getByRole('combobox', { name: 'Station for the batches without one' });
    const apply = within(dialog).getByRole('button', { name: 'Apply to 2 batch(es)' });
    expect(apply).toBeDisabled();
    fireEvent.change(all, { target: { value: 'AH2' } });
    expect(station('D8-2018')).toHaveValue('');
    fireEvent.click(apply);
    expect(station('D8-2018')).toHaveValue('AH2');
    expect(station('D9-2018')).toHaveValue('AH2');
    expect(within(dialog).queryByRole('button', { name: /Apply to/ })).toBeNull();
    fireEvent.change(station('D9-2018'), { target: { value: 'AH1' } });
    expect(station('D8-2018')).toHaveValue('AH2');
  });

  it('explains a wrong range, and edits or removes a batch', async () => {
    answer = bare;
    await choose();
    const dialog = await screen.findByRole('dialog');
    const box = (name: string) => within(dialog).getByRole('textbox', { name });
    const assign = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));
    fireEvent.change(box('Batch code'), { target: { value: 'D8-2018' } });
    fireEvent.change(box('To row'), { target: { value: '6' } });
    assign();
    expect(within(dialog).getByRole('alert').textContent).toContain('5–7');
    fireEvent.change(box('To row'), { target: { value: '1' } });
    assign();
    expect(within(dialog).getByRole('alert').textContent).toContain('smaller');
    expect(within(dialog).queryByRole('cell', { name: 'D8-2018' })).toBeNull();
    fireEvent.change(box('To row'), { target: { value: '3' } });
    assign();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).getByRole('cell', { name: '2–3' })).toBeTruthy();
    expect(box('From row')).toHaveValue('4');

    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Station of D8-2018' }), { target: { value: 'AH2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit D8-2018' }));
    expect(box('From row')).toHaveValue('2');
    expect(box('Batch code')).toHaveValue('D8-2018');
    fireEvent.change(box('To row'), { target: { value: '4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect(within(dialog).getByRole('cell', { name: '2–4' })).toBeTruthy();
    expect(within(dialog).getByRole('combobox', { name: 'Station of D8-2018' })).toHaveValue('AH2');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove D8-2018' }));
    expect(within(dialog).queryByRole('cell', { name: 'D8-2018' })).toBeNull();
    expect(box('From row')).toHaveValue('2');
  });

  it('assigns what is still typed in the boxes when Check is pressed, and stops on a mistake', async () => {
    answer = bare;
    await choose();
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Batch code' }), { target: { value: 'Đ 1' } });
    await act(async () => { fireEvent.submit(dialog.querySelector('form')!); });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(sentFills).toEqual([null]);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Batch code' }), { target: { value: 'D8-2018' } });
    await act(async () => { fireEvent.submit(dialog.querySelector('form')!); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(sentFills.at(-1)!)).toContainEqual([2, 'D8-2018', '']);
  });

  it('sends the fills again when saving, and closing the dialog leaves a way back to it', async () => {
    answer = bare;
    await choose();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    answer = { ...preview, confirm: [], batches: [preview.batches[1]], missing: bare.missing };
    fireEvent.click(screen.getByRole('button', { name: 'Fill in batch codes and stations' }));
    await act(async () => { fireEvent.submit(screen.getByRole('dialog').querySelector('form')!); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save 1 rows' })); });
    expect(sentFills.at(-1)).toBe(sentFills.at(-2));
    expect(JSON.parse(sentFills.at(-1)!)).toContainEqual([5, 'D9-2018', '']);
  });

  it('shows what the file already has and asks only for the rest', async () => {
    answer = { ...bare, missing: [{ rowNumber: 2, code: 'D01-2026', station: '' }, { rowNumber: 3, code: 'D01-2026', station: '' }], rejected: [] };
    await choose();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Assign' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Edit D01-2026' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Remove D01-2026' })).toBeNull();
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(1);
    cleanup();
    answer = { ...bare, missing: [{ rowNumber: 2, code: '', station: 'AH2' }], rejected: [] };
    await choose();
    const second = await screen.findByRole('dialog');
    fireEvent.change(within(second).getByRole('textbox', { name: 'Batch code' }), { target: { value: 'D8-2018' } });
    fireEvent.click(within(second).getByRole('button', { name: 'Assign' }));
    expect(within(second).queryByRole('combobox', { name: 'Station of D8-2018' })).toBeNull();
    expect(within(second).getByRole('cell', { name: 'AH2' })).toBeTruthy();
  });

  it('does not open the fill dialog for a file that has every code', async () => {
    await upload();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fill in batch codes and stations' })).toBeNull();
    expect(sentFills).toEqual([null]);
  });

  it('saves with the ticked batch keys, then shows a summary with a link to Review Data', async () => {
    await upload();
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 rows' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Overwrite batch D01-2026' }));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save 3 rows' })); });
    expect(commits).toEqual(['D01-2026,D01-2026|2']);
    const summary = await screen.findByText('Saved 2 batch(es), 3 record(s) waiting for review; 2 row(s) rejected.');
    expect(summary.closest('.banner')!.querySelector('a')!.getAttribute('href')).toBe('/admin/data');
    expect(screen.getByText('WQI calculated for 2 record(s).')).toBeTruthy();
    expect(screen.getByText('1 record(s) have no WQI yet: it will be calculated when you approve them.')).toBeTruthy();
  });
});
