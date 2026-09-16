// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PredictionsPage } from './PredictionsPage';

const state = vi.hoisted(() => ({ available: false, post: vi.fn() }));
vi.mock('@phosphor-icons/react', () => ({ Database: () => null, WarningCircle: () => null }));
vi.mock('../../lib/hooks', () => ({
  useApi: () => ({ data: { available: state.available }, loading: false, error: '', reload: vi.fn() }),
}));
vi.mock('../../lib/axios', () => ({
  api: { post: state.post },
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

beforeEach(() => { state.available = false; state.post.mockReset(); });
afterEach(cleanup);

describe('WQI prediction form', () => {
  it('does not invent a result or offer a submission when AI is disabled', () => {
    render(<MemoryRouter><PredictionsPage/></MemoryRouter>);
    expect(screen.getByText('Chức năng dự đoán chưa khả dụng')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Tính WQI' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Kết quả dự đoán' })).toBeNull();
    expect(state.post).not.toHaveBeenCalled();
  });

  it('submits explicit real inputs including zero, then removes the prior result on failure', async () => {
    state.available = true;
    const parameters = { ph: 0, do: 0, bod5: 0, cod: 0, tss: 0, nh4: 0 };
    state.post.mockResolvedValueOnce({ data: { data: {
      _id: 'test-prediction', parameters, wqi: 20, qualityClass: 'Test classification',
      modelVersion: 'test-model', classificationVersion: 'test-scale', createdAt: '2026-05-01T00:00:00.000Z',
    } } });
    render(<MemoryRouter><PredictionsPage/></MemoryRouter>);
    for (const input of screen.getAllByRole('spinbutton')) fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Tính WQI' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Kết quả dự đoán' })).toBeDefined());
    expect(state.post).toHaveBeenCalledWith('/predictions', { parameters, unitBasis: 'mg/L; NH4+ as ion' });

    state.post.mockRejectedValueOnce(new Error('AI timeout'));
    fireEvent.click(screen.getByRole('button', { name: 'Tính WQI' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('AI timeout'));
    expect(screen.queryByRole('heading', { name: 'Kết quả dự đoán' })).toBeNull();
  });
});
