// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@/i18n';
import { Pager } from './Pager';

const meta = (page: number, pages: number, total = pages * 10) => ({ page, limit: 10, total, pages });
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(cleanup);

describe('Pager', () => {
  it('jumps to a clicked page and marks the current one', () => {
    const onPage = vi.fn();
    render(<Pager meta={meta(6, 13, 126)} noun="records" onPage={onPage}/>);
    expect(screen.getByText('Showing 51–60 of 126 records')).toBeTruthy();
    expect(screen.getByRole('button', { name: '6' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: '13' }));
    expect(onPage).toHaveBeenCalledWith(13);
  });

  it('moves one page with the named buttons and stops at the ends', () => {
    const onPage = vi.fn();
    render(<Pager meta={meta(1, 3)} noun="records" onPage={onPage}/>);
    const previous = screen.getByRole('button', { name: 'Previous page' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(previous);
    expect(onPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('shows only the count when everything fits on one page', () => {
    render(<Pager meta={meta(1, 1, 5)} noun="records" onPage={() => {}}/>);
    expect(screen.getByText('Showing 1–5 of 5 records')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('steps back when the current page no longer exists', () => {
    const onPage = vi.fn();
    render(<Pager meta={{ page: 3, limit: 10, total: 20, pages: 2 }} noun="records" onPage={onPage}/>);
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('returns to page 1 when nothing is left', () => {
    const onPage = vi.fn();
    render(<Pager meta={{ page: 2, limit: 10, total: 0, pages: 0 }} noun="records" onPage={onPage}/>);
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('keeps the same button in place while moving, so keyboard focus stays', () => {
    const view = render(<Pager meta={meta(6, 13)} noun="records" onPage={() => {}}/>);
    const seven = screen.getByRole('button', { name: '7' });
    view.rerender(<Pager meta={meta(7, 13)} noun="records" onPage={() => {}}/>);
    expect(screen.getByRole('button', { name: '7' })).toBe(seven);
  });
});
