import type { PageMeta } from '@wqi/contracts';

export const PAGE_SIZE = 10;

/** Page numbers to show: first, last, current ±1; a gap that would hide only one page shows that page instead. */
export function pageItems(page: number, pages: number): (number | 'gap')[] {
  const shown = (n: number) => pages <= 7 || n === 1 || n === pages || Math.abs(n - page) <= 1;
  const items: (number | 'gap')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (shown(n) || (shown(n - 1) && shown(n + 1))) items.push(n);
    else if (items.at(-1) !== 'gap') items.push('gap');
  }
  return items;
}

/** One page of a list already held in the browser; a shrunken list falls back to its last page. */
export function clientPage<T>(items: T[], page: number): { rows: T[]; meta: PageMeta } {
  const pages = Math.ceil(items.length / PAGE_SIZE), current = Math.min(page, Math.max(pages, 1));
  return { rows: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), meta: { page: current, limit: PAGE_SIZE, total: items.length, pages } };
}
