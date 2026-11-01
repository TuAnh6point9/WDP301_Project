import { displayText, msg, useLocale } from '@/i18n';
import { useEffect } from 'react';
import type { PageMeta } from '@wqi/contracts';
import { pageItems } from '@/lib/paging';
import { Icon } from './Icon';

/** The count and the page numbers of one table. Buttons stay in the DOM across pages so keyboard focus is kept. */
export function Pager({ meta, onPage, noun }: { meta?: PageMeta; onPage: (page: number) => void; noun: string }) {
  useLocale();
  const beyond = meta && meta.page > Math.max(meta.pages, 1) ? Math.max(meta.pages, 1) : null;
  // Reviewing the last row of the last page leaves that page empty.
  useEffect(() => { if (beyond) onPage(beyond); }, [beyond]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return null;
  const { page, pages, limit, total } = meta;
  const go = (target: number, allowed: boolean) => () => { if (allowed) onPage(target); };
  return <div className="table-foot">
    <span className="table-count">{msg('common.rangeSummary', { start: total ? (page - 1) * limit + 1 : 0, end: Math.min(page * limit, total), total, noun: displayText(noun) })}</span>
    {pages > 1 && <nav className="pager" aria-label={msg('common.pagination')}>
      <button type="button" className="btn btn-secondary btn-sm" aria-disabled={page <= 1} onClick={go(page - 1, page > 1)}><Icon name="chevronLeft"/>{msg('common.previous')}</button>
      {pageItems(page, pages).map((item, index) => item === 'gap'
        ? <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">…</span>
        : <button key={item} type="button" className={item === page ? 'btn btn-secondary btn-sm is-current' : 'btn btn-secondary btn-sm'} aria-current={item === page ? 'page' : undefined} onClick={go(item, item !== page)}>{item}</button>)}
      <button type="button" className="btn btn-secondary btn-sm" aria-disabled={page >= pages} onClick={go(page + 1, page < pages)}>{msg('common.next')}<Icon name="chevronRight"/></button>
    </nav>}
  </div>;
}
