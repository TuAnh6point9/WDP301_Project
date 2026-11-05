import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { PageStatus } from '@/components/PageStatus';
import { Pager } from '@/components/Pager';
import { batchStatusLabels, listWqiBatches } from '../batch-api';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

export function BatchHistoryPage() {
  useLocale();
  const { user, sessionEpoch } = useAuth();
  // A new session starts clean, so one account's rows never stay on screen for the next.
  return <BatchHistory key={`${user?._id}:${sessionEpoch}`}/>;
}

function BatchHistory() {
  useLocale();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => listWqiBatches(page), [page], { keepPrevious: true });
  usePageReadiness(error ? 'error' : loading && !data ? 'pending' : data?.rows.length ? 'ready' : 'empty');
  return <main className="container page stack-24">
    <div className="page-head"><div className="stack-4"><h1 className="h1">{msg('excel.history')}</h1><p className="sub">{msg('excel.historyHint')}</p></div><div className="page-actions"><FeatureGuide id="excel-user" stage="history" autoStart={false} ready={!loading || Boolean(data) || Boolean(error)}/><Link className="btn btn-primary" data-tour="excel-user-new" to="/calculate">{msg('excel.newBatch')}</Link></div></div>
    <nav className="tabs" aria-label={msg('history.type')}><Link to="/history">{msg('history.manual')}</Link><Link className="on" aria-current="page" to="/history/excel">{msg('history.excel')}</Link></nav>
    {(loading && !data) || error ? <PageStatus inline error={error} onRetry={reload}/> : <section className="card card-flush" data-tour="excel-user-history"><div className="table-wrap" aria-busy={loading}><table className="table">
      <thead><tr><th>{msg('common.file')}</th><th>{msg('common.createdAt')}</th><th>{msg('excel.totalRows')}</th><th>{msg('excel.succeeded')}</th><th>{msg('excel.errors')}</th><th>{msg('common.status')}</th><th className="col-action">{msg('common.action')}</th></tr></thead>
      <tbody>{data?.rows.map(batch => <tr key={batch._id}><td>{batch.fileName}</td><td>{formatDateTime(batch.createdAt)}</td><td>{batch.rowCount}</td><td>{batch.successCount}</td><td>{batch.errorCount}</td><td>{displayText(batchStatusLabels[batch.status])}</td><td className="col-action"><Link className="btn btn-secondary btn-sm" to={`/excel/${batch._id}`}>{msg('excel.openBatch')}</Link></td></tr>)}{!data?.rows.length && <tr className="empty-row"><td colSpan={7}>{msg('excel.emptyHistory')}</td></tr>}</tbody>
    </table></div><Pager meta={data?.meta} noun="batches" onPage={setPage}/></section>}
  </main>;
}
