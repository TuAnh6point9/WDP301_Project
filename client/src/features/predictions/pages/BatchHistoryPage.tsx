import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { PageStatus } from '@/components/PageStatus';
import { batchStatusLabels, listWqiBatches } from '../batch-api';

export function BatchHistoryPage() {
  const [page, setPage] = useState(1);
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listWqiBatches(page), [page, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.rows.length ? 'ready' : 'empty');
  return <main className="container page stack-24">
    <div className="page-head"><div className="stack-4"><h1 className="h1">Excel Calculation History</h1><p className="sub">Batches that belong to your account.</p></div><Link className="btn btn-primary" to="/calculate">New batch</Link></div>
    <nav className="row row-wrap" aria-label="History type"><Link className="btn btn-secondary" to="/history">Manual entry</Link><Link className="btn btn-primary" aria-current="page" to="/history/excel">From Excel</Link></nav>
    {loading || error ? <PageStatus inline error={error} onRetry={reload}/> : <section className="card card-flush"><div className="table-wrap"><table className="table">
      <thead><tr><th>File</th><th>Created At</th><th>Total Rows</th><th>Succeeded</th><th>Errors</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{data?.rows.map(batch => <tr key={batch._id}><td>{batch.fileName}</td><td>{formatDateTime(batch.createdAt)}</td><td>{batch.rowCount}</td><td>{batch.successCount}</td><td>{batch.errorCount}</td><td>{batchStatusLabels[batch.status]}</td><td><Link className="link" to={`/excel/${batch._id}`}>Open batch</Link></td></tr>)}{!data?.rows.length && <tr><td colSpan={7}>No Excel batches yet.</td></tr>}</tbody>
    </table></div><div className="table-foot"><span className="small">Batches: {data?.meta.total ?? 0} · Page {page}/{Math.max(1, data?.meta.pages ?? 1)}</span><div className="pager"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Previous page</button><button className="btn btn-secondary btn-sm" disabled={page >= (data?.meta.pages ?? 1)} onClick={() => setPage(n => n + 1)}>Next page</button></div></div></section>}
  </main>;
}
