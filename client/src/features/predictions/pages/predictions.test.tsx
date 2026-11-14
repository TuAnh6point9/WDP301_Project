// @vitest-environment jsdom
// Preserve the original English-copy regression fixtures; bilingual behavior has its own tests.
import { beforeEach as beforeEnglishFixture } from 'vitest';
import { i18n } from '@/i18n';
beforeEnglishFixture(async () => { await i18n.changeLanguage('en'); });
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { getVnWqiQualityClass, qualityClassLabel } from '@wqi/contracts';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, type AxiosAdapter } from 'axios';
import { AuthProvider } from '@/features/auth/AuthContext';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { http, setCsrfToken } from '@/lib/http';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CalculatePage } from './CalculatePage';
import { PreviewResultPage, ResultPage } from './ResultPage';
import { HistoryPage } from './HistoryPage';

const originalAdapter = http.defaults.adapter;
const parameters = { coliform: 500, nh4: 0.1, ph: 7, po4: 0.2, do: 6, cod: 4 };
const prediction = { _id: '123456789012345678901234', parameters, unitBasis: 'training-source-unverified', wqi: 7, qualityClass: 'Ô nhiễm rất nặng', modelVersion: 'research-1', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 7, createdAt: '2026-10-08T03:00:00Z' };
function server(handler: (config: Parameters<AxiosAdapter>[0]) => unknown | Promise<unknown>) {
  http.defaults.adapter = async config => ({ data: config.url === '/auth/csrf' ? { data: { csrfToken: 'a'.repeat(64) } } : config.url === '/auth/me' ? { data: { _id: 'user-1', name: 'Researcher', email: 'researcher@example.com', role: 'user', isActive: true } } : await handler(config), status: 200, statusText: 'OK', headers: {}, config });
}
function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route element={<RequireAuth/>}><Route path="/calculate" element={<CalculatePage/>}/><Route path="/result" element={<ResultPage/>}/><Route path="/history" element={<HistoryPage/>}/></Route></Routes></AuthProvider></MemoryRouter>);
}
beforeEach(() => { setCsrfToken(null); localStorage.setItem('wqi.guide.calculate.v1', 'done'); });
afterEach(() => { cleanup(); setCsrfToken(null); http.defaults.adapter = originalAdapter; });

describe('prediction screens', () => {
  it('uses English field errors on blur and submit without changing valid measurements', async () => {
    const posted: unknown[] = [];
    server(config => {
      if(config.method === 'post') { posted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction };
    });
    open('/calculate');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Predict WQI'}) as HTMLButtonElement).disabled).toBe(false));
    const input=screen.getByLabelText('Coliforms');
    fireEvent.blur(input);
    expect(document.getElementById('coliform-hint')?.textContent).toBe('Please enter a number.');
    fireEvent.change(input,{target:{value:'-1'}});
    expect(document.getElementById('coliform-hint')?.textContent).toBe('Value cannot be negative.');
    fireEvent.change(input,{target:{value:'500'}});
    fireEvent.change(screen.getByLabelText('Amoni'),{target:{value:'0.35'}});
    fireEvent.change(screen.getByLabelText('pH'),{target:{value:'-1'}});
    fireEvent.click(screen.getByRole('button',{name:'Predict WQI'}));
    expect(document.getElementById('ph-hint')?.textContent).toBe('pH must be between 0 and 14.');
    expect(posted).toEqual([]);
    expect(document.activeElement).toBe(screen.getByLabelText('pH'));
    for(const [label,value] of Object.entries({'Coliforms':'010000','Amoni':'0.35','pH':'7.2','Phosphat':'0.84','DO — Dissolved Oxygen':'20','COD':'1e5'}))fireEvent.change(screen.getByLabelText(label),{target:{value}});
    fireEvent.click(screen.getByRole('button',{name:'Predict WQI'}));
    await screen.findByText('Heavily polluted');
    expect(posted).toEqual([{parameters:{coliform:10000,nh4:0.35,ph:7.2,po4:0.84,do:20,cod:100000},unitBasis:'training-source-unverified'}]);
  });

  it('reads a decimal comma as a point and keeps the invalid-number message for other text', async () => {
    const posted: unknown[] = [];
    server(config => {
      if (config.method === 'post') { posted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction };
    });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByLabelText('pH').getAttribute('inputmode')).toBe('decimal');
    fireEvent.change(screen.getByLabelText('Coliforms'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Amoni'), { target: { value: '0,35' } });
    fireEvent.change(screen.getByLabelText('pH'), { target: { value: '7,2 mg/L' } });
    fireEvent.blur(screen.getByLabelText('pH'));
    expect(document.getElementById('ph-hint')?.textContent).toBe('Invalid value. Please enter a number.');
    for (const [label, value] of Object.entries({ 'Coliforms': '500', 'Amoni': '0,35', 'pH': ' 7,2 ', 'Phosphat': '0.84', 'DO — Dissolved Oxygen': '5,2', 'COD': '4' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('Heavily polluted');
    expect(posted).toEqual([{ parameters: { coliform: 500, nh4: 0.35, ph: 7.2, po4: 0.84, do: 5.2, cod: 4 }, unitBasis: 'training-source-unverified' }]);
  });

  it('opens the six fields one by one in model order and locks later fields again when an earlier one is cleared', async () => {
    const posted: unknown[] = [];
    server(config => {
      if (config.method === 'post') { posted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction };
    });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    const order = { 'Coliforms': '500', 'Amoni': '0.1', 'pH': '7', 'Phosphat': '0.2', 'DO — Dissolved Oxygen': '6', 'COD': '4' };
    const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
    expect([...document.querySelectorAll('.wqi-input-grid input')].map(node => node.id)).toEqual(['coliform', 'nh4', 'ph', 'po4', 'do', 'cod']);
    expect(input('Coliforms').disabled).toBe(false);
    expect(input('Amoni').disabled).toBe(true);
    // A locked field shows only the lock and its usual hint, never a red message.
    expect(document.getElementById('nh4-hint')?.textContent).toBe('Suggested range: 0–5');
    expect(document.querySelector('.wqi-input-grid .is-error')).toBeNull();
    const labels = Object.keys(order);
    labels.forEach((label, index) => {
      fireEvent.change(input(label), { target: { value: order[label as keyof typeof order] } });
      if (labels[index + 1]) expect(input(labels[index + 1]).disabled).toBe(false);
    });
    expect(labels.every(label => !input(label).disabled)).toBe(true);
    fireEvent.change(input('Amoni'), { target: { value: '-1' } });
    expect(input('pH').disabled).toBe(true);
    expect(document.getElementById('ph-hint')?.className).toBe('hint');
    fireEvent.change(input('Amoni'), { target: { value: '0.1' } });
    fireEvent.change(input('Coliforms'), { target: { value: '' } });
    expect(labels.slice(1).every(label => input(label).disabled)).toBe(true);
    expect(input('pH').value).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    expect(posted).toEqual([]);
    expect(document.activeElement).toBe(input('Coliforms'));
    fireEvent.change(input('Coliforms'), { target: { value: '500' } });
    expect(labels.every(label => !input(label).disabled)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(labels.filter(label => !input(label).disabled)).toEqual(['Coliforms']);
  });

  it('localizes backend field errors and hides arbitrary technical messages', async () => {
    server(config=>{
      if(config.method==='post')throw new AxiosError('Raw failure','ERR_BAD_REQUEST',config,undefined,{data:{error:{code:'VALIDATION_ERROR',message:'Internal Stack CODE_123',details:[{field:'parameters.nh4',message:'Internal Stack CODE_123'}]}},status:422,statusText:'Error',headers:{},config});
      return {data:{available:true,configured:true}};
    });
    open('/calculate');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Predict WQI'}) as HTMLButtonElement).disabled).toBe(false));
    for(const [label,value] of Object.entries({'Coliforms':500,'Amoni':0.1,'pH':7,'Phosphat':0.2,'DO — Dissolved Oxygen':6,'COD':4}))fireEvent.change(screen.getByLabelText(label),{target:{value}});
    fireEvent.click(screen.getByRole('button',{name:'Predict WQI'}));
    await screen.findByText('Some data is invalid. Please check and try again.');
    expect(document.getElementById('nh4-hint')?.textContent).toBe('Invalid value. Please enter a number.');
    expect(document.body.textContent).not.toContain('CODE_123');
    expect((screen.getByLabelText('Amoni') as HTMLInputElement).value).toBe('0.1');
  });

  it('shows concise suggested ranges with unchanged units and accessible descriptions', async () => {
    server(() => ({ data: { available: true, configured: true, unitStatus: 'unverified', referenceBasis: 'lecturer-provided' } }));
    open('/calculate');
    await screen.findByLabelText('Amoni');
    const field = (label: string) => screen.getByLabelText(label).closest('.field')!;
    expect(field('Amoni').querySelector('em')?.textContent).toBe('mg/L');
    expect(field('Phosphat').querySelector('em')?.textContent).toBe('mg/L');
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
    // The research note was removed on 06/11 at the user's request.
    expect(document.querySelector('.research-note')).toBeNull();
    expect(document.querySelector('main')?.textContent).not.toMatch(/estimate for research|lab sheet|More details|research use/i);
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
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'Coliforms': 20000, 'Amoni': 7, 'pH': 5.2, 'Phosphat': 5, 'DO — Dissolved Oxygen': 20, 'COD': 600 })) {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input.getAttribute('aria-invalid')).toBe('false');
    }
    expect(document.querySelector('form .is-error, form .callout-warn, form [role="alert"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('Heavily polluted');
    expect(submitted).toEqual([{ parameters: { coliform: 20000, nh4: 7, ph: 5.2, po4: 5, do: 20, cod: 600 }, unitBasis: 'training-source-unverified' }]);
  });

  // Preprocessing v1 (05/11/2026): flags warn but never block, and "<x" counts at the detection limit.
  it('warns without blocking on a likely typo or a pH the model cannot score, and counts "<x" at the limit', async () => {
    const submitted: unknown[] = [];
    server(config => {
      if (config.method === 'post') { submitted.push(JSON.parse(config.data)); return { data: prediction }; }
      return config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction };
    });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'Coliforms': '500', 'Amoni': '<0,05', 'pH': '4', 'Phosphat': '0.2', 'DO — Dissolved Oxygen': '58,5', 'COD': '4' })) {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input.getAttribute('aria-invalid')).toBe('false');
    }
    const hint = (key: string) => document.getElementById(`${key}-hint`)!;
    expect(hint('nh4').textContent).toBe('Below the detection limit, counted as 0.05');
    expect(hint('ph').textContent).toBe('AI may be off: The model did not learn pH this low or high.');
    expect(hint('do').textContent).toBe('Likely a typo: Far higher than real samples. Check the decimal mark.');
    expect(hint('do').className).toBe('hint is-warn');
    expect(hint('cod').textContent).toBe('Suggested range: 0–150');
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('Heavily polluted');
    expect(submitted).toEqual([{ parameters: { coliform: 500, nh4: 0.05, ph: 4, po4: 0.2, do: 58.5, cod: 4 }, unitBasis: 'training-source-unverified' }]);
  });

  it('asks for the detection limit when a field only says "not detected"', async () => {
    server(config => config.url === '/predictions/status' ? { data: { available: true, configured: true } } : { data: prediction });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Coliforms'), { target: { value: 'KPH' } });
    fireEvent.blur(screen.getByLabelText('Coliforms'));
    expect(document.getElementById('coliform-hint')?.textContent).toBe('Write the detection limit instead, for example <0.05.');
  });

  it('lists flagged values under the result and keeps the score', async () => {
    server(() => ({ data: { ...prediction, wqi: 60, qualityClass: 'Trung bình', rawWqi: 60, parameters: { ...parameters, ph: 4, do: 58.5 } } }));
    open(`/result?id=${prediction._id}`);
    const note = (await screen.findByText('Check these values before using the result:')).closest('.callout')!;
    expect(note.className).toBe('callout callout-warn');
    expect([...note.querySelectorAll('li')].map(item => item.textContent)).toEqual([
      'pH 4 — AI may be off: The model did not learn pH this low or high.',
      'DO 58.5 — Likely a typo: Far higher than real samples. Check the decimal mark.',
    ]);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('60');
  });

  it('keeps historical BOD5 values after activating CatBoost without naming either model', async () => {
    const legacy = { ...prediction, parameters: { ph: 7, do: 6, bod5: 4, nh4: 0.1, po4: 0.2, coliform: 500 },
      modelVersion: 'akh-vn1460-hist_gradient_boosting-e4f7df4de0428c62', predictionSchemaVersion: undefined,
      referenceBasis: 'formula-derived', unitStatus: 'assumed-for-research', unitBasis: 'mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL' };
    server(() => ({ data: legacy }));
    open(`/result?id=${prediction._id}`);
    await screen.findByRole('heading', { name: 'Input values' });
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText('Technical details'));
    expect(document.querySelector('main')?.textContent).not.toMatch(/callisto/);
    expect(screen.getByText('BOD5').closest('.tile')?.textContent).toContain('4');
    expect([...document.querySelectorAll('.tile-label')].map(node => node.textContent)).toEqual(['Coliforms', 'Amoni', 'pH', 'Phosphat', 'DO', 'BOD5']);
    expect(screen.queryByText('COD')).toBeNull();
    expect(screen.queryByText('callisto 2.0')).toBeNull();
  });
  it('explains that a WQI outside 0–100 was discarded', async () => {
    server(config => {
      if (config.method === 'post') throw new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'AI_OUTPUT_OUT_OF_RANGE', message: 'x' } }, status: 422, statusText: 'Unprocessable', headers: {}, config } as never);
      return { data: { available: true, configured: true, unitStatus: 'unverified' } };
    });
    open('/calculate');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'Coliforms': 100, 'Amoni': 0.01, 'pH': 7.6, 'Phosphat': 0.005, 'DO — Dissolved Oxygen': 7.5, 'COD': 5 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('The model returned a WQI outside 0–100, so the result was discarded and not saved.');
  });
  it('maps structured model-domain errors to a field and preserves the entered measurement', async () => {
    server(config => {
      if (config.method === 'post') throw new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code: 'AI_INPUT_OUTSIDE_DOMAIN', message: 'Outside the trained domain.', details: { nh4: { min: 0, max: 1, value: 2 } } } }, status: 422, statusText: 'Unprocessable', headers: {}, config });
      return { data: { available: true, configured: true, unitStatus: 'unverified' } };
    });
    open('/calculate');
    await screen.findByRole('button', { name: 'Predict WQI' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'Coliforms': 500, 'Amoni': 2, 'pH': 7, 'Phosphat': 0.2, 'DO — Dissolved Oxygen': 6, 'COD': 4 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('Value must be between 0 and 1.');
    const field = screen.getByLabelText('Amoni') as HTMLInputElement;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.value).toBe('2');
  });

  it('disables calculation when the model is unavailable', async () => {
    let available = false;
    server(() => ({ data: { available, configured: available, unitStatus: 'unverified' } }));
    open('/calculate');
    const submit = await screen.findByRole('button', { name: 'Predict WQI' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(true));
    expect((await screen.findByRole('alert')).textContent).toContain('AI Service: Not configured.');
    expect(screen.queryByRole('heading', { name: /^About / })).toBeNull();
    expect(screen.queryByText(/source units are unverified/i)).toBeNull();
    expect(screen.getByLabelText('Phosphat')).toBeTruthy();
    expect(screen.queryByText('Consistent results across Web & Mobile')).toBeNull();
    available = true;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
  });

  it('prevents duplicate submit and reset while a prediction is pending', async () => {
    let requests = 0;
    let finish!: (value: unknown) => void;
    server(config => config.url === '/predictions/status' ? { data: { available: true, configured: true, unitStatus: 'unverified' } } : config.method === 'post' ? new Promise(resolve => { requests++; finish = resolve; }) : { data: prediction });
    open('/calculate');
    await screen.findByRole('button', { name: 'Predict WQI' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({ 'Coliforms': 500, 'Amoni': 0.1, 'pH': 7, 'Phosphat': 0.2, 'DO — Dissolved Oxygen': 6, 'COD': 4 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const form = screen.getByRole('button', { name: 'Predict WQI' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(requests).toBe(1));
    expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(true);
    finish({ data: prediction });
    await screen.findByText('Heavily polluted');
  });

  it('presents a saved result with exact input values and collapsed technical details', async () => {
    const sample = { ...prediction, wqi: 83, qualityClass: 'Tốt', rawWqi: 82.55440501086855, modelVersion: 'callisto 2.0',
      parameters: { ph: 7.2, do: 7.2, cod: 6.6, nh4: 0.35, po4: 0.84, coliform: 2601 } };
    server(() => ({ data: sample }));
    open(`/result?id=${prediction._id}`);
    const meter = await screen.findByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('83');
    expect(meter.getAttribute('aria-valuetext')).toBe('83 / 100 · Good');
    expect(screen.getByText('83')).toBeTruthy();
    expect(screen.getByText('Good')).toBeTruthy();
    const tiles = [...document.querySelectorAll('.tile')];
    expect(tiles.map(tile => tile.querySelector('.tile-label')?.textContent)).toEqual(['Coliforms', 'Amoni', 'pH', 'Phosphat', 'DO', 'COD']);
    expect(tiles.map(tile => tile.querySelector('.tile-value')?.textContent)).toEqual(['2601', '0.35', '7.2', '0.84', '7.2', '6.6']);
    for (const tile of tiles) expect(tile.children.length).toBe(2);
    expect(document.querySelector('.result-card .callout-warn')).toBeNull();
    expect(screen.getAllByText('Research-use estimate.')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Calculate another sample' }).getAttribute('href')).toBe('/calculate');
    expect(screen.getByRole('link', { name: 'View history' }).getAttribute('href')).toBe('/history');
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Score').nextElementSibling?.textContent).toBe('82.55');
    expect(within(details).queryByText('Classification version')).toBeNull();
    // User's request 06/11: no screen names the model.
    expect(within(details).queryByText(/Model/)).toBeNull();
    expect(details.textContent).not.toMatch(/callisto|CatBoost/);
    expect(within(details).getByText('Record ID').nextElementSibling?.textContent).toBe(prediction._id);
    expect(document.querySelector('main')?.textContent).not.toMatch(/82\.55440501086855|Before rounding|Reference basis|source unit|dimensionless|\(unverified\)|Using this result|CatBoost WQI prediction|six display bands|Input Parameters/);
    expect(screen.queryByText(/Compared to History at/)).toBeNull();
    expect(screen.queryByText(/All parameters are within recommended thresholds/)).toBeNull();
  });

  it('does not invent missing technical metadata or hide additional historical measurements', async () => {
    server(() => ({ data: { ...prediction, rawWqi: undefined, algorithm: undefined,
      parameters: { ...parameters, temp: 28.125, tss: 3.141592653589793, conductivity: 4321 } } }));
    open(`/result?id=${prediction._id}`);
    await screen.findByRole('heading', { name: 'Input values' });
    const details = document.querySelector('details')!;
    expect(within(details).getByText('Score').nextElementSibling?.textContent).toBe('Not recorded');
    expect(screen.getByText('Temp').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('28.125');
    expect(screen.getByText('TSS').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('3.141592653589793');
    expect(screen.getByText('conductivity').closest('.tile')?.querySelector('.tile-value')?.textContent).toBe('4321');
  });

  it.each([0, 9, 10, 25, 26, 50, 51, 75, 76, 90, 91, 100])('positions score %s within the unchanged six display bands', async wqi => {
    const stored = getVnWqiQualityClass(wqi), label = qualityClassLabel(stored);
    server(() => ({ data: { ...prediction, wqi, rawWqi: wqi, qualityClass: stored } }));
    open(`/result?id=${prediction._id}`);
    const meter = await screen.findByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe(String(wqi));
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe(`${wqi} / 100 · ${label}`);
    expect((meter.querySelector('.result-scale-marker') as HTMLElement).style.left).toBe(`${wqi}%`);
    const legend = screen.getByRole('list', { name: 'WQI display bands' });
    expect([...legend.querySelectorAll('.result-band-label')].map(node => node.textContent)).toEqual([
      'Heavily polluted · 0–9', 'Bad · 10–25', 'Poor · 26–50', 'Medium · 51–75', 'Good · 76–90', 'Very good · 91–100',
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
    await screen.findByText('Showing 1–6 of 7 calculations');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Showing 7–7 of 7 calculations');
    expect(pages).toEqual([1, 2]);
    expect(screen.queryByText('Average WQI')).toBeNull();
  });

  it('downloads the shown history page as an Excel file from the server', async () => {
    const exports: unknown[] = [];
    server(config => config.url === '/predictions/export' ? (exports.push(config.params), new Blob(['xlsx']))
      : { data: [prediction], meta: { page: Number(config.params.page), limit: 10, total: 11, pages: 2 } });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:history'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    open('/history');
    await screen.findByText('Showing 1–10 of 11 calculations');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Showing 11–11 of 11 calculations');
    fireEvent.click(screen.getByRole('button', { name: 'Export this page (Excel)' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(exports).toEqual([{ page: 2, limit: 10 }]);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('lich-su-tinh-wqi-trang-2.xlsx');
    click.mockRestore();
  });

  it('shows a starting-up notice while the AI wakes and enables calculation once it answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let checks = 0;
      server(config => config.url === '/predictions/status'
        ? { data: ++checks === 1 ? { available: false, configured: true, reason: 'AI_TIMEOUT' } : { available: true, configured: true, unitStatus: 'unverified' } }
        : { data: prediction });
      open('/calculate');
      expect((await screen.findByText(/starting up/)).closest('[role="status"]')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(true);
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
      expect(checks).toBe(2);
    } finally { vi.useRealTimers(); }
  });

  it('stops checking by itself after three minutes and leaves Check again to the user', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let checks = 0;
      server(config => config.url === '/predictions/status' ? (checks++, { data: { available: false, configured: true, reason: 'AI_TIMEOUT' } }) : { data: prediction });
      open('/calculate');
      await screen.findByText(/starting up/);
      await act(() => vi.advanceTimersByTimeAsync(180_000));
      expect((await screen.findByRole('alert')).textContent).toContain('AI Service: Not ready.');
      const spent = checks;
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(checks).toBe(spent);
      fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
      await waitFor(() => expect(checks).toBe(spent + 1));
    } finally { vi.useRealTimers(); }
  });
});

describe('guest calculation', () => {
  const account = { _id: 'user-1', name: 'Researcher', email: 'researcher@example.com', role: 'user', isActive: true };
  const rejected = (config: Parameters<AxiosAdapter>[0], status: number, code: string) =>
    new AxiosError('Rejected', 'ERR_BAD_REQUEST', config, undefined, { data: { error: { code, message: 'x' } }, status, statusText: 'Error', headers: {}, config } as never);

  it('lets a visitor calculate without an account and saves the result only after they sign in', async () => {
    sessionStorage.clear();
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } },
      close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    let signedIn = false;
    const previewed: unknown[] = [], saved: unknown[] = [];
    const { _id, ...unsaved } = prediction;
    http.defaults.adapter = async config => {
      const reply = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
      if (config.url === '/auth/csrf') return reply({ data: { csrfToken: 'a'.repeat(64) } });
      if (config.url === '/auth/me') { if (!signedIn) throw rejected(config, 401, 'UNAUTHENTICATED'); return reply({ data: account }); }
      if (config.url === '/auth/login') { signedIn = true; return reply({ data: { user: account, csrfToken: 'b'.repeat(64) } }); }
      if (config.url === '/predictions/status') return reply({ data: { available: true, configured: true, unitStatus: 'unverified' } });
      if (config.url === '/predictions/preview') { previewed.push(JSON.parse(config.data)); return reply({ data: unsaved }); }
      if (config.url === '/predictions' && config.method === 'post') { if (!signedIn) throw rejected(config, 401, 'UNAUTHENTICATED'); saved.push(JSON.parse(config.data)); return reply({ data: prediction }); }
      if (config.url === `/predictions/${_id}`) return reply({ data: prediction });
      throw new Error(`Unexpected request ${config.method} ${config.url}`);
    };
    render(<MemoryRouter initialEntries={['/calculate']}><AuthProvider><Routes>
      <Route path="/calculate" element={<CalculatePage/>}/>
      <Route path="/result/preview" element={<PreviewResultPage/>}/>
      <Route path="/login" element={<LoginPage/>}/>
      <Route element={<RequireAuth/>}><Route path="/result" element={<ResultPage/>}/></Route>
    </Routes></AuthProvider></MemoryRouter>);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Predict WQI' }) as HTMLButtonElement).disabled).toBe(false));
    const tour = await screen.findByRole('dialog');
    fireEvent.click(within(tour).getByRole('button', { name: 'Skip' }));
    scroll.mockRestore();
    expect(screen.queryByRole('button', { name: 'Excel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excel WQI guide' })).toBeNull();
    for (const [label, value] of Object.entries({ 'Coliforms': 500, 'Amoni': 0.1, 'pH': 7, 'Phosphat': 0.2, 'DO — Dissolved Oxygen': 6, 'COD': 4 })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Predict WQI' }));
    await screen.findByText('Heavily polluted');
    expect(previewed).toEqual([{ parameters, unitBasis: 'training-source-unverified' }]);
    expect(saved).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to save' }));
    expect(await screen.findByText('Sign in to save your WQI result. You will go back to it right after.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: account.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery staple' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await screen.findByText('Record ID');
    expect(saved).toEqual([{ parameters, unitBasis: 'training-source-unverified' }]);
  });
});
