// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getVnWqiQualityClass } from '@wqi/contracts';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, type AxiosAdapter } from 'axios';
import { AuthProvider } from '@/features/auth/AuthContext';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { http, setCsrfToken } from '@/lib/http';
import { CalculatePage } from './CalculatePage';
import { ResultPage } from './ResultPage';
import { HistoryPage } from './HistoryPage';

const originalAdapter = http.defaults.adapter;
const parameters = { ph: 7, do: 6, cod: 4, nh4: 0.1, po4: 0.2, coliform: 500 };
const prediction = { _id: '123456789012345678901234', parameters, unitBasis: 'training-source-unverified', wqi: 7, qualityClass: 'Ô nhiễm rất nặng', modelVersion: 'research-1', classificationVersion: 'VN_WQI_1460_2019', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 7, createdAt: '2026-10-08T03:00:00Z' };
function server(handler: (config: Parameters<AxiosAdapter>[0]) => unknown | Promise<unknown>) {
  http.defaults.adapter = async config => ({ data: config.url === '/auth/csrf' ? { data: { csrfToken: 'a'.repeat(64) } } : config.url === '/auth/me' ? { data: { _id: 'user-1', name: 'Researcher', email: 'researcher@example.com', role: 'user', isActive: true } } : await handler(config), status: 200, statusText: 'OK', headers: {}, config });
}
function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route element={<RequireAuth/>}><Route path="/calculate" element={<CalculatePage/>}/><Route path="/result" element={<ResultPage/>}/><Route path="/history" element={<HistoryPage/>}/></Route></Routes></AuthProvider></MemoryRouter>);
}
beforeEach(() => setCsrfToken(null));
afterEach(() => { cleanup(); setCsrfToken(null); http.defaults.adapter = originalAdapter; });

describe('prediction screens', () => {
  it('uses Vietnamese field errors on blur and submit without changing valid measurements', async () => {
    const posted: unknown[] = [];
    server(config => {
      if(config.method === 'post') { posted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction };
    });
    open('/calculate');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Calculate WQI'}) as HTMLButtonElement).disabled).toBe(false));
    const input=screen.getByLabelText('Amoni');
    fireEvent.blur(input);
    expect(document.getElementById('nh4-hint')?.textContent).toBe('Vui lòng nhập một số.');
    fireEvent.change(input,{target:{value:'-1'}});
    expect(document.getElementById('nh4-hint')?.textContent).toBe('Giá trị không được âm.');
    fireEvent.change(screen.getByLabelText('pH'),{target:{value:'-1'}});
    fireEvent.click(screen.getByRole('button',{name:'Calculate WQI'}));
    expect(document.getElementById('ph-hint')?.textContent).toBe('pH phải nằm trong khoảng 0–14.');
    expect(posted).toEqual([]);
    expect(document.activeElement).toBe(screen.getByLabelText('Coliforms'));
    for(const [label,value] of Object.entries({'Coliforms':'010000','Amoni':'0.35','pH':'7.2','Phosphat':'0.84','DO — Dissolved Oxygen':'20','COD':'1e5'}))fireEvent.change(screen.getByLabelText(label),{target:{value}});
    fireEvent.click(screen.getByRole('button',{name:'Calculate WQI'}));
    await screen.findByText('Ô nhiễm rất nặng');
    expect(posted).toEqual([{parameters:{coliform:10000,nh4:0.35,ph:7.2,po4:0.84,do:20,cod:100000},unitBasis:'training-source-unverified'}]);
  });

  it('localizes backend field errors and hides arbitrary technical messages', async () => {
    server(config=>{
      if(config.method==='post')throw new AxiosError('Raw failure','ERR_BAD_REQUEST',config,undefined,{data:{error:{code:'VALIDATION_ERROR',message:'Internal Stack CODE_123',details:[{field:'parameters.nh4',message:'Internal Stack CODE_123'}]}},status:422,statusText:'Error',headers:{},config});
      return {data:{available:true,configured:true}};
    });
    open('/calculate');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Calculate WQI'}) as HTMLButtonElement).disabled).toBe(false));
    for(const [label,value] of Object.entries({'Coliforms':500,'Amoni':0.1,'pH':7,'Phosphat':0.2,'DO — Dissolved Oxygen':6,'COD':4}))fireEvent.change(screen.getByLabelText(label),{target:{value}});
    fireEvent.click(screen.getByRole('button',{name:'Calculate WQI'}));
    await screen.findByText('Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.');
    expect(document.getElementById('nh4-hint')?.textContent).toBe('Giá trị không hợp lệ. Vui lòng nhập một số.');
    expect(document.body.textContent).not.toContain('CODE_123');
    expect((screen.getByLabelText('Amoni') as HTMLInputElement).value).toBe('0.1');
  });

  it('shows concise suggested ranges with unchanged units and accessible descriptions', async () => {
    server(() => ({ data: { available: true, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' } }));
    open('/calculate');
    await screen.findByLabelText('Amoni');
    const field = (label: string) => screen.getByLabelText(label).closest('.field')!;
    expect(field('Amoni').querySelector('em')?.textContent).toBe('mg/L as N');
    expect(field('Phosphat').querySelector('em')?.textContent).toBe('mg/L as P');
    expect(field('Coliforms').querySelector('em')?.textContent).toBe('MPN/100 mL');
    expect(field('DO — Dissolved Oxygen').querySelector('em')?.textContent).toBe('mg/L');
    expect(field('COD').querySelector('em')?.textContent).toBe('mg/L');
    expect(field('pH').querySelector('em')).toBeNull();
    const hints = {
      Coliforms: 'Suggested range: 0–10,000',
      Amoni: 'Suggested range: 0–5',
      pH: 'Suggested range: 6–8.5 (allowed 0–14)',
      Phosphat: 'Suggested range: 0–4',
      'DO — Dissolved Oxygen': 'Suggested range: 0–12',
      COD: 'Suggested range: 0–150',
    };
    for (const [label, text] of Object.entries(hints)) {
      const input = screen.getByLabelText(label);
      const hint = field(label).querySelector('.hint')!;
      expect(hint.textContent).toBe(text);
      expect(text.length).toBeLessThanOrEqual(40);
      expect(hint.querySelector('br')).toBeNull();
      expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    }
    const form = screen.getByLabelText('Amoni').closest('form')!;
    expect(form.textContent).not.toMatch(/VN-WQI reference units|scoring thresholds|Decision 1460|QCVN|saturation|temperature|dimensionless|No unit|finite number|scoring anchors|N-NH4|P-PO4/i);
    expect(form.querySelector('a')).toBeNull();
    expect(form.querySelector('[title="VN-WQI reference unit"]')).toBeNull();
    await waitFor(() => expect(form.querySelector('.callout-neutral')?.textContent).toBe('CatBoost predicts WQI using the lecturer-provided model. Training-label provenance and external preprocessing have not been verified. The six WQI bands are used for display. Source units are unverified. Use the original source values without unit conversion. Results are for research use.'));
  });

  it('accepts polluted measurements beyond WQI scoring anchors without converting source values', async () => {
    const submitted: unknown[] = [];
    server(config => {
      if (config.method === 'post') { submitted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status'
        ? { data: { available: true, configured: true, unitStatus: 'unverified' } }
        : { data: prediction };
    });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'pH': 5.2, 'DO — Dissolved Oxygen': 20, 'COD': 600, 'Amoni': 7, 'Phosphat': 5, 'Coliforms': 20000 })) {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input.getAttribute('aria-invalid')).toBe('false');
    }
    expect(document.querySelector('form .is-error, form .callout-warn, form [role="alert"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate WQI' }));
    await screen.findByText('Ô nhiễm rất nặng');
    expect(submitted).toEqual([{ parameters: { coliform: 20000, nh4: 7, ph: 5.2, po4: 5, do: 20, cod: 600 }, unitBasis: 'training-source-unverified' }]);
  });

  it('keeps historical BOD5 values and Callisto 1.0 identity after activating CatBoost', async () => {
    const legacy = { ...prediction, parameters: { ph: 7, do: 6, bod5: 4, nh4: 0.1, po4: 0.2, coliform: 500 },
      modelVersion: 'akh-vn1460-hist_gradient_boosting-e4f7df4de0428c62', predictionSchemaVersion: undefined,
      referenceBasis: 'formula-derived', unitStatus: 'assumed-for-research', unitBasis: 'mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL' };
    server(() => ({ data: legacy }));
    open(`/result?id=${prediction._id}`);
    await screen.findByRole('heading', { name: 'Input values' });
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText('Technical details'));
    expect(screen.getByText('callisto 1.0')).toBeTruthy();
    expect(screen.getByText('BOD5').closest('.tile')?.textContent).toContain('4');
    expect([...document.querySelectorAll('.tile-label')].map(node => node.textContent)).toEqual(['Coliforms', 'Amoni', 'pH', 'Phosphat', 'DO', 'BOD5']);
    expect(screen.queryByText('COD')).toBeNull();
    expect(screen.queryByText('callisto 2.0')).toBeNull();
  });
  it('maps structured model-domain errors to a field and preserves the entered measurement', async () => {
    server(config => {
      if (config.method === 'post') throw new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'AI_INPUT_OUTSIDE_DOMAIN', message: 'Outside the trained domain.', details: { nh4: { min: 0, max: 1, value: 2 } } } }, status: 422, statusText: 'Unprocessable', headers: {}, config });
      return { data: { available: true, configured: true, unitStatus: 'unverified' } };
    });
    open('/calculate');
    await screen.findByRole('button', { name: 'Calculate WQI' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'pH': 7, 'DO — Dissolved Oxygen': 6, 'COD': 4, 'Amoni': 2, 'Phosphat': 0.2, 'Coliforms': 500 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate WQI' }));
    await screen.findByText('Giá trị phải nằm trong khoảng 0–1.');
    const field = screen.getByLabelText('Amoni') as HTMLInputElement;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.value).toBe('2');
  });

  it('disables calculation when the model is unavailable and explains the research basis', async () => {
    server(() => ({ data: { available: false, configured: false, unitStatus: 'unverified' } }));
    open('/calculate');
    const submit = await screen.findByRole('button', { name: 'Calculate WQI' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(/source units are unverified/i)).toBeTruthy();
    expect(screen.getByLabelText('Phosphat')).toBeTruthy();
    expect(screen.queryByText('Consistent results across Web & Mobile')).toBeNull();
  });

  it('prevents duplicate submit and reset while a prediction is pending', async () => {
    let requests = 0;
    let finish!: (value: unknown) => void;
    server(config => config.url === '/predictions/status' ? { data: { available: true, configured: true, unitStatus: 'unverified' } } : config.method === 'post' ? new Promise(resolve => { requests++; finish = resolve; }) : { data: prediction });
    open('/calculate');
    await screen.findByRole('button', { name: 'Calculate WQI' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Calculate WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'pH': 7, 'DO — Dissolved Oxygen': 6, 'COD': 4, 'Amoni': 0.1, 'Phosphat': 0.2, 'Coliforms': 500 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const form = screen.getByRole('button', { name: 'Calculate WQI' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(requests).toBe(1));
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true);
    finish({ data: prediction });
    await screen.findByText('Ô nhiễm rất nặng');
  });

  it('presents a saved result with exact input values and collapsed technical details', async () => {
    const sample = { ...prediction, wqi: 83, qualityClass: 'Tốt', rawWqi: 82.55440501086855, modelVersion: 'callisto 2.0',
      parameters: { ph: 7.2, do: 7.2, cod: 6.6, nh4: 0.35, po4: 0.84, coliform: 2601 } };
    server(() => ({ data: sample }));
    open(`/result?id=${prediction._id}`);
    const meter = await screen.findByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('83');
    expect(meter.getAttribute('aria-valuetext')).toBe('83 / 100 · Tốt');
    expect(screen.getByText('83')).toBeTruthy();
    expect(screen.getByText('Tốt')).toBeTruthy();
    const tiles = [...document.querySelectorAll('.tile')];
    expect(tiles.map(tile => tile.querySelector('.tile-label')?.textContent)).toEqual(['Coliforms', 'Amoni', 'pH', 'Phosphat', 'DO', 'COD']);
    expect(tiles.map(tile => tile.querySelector('.tile-value')?.textContent)).toEqual(['2601', '0.35', '7.2', '0.84', '7.2', '6.6']);
    for (const tile of tiles) expect(tile.children.length).toBe(2);
    expect(screen.getAllByText('Research-use estimate. Units not verified against training data.')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Calculate again' }).getAttribute('href')).toBe('/calculate');
    expect(screen.getByRole('link', { name: 'View history' }).getAttribute('href')).toBe('/history');
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Score').nextElementSibling?.textContent).toBe('82.55');
    expect(within(details).getByText('Model version').nextElementSibling?.textContent).toBe('callisto 2.0');
    expect(within(details).getByText('Classification version').nextElementSibling?.textContent).toBe('VN_WQI_1460_2019');
    expect(within(details).getByText('Model algorithm').nextElementSibling?.textContent).toBe('CatBoost');
    expect(within(details).getByText('Record ID').nextElementSibling?.textContent).toBe(prediction._id);
    expect(document.querySelector('main')?.textContent).not.toMatch(/82\.55440501086855|Before rounding|Reference basis|source unit|dimensionless|\(unverified\)|Using this result|CatBoost WQI prediction|six display bands|Input Parameters/);
    expect(screen.queryByText(/Compared to History at/)).toBeNull();
    expect(screen.queryByText(/All parameters are within recommended thresholds/)).toBeNull();
  });

  it('does not invent missing technical metadata or hide additional historical measurements', async () => {
    server(() => ({ data: { ...prediction, rawWqi: undefined, algorithm: undefined, classificationVersion: undefined,
      parameters: { ...parameters, temp: 28.125, tss: 3.141592653589793, conductivity: 4321 } } }));
    open(`/result?id=${prediction._id}`);
    await screen.findByRole('heading', { name: 'Input values' });
    const details = document.querySelector('details')!;
    for (const label of ['Score', 'Model algorithm', 'Classification version']) {
      expect(within(details).getByText(label).nextElementSibling?.textContent).toBe('Not recorded');
    }
    expect(screen.getByText('Temp').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('28.125');
    expect(screen.getByText('TSS').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('3.141592653589793');
    expect(screen.getByText('conductivity').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('4321');
  });

  it.each([0, 9, 10, 25, 26, 50, 51, 75, 76, 90, 91, 100])('positions score %s within the unchanged six display bands', async wqi => {
    const label = getVnWqiQualityClass(wqi);
    server(() => ({ data: { ...prediction, wqi, rawWqi: wqi, qualityClass: label } }));
    open(`/result?id=${prediction._id}`);
    const meter = await screen.findByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe(String(wqi));
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe(`${wqi} / 100 · ${label}`);
    expect((meter.querySelector('.result-scale-marker') as HTMLElement).style.left).toBe(`${wqi}%`);
    const legend = screen.getByRole('list', { name: 'WQI display bands' });
    expect([...legend.querySelectorAll('.result-band-label')].map(node => node.textContent)).toEqual([
      'Ô nhiễm rất nặng · 0–9', 'Kém · 10–25', 'Xấu · 26–50', 'Trung bình · 51–75', 'Tốt · 76–90', 'Rất tốt · 91–100',
    ]);
    expect(legend.querySelector('[aria-current="true"]')?.textContent).toContain(label);
    expect(meter.querySelectorAll('.result-scale-segment')).toHaveLength(6);
    const badge = screen.getByText(label) as HTMLElement;
    const current = legend.querySelector('[aria-current="true"] .result-band-swatch') as HTMLElement;
    expect(current.style.backgroundColor).toBe(badge.style.backgroundColor);
  });

  it('loads the requested history page and uses the server total', async () => {
    const pages: number[] = [];
    server(config => { const page = Number(config.params.page); pages.push(page); return { data: [{ ...prediction, _id: `${page}`.repeat(24) }], meta: { page, limit: 6, total: 7, pages: 2 } }; });
    open('/history');
    await screen.findByText('Showing 1–1 of 7 calculations');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Showing 7–7 of 7 calculations');
    expect(pages).toEqual([1, 2]);
    expect(screen.queryByText('Average WQI')).toBeNull();
  });

});
