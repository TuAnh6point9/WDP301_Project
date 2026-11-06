// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { AdminStationDetailPage } from './AdminStationDetailPage';

const originalAdapter = http.defaults.adapter;
const parameters = { coliform: 3305, nh4: 0.47, ph: 7.1, po4: 0.39, do: 6.7, cod: 14 };
const station = (id: string, code: string, extra = {}) => ({ _id: id, code, name: `${code} name`, administrativeArea: 'Hải Phòng',
  location: { type: 'Point', coordinates: [106.6, 20.9] }, isActive: true, latest: null, ...extra });
const record = (id: string, stationId: string, batchCode: string, batchRow: number, wqi: number, qualityClass: string) => ({
  _id: id, stationId: { _id: stationId, code: 'AH9', name: 'AH9 name' }, measuredAt: null, batchCode, batchRow, parameters,
  unitBasis: 'training-source-unverified', wqi, qualityClass, validationStatus: 'verified', version: 1, createdAt: '2026-10-16T13:27:00Z',
});

let stations: ReturnType<typeof station>[] = [];
let records: ReturnType<typeof record>[] = [];
let queries: Record<string, unknown>[] = [];
beforeEach(async () => {
  await i18n.changeLanguage('en'); setCsrfToken(null); queries = [];
  stations = [
    station('s9', 'AH9', { latest: { batchCode: 'D12-2027', batchRow: 8, wqi: 73, qualityClass: 'Trung bình', parameters, reviewedAt: null, batches: 2 } }),
    station('s4', 'AH4'),
    station('s3', 'AH3', { isActive: false }),
  ];
  records = [record('r8', 's9', 'D12-2027', 8, 73, 'Trung bình'), record('r7', 's9', 'D12-2027', 7, 60, 'Trung bình'), record('r2', 's9', 'D11-2026', 2, 88, 'Tốt')];
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/stations') return reply({ data: stations, meta: { pages: 1 } });
    if (config.url === '/water-records') {
      queries.push(config.params);
      const rows = records.filter(row => row.stationId._id === config.params.stationId && row.validationStatus === config.params.status);
      return reply({ data: rows, meta: { page: 1, limit: 10, total: rows.length, pages: rows.length ? 1 : 0 } });
    }
    throw new Error(`Unexpected request ${config.url}`);
  }) as AxiosAdapter;
});
afterEach(() => { cleanup(); http.defaults.adapter = originalAdapter; });
const openAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><AdminStationDetailPage/></MemoryRouter>);

describe('Station details (admin)', () => {
  it('shows the station and only its approved measurements, newest batch first, marking the row on the map', async () => {
    openAt('/admin/stations/details?station=AH9');
    expect(await screen.findByRole('heading', { level: 1, name: 'Station AH9' })).toBeTruthy();
    expect(screen.getByText('AH9 name')).toBeTruthy();
    expect(screen.getByText('WQI 73 · Medium')).toBeTruthy();
    expect(await screen.findByText('3 measurements')).toBeTruthy();
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({ status: 'verified', stationId: 's9', page: 1 });
    const batches = [...document.querySelectorAll('tbody tr td:first-child')].map(cell => cell.textContent);
    expect(batches).toEqual(['D12-2027 · row 8Shown on the map', 'D12-2027 · row 7', 'D11-2026 · row 2']);
    const first = within(document.querySelector('tbody tr')!);
    for (const value of ['3305', '0.47', '7.1', '0.39', '6.7', '14', '73', 'Medium']) expect(first.getByText(value)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve|Reject|Review/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Stations' }).getAttribute('href')).toBe('/admin/stations');
  });

  it('says plainly when nothing is approved yet and where waiting or rejected rows live', async () => {
    openAt('/admin/stations/details?station=AH4');
    expect(await screen.findByText('AH4 has no approved measurements yet.')).toBeTruthy();
    expect(screen.getByText('Measurements waiting for review or rejected are on Review Data.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Review Data' }).getAttribute('href')).toBe('/admin/data');
  });

  it('still opens an inactive station and labels it', async () => {
    openAt('/admin/stations/details?station=AH3');
    await screen.findByRole('heading', { level: 1, name: 'Station AH3' });
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.getByText('No approved batch yet')).toBeTruthy();
  });

  it('reports an unknown code without loading any measurements', async () => {
    openAt('/admin/stations/details?station=XX1');
    expect((await screen.findByRole('alert')).textContent).toContain('No station has the code “XX1”.');
    expect(screen.getByRole('link', { name: 'Back to Stations' }).getAttribute('href')).toBe('/admin/stations');
    expect(queries).toEqual([]);
  });
});
