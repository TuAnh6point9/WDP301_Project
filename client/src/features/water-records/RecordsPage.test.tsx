// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecordsPage } from './RecordsPage';

const observed = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock('../../lib/hooks', () => ({
  useApi: (path: string | null) => {
    if (path) observed.paths.push(path);
    return { data: [], loading: false, error: '', reload: vi.fn() };
  },
  useStations: () => ({ data: [], loading: false, error: '', reload: vi.fn() }),
}));
vi.mock('../../components/StationMap', () => ({ StationMap: () => null }));
vi.mock('@phosphor-icons/react', () => ({ Plus: () => null, Database: () => null, WarningCircle: () => null }));
beforeEach(() => { observed.paths.length = 0; });
afterEach(cleanup);

describe('record filters', () => {
  it('requests only verified records for the public page and keeps missing data empty', () => {
    render(<MemoryRouter><RecordsPage/></MemoryRouter>);
    expect(observed.paths.at(-1)).toContain('status=verified');
    expect(screen.getByText(/Chưa có bản ghi phù hợp bộ lọc/)).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ghi nhận dữ liệu' })).toBeNull();
  });

  it('converts Vietnam time boundaries to UTC and rejects an inverted interval', () => {
    render(<MemoryRouter><RecordsPage/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Từ thời điểm'), { target: { value: '2026-05-01T00:00:00' } });
    fireEvent.change(screen.getByLabelText('Đến trước thời điểm'), { target: { value: '2026-05-02T00:00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    const query = new URLSearchParams(observed.paths.at(-1)?.split('?')[1]);
    expect(query.get('from')).toBe('2026-04-30T17:00:00.000Z');
    expect(query.get('to')).toBe('2026-05-01T17:00:00.000Z');
    fireEvent.change(screen.getByLabelText('Từ thời điểm'), { target: { value: '2026-05-03T00:00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(screen.getByRole('alert').textContent).toContain('Thời gian bắt đầu phải trước thời gian kết thúc');
    expect(new URLSearchParams(observed.paths.at(-1)?.split('?')[1]).get('from')).toBe('2026-04-30T17:00:00.000Z');
  });
});
