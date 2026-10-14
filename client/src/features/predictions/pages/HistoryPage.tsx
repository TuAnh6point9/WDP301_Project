import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PageMeta } from '@wqi/contracts';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon } from '@/components/Icon';
import { listCalculationPage } from '../api';
import { fieldsForRows, calculationCsv } from '../snapshotFields';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

const PAGE = 6;
export function HistoryPage() {
  const { user, sessionEpoch } = useAuth();
  const [page, setPage] = useState(1);
  const region = useRef<HTMLDivElement>(null);
  const [regionHeight, setRegionHeight] = useState(280);
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(page, PAGE), [page, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.data.length ? 'ready' : 'empty');
  const cachedMeta = useRef<{ session: string; meta: PageMeta } | null>(null);
  const session = `${user?._id}:${sessionEpoch}`;
  useEffect(() => { if (data) cachedMeta.current = { session, meta: data.meta }; }, [data, session]);
  useLayoutEffect(() => {
    if (data && region.current) setRegionHeight(previous => Math.max(previous, Math.ceil(region.current!.getBoundingClientRect().height)));
  }, [data]);
  const meta = data?.meta ?? (cachedMeta.current?.session === session ? cachedMeta.current.meta : undefined);
  const rows = data?.data ?? [];
  const fields = fieldsForRows(rows);
  const start = rows.length && meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const end = rows.length ? start + rows.length - 1 : 0;
  function exportCsv() {
    if (!data || loading || error) return;
    downloadCsv(`wqi-calculation-history-page-${data.meta.page}.csv`, calculationCsv(rows));
  }
  return <main className="container page">
    <div className="page-head"><div className="stack-4"><h1 className="h1">WQI Calculation History</h1><p className="sub">Your saved WQI predictions, newest first.</p></div><div className="toolbar"><button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={loading || Boolean(error) || !rows.length}><Icon name="download"/>Export this page (CSV)</button><Link to="/calculate" className="btn btn-primary">New calculation</Link></div></div>
    <nav className="row row-wrap" aria-label="Loại lịch sử"><Link className="btn btn-primary" aria-current="page" to="/history">Nhập tay</Link><Link className="btn btn-secondary" to="/history/excel">Tính từ Excel</Link></nav>
    <div className="card card-pad-sm stat"><span className="stat-label">Total Calculations</span><span className="stat-value">{meta?.total ?? '—'}</span><span className="small text-2">Export includes only the currently displayed page. Each result retains its original inputs and unit basis.</span></div>
    <div className="card card-flush"><div ref={region} className="history-data" style={{ minHeight: regionHeight }} aria-busy={loading}>
    {loading || error ? <PageStatus inline error={error} onRetry={reload} label="Loading results…"/> : <div className="table-wrap"><table className="table">
      <thead><tr><th>Calculated At</th>{fields.map(field => <th key={field.key}>{field.label}</th>)}<th>WQI</th><th>Classification</th><th className="t-right">Action</th></tr></thead>
      <tbody>{!rows.length && <tr><td colSpan={fields.length + 4} className="muted" style={{ textAlign: 'center', padding: 28 }}>No calculations yet. Create a new calculation when the model is available.</td></tr>}{rows.map(item => <tr key={item.id}><td>{formatDateTime(item.at)}</td>{fields.map(field => <td key={field.key}>{item.inputs[field.key] ?? '—'}</td>)}<td className="strong">{item.wqi}</td><td><ClassificationBadge value={item.qualityClass}/></td><td className="t-right"><Link to={`/result?id=${encodeURIComponent(item.id)}`} className="link small">View</Link></td></tr>)}</tbody>
    </table></div>}</div><div className="table-foot"><span className="small muted">{data ? `Showing ${start}–${end} of ${data.meta.total} calculations` : `Page ${page}`}</span><div className="pager"><button type="button" className="btn btn-secondary btn-sm" aria-label="Previous page" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="small" aria-live="polite">Page {page} of {Math.max(1, meta?.pages ?? 1)}</span><button type="button" className="btn btn-secondary btn-sm" aria-label="Next page" disabled={loading || !meta || page >= meta.pages} onClick={() => setPage(page + 1)}>›</button></div></div></div>
  </main>;
}
