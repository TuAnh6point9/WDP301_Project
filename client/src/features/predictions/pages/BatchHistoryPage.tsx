import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { PageStatus } from '@/components/PageStatus';
import { batchStatusLabels, listWqiBatches } from '../batch-api';

export function BatchHistoryPage() {
  useLocale();
  const [page, setPage] = useState(1);
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listWqiBatches(page), [page, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.rows.length ? 'ready' : 'empty');
  return <main className="container page stack-24">
    <div className="page-head"><div className="stack-4"><h1 className="h1">{msg('excel.history')}</h1><p className="sub">{msg('excel.historyHint')}</p></div><Link className="btn btn-primary" to="/calculate">{msg('excel.newBatch')}</Link></div>
    <nav className="row row-wrap" aria-label={msg('history.type')}><Link className="btn btn-secondary" to="/history">{msg('history.manual')}</Link><Link className="btn btn-primary" aria-current="page" to="/history/excel">{msg('history.excel')}</Link></nav>
    {loading || error ? <PageStatus inline error={error} onRetry={reload}/> : <section className="card card-flush"><div className="table-wrap"><table className="table">
      <thead><tr><th>{msg('common.file')}</th><th>{msg('common.createdAt')}</th><th>{msg('excel.totalRows')}</th><th>{msg('excel.succeeded')}</th><th>{msg('excel.errors')}</th><th>{msg('common.status')}</th><th>{msg('common.action')}</th></tr></thead>
      <tbody>{data?.rows.map(batch => <tr key={batch._id}><td>{batch.fileName}</td><td>{formatDateTime(batch.createdAt)}</td><td>{batch.rowCount}</td><td>{batch.successCount}</td><td>{batch.errorCount}</td><td>{displayText(batchStatusLabels[batch.status])}</td><td><Link className="link" to={`/excel/${batch._id}`}>{msg('excel.openBatch')}</Link></td></tr>)}{!data?.rows.length && <tr><td colSpan={7}>{msg('excel.emptyHistory')}</td></tr>}</tbody>
    </table></div><div className="table-foot"><span className="small">{msg('excel.batches')}{' '}{data?.meta.total ?? 0} {' '}{msg('excel.pagePrefix')}{' '}{page}/{Math.max(1, data?.meta.pages ?? 1)}</span><div className="pager"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>{msg('common.previous')}</button><button className="btn btn-secondary btn-sm" disabled={page >= (data?.meta.pages ?? 1)} onClick={() => setPage(n => n + 1)}>{msg('common.next')}</button></div></div></section>}
  </main>;
}
