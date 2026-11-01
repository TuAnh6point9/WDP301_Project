import { describe, expect, it } from 'vitest';
import { clientPage, pageItems } from './paging';

describe('pageItems', () => {
  it.each([
    [1, 1, [1]],
    [3, 7, [1, 2, 3, 4, 5, 6, 7]],
    [1, 13, [1, 2, 'gap', 13]],
    [4, 13, [1, 2, 3, 4, 5, 'gap', 13]],
    [6, 13, [1, 'gap', 5, 6, 7, 'gap', 13]],
    [10, 13, [1, 'gap', 9, 10, 11, 12, 13]],
    [13, 13, [1, 'gap', 12, 13]],
  ])('page %i of %i', (page, pages, want) => {
    expect(pageItems(page, pages)).toEqual(want);
  });
});

describe('clientPage', () => {
  const items = Array.from({ length: 24 }, (_, index) => index + 1);
  it('cuts one page and reports its position', () => {
    expect(clientPage(items, 3)).toEqual({ rows: [21, 22, 23, 24], meta: { page: 3, limit: 10, total: 24, pages: 3 } });
  });
  it('falls back to the last page when the list shrinks', () => {
    expect(clientPage(items.slice(0, 12), 3)).toEqual({ rows: [11, 12], meta: { page: 2, limit: 10, total: 12, pages: 2 } });
  });
  it('stays on page 1 for an empty list', () => {
    expect(clientPage([], 4)).toEqual({ rows: [], meta: { page: 1, limit: 10, total: 0, pages: 0 } });
  });
});
