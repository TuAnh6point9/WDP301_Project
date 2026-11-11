// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AuthProvider } from '@/features/auth/AuthContext';
import { i18n } from '@/i18n';
import { http, setCsrfToken } from '@/lib/http';
import { HistoricalDataPage } from './HistoricalDataPage';

const originalAdapter = http.defaults.adapter;
const station = { _id: 'a'.repeat(24), code: 'AH1', name: 'Điểm lấy mẫu AH1', administrativeArea: 'Hải Dương', location: { type: 'Point', coordinates: [106.491, 20.936] }, isActive: true };
const parameters = { ph: 7.14, do: 5.2, cod: 25.2, nh4: 0.44, po4: 0.1, coliform: 910 };
const record = (seconds: number, batchCode: string, wqi: number | null) => ({
  _id: seconds.toString(16).padStart(8, '0') + '0'.repeat(16), stationId: station, measuredAt: null, batchCode, parameters, unitBasis: 'training-source-unverified',
  validationStatus: 'verified', wqi, qualityClass: null, version: 1,
});
// D01 has no WQI; D02 has two samples whose WQI averages 75.
const records = [record(100, 'D01-2026', null), record(300, 'D02-2026', 70), record(310, 'D02-2026', 80)];
let qcvnColumn = 'A2';

beforeEach(async () => {
  localStorage.clear(); setCsrfToken(null); qcvnColumn = 'A2';
  localStorage.setItem('wqi.guide.account.chart-user.chart.v1', 'done');
  await i18n.changeLanguage('en');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = (data: unknown, meta = { page: 1, limit: 100, total: 0, pages: 1 }) => ({ data: { data, meta }, status: 200, statusText: 'OK', headers: {}, config });
    if (config.url === '/auth/csrf') return reply({ csrfToken: 'a'.repeat(64) });
    if (config.url === '/auth/me') return reply({ _id: 'chart-user', name: 'Chart fixture', role: 'user', email: 'chart@example.test', isActive: true });
    if (config.url === '/stations') return reply([station]);
    if (config.url === '/settings') return reply({ qcvnColumn, version: 1, updatedAt: null });
    if (config.url === '/water-records') return reply(records, { page: 1, limit: 100, total: records.length, pages: 1 });
    throw new Error(`Unexpected request ${config.url}`);
  }) as AxiosAdapter;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); http.defaults.adapter = originalAdapter; setCsrfToken(null); });

const open = () => render(<MemoryRouter initialEntries={['/historical-data']}><AuthProvider><HistoricalDataPage/></AuthProvider></MemoryRouter>);
const tiles = async () => (await screen.findByRole('group', { name: 'Parameters (choose one to chart)' })).querySelectorAll('.param-tile');

describe('Historical Data WQI', () => {
  it('gives WQI a card after the six measurements and charts the batch mean of the samples that have one', async () => {
    open();
    const cards = [...await tiles()];
    expect(cards.map(card => card.querySelector('.pt-head')!.textContent)).toEqual(['ColiformMPN/100 mL', 'Amonimg/L as N', 'pH', 'Phosphatmg/L as P', 'DOmg/L', 'CODmg/L', 'WQI']);
    // Latest batch: mean 75, the quality class instead of "No limit set".
    const wqi = cards[6];
    expect(wqi.querySelector('.pt-value')).toHaveTextContent('75');
    expect(wqi.querySelector('.badge')).toHaveTextContent('Medium');

    fireEvent.click(wqi);
    expect(wqi).toHaveAttribute('aria-pressed', 'true');
    const chart = screen.getByRole('img', { name: /WQI/ });
    // D01 has no WQI, so only D02 is plotted and labelled at the line end.
    expect([...chart.querySelectorAll('.tc-end')].map(end => end.textContent)).toEqual(['75']);
    expect(chart.querySelector('.tc-unit')).toHaveTextContent('WQI');
    expect(screen.getByRole('columnheader', { name: 'WQI' })).toHaveClass('is-focus');
  });

  it('keeps which parameters a viewer saved before WQI was added, but not their limits', async () => {
    const slots = ['Coliform', 'NH4', 'pH', 'PO4', 'DO', 'COD'].map((key, i) => ({ key, lo: null, hi: i === 5 ? 20 : null, on: i === 5 }));
    localStorage.setItem('wqi-trend-config-v3', JSON.stringify({ refs: true, focus: 5, slots }));
    open();
    const cards = await tiles();
    expect(cards).toHaveLength(7);
    expect(cards[5]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[6]).toHaveAttribute('aria-pressed', 'false');
    // Only the admin saves limits (11/11): the saved COD limit of 20 is ignored and column A2 (15) applies.
    expect(cards[5].querySelector('.pt-status')).toHaveClass('bad');
    expect(cards[5].querySelector('.pt-status')).toHaveTextContent('15');
  });

  it('follows the QCVN column the admin chose', async () => {
    qcvnColumn = 'B1';
    localStorage.setItem('wqi-trend-config-v3', JSON.stringify({ refs: true, focus: 5, slots: ['Coliform', 'NH4', 'pH', 'PO4', 'DO', 'COD', 'WQI'].map((key, i) => ({ key, on: i === 5 })) }));
    open();
    const cod = (await tiles())[5];
    // B1 allows COD up to 30, so the latest batch is within the limit.
    expect(cod.querySelector('.pt-status')).toHaveClass('ok');
    expect(screen.getByText(/column B1, chosen by the admin/)).toBeInTheDocument();
  });
});
