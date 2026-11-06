import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Pager } from '@/components/Pager';
import { useAuth } from '@/features/auth/AuthContext';
import { Icon } from '@/components/Icon';
import { listCalculationPage } from '../api';
import { fieldsForRows } from '../snapshotFields';
import { useCalculationExcel } from '../useCalculationExcel';
import { messageText } from '@/i18n/messages';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

export function HistoryPage() {
  useLocale();
  const { user, sessionEpoch } = useAuth();
  // A new session starts clean, so one account's rows never stay on screen for the next.
  return <HistoryContent key={`${user?._id}:${sessionEpoch}`}/>;
}

function HistoryContent() {
  useLocale();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(page, PAGE_SIZE), [page], { keepPrevious: true });
  usePageReadiness(error ? 'error' : loading && !data ? 'pending' : data?.data.length ? 'ready' : 'empty');
  const rows = data?.data ?? [];
  const fields = fieldsForRows(rows);
  const excel = useCalculationExcel();
  function exportExcel() {
    if (!data || loading || error) return;
    void excel.download(data.meta.page, PAGE_SIZE, `lich-su-tinh-wqi-trang-${data.meta.page}.xlsx`);
  }
  return <main className="container page">
    <div className="page-head"><div className="stack-4"><h1 className="h1">{msg('history.title')}</h1><p className="sub">{msg('history.description')}</p></div><div className="page-actions"><button type="button" className="btn btn-secondary" onClick={exportExcel} disabled={loading || excel.busy || Boolean(error) || !rows.length} aria-busy={excel.busy}><Icon name="download"/>{excel.busy ? msg('common.downloading') : msg('history.exportPage')}</button><Link to="/report" className="btn btn-secondary"><Icon name="file"/>{msg('history.report')}</Link><Link to="/calculate" className="btn btn-primary">{msg('history.newCalculation')}</Link></div></div>
    {excel.failure && <div className="callout callout-warn" role="alert">{messageText(excel.failure)}</div>}
    <nav className="tabs" aria-label={msg('history.type')}><Link className="on" aria-current="page" to="/history">{msg('history.manual')}</Link><Link to="/history/excel">{msg('history.excel')}</Link></nav>
    <div className="card card-flush"><div className="history-data" aria-busy={loading}>
    {(loading && !data) || error ? <PageStatus inline error={error} onRetry={reload} label={msg('common.loadingResults')}/> : <div className="table-wrap" aria-busy={loading}><table className="table">
      <thead><tr><th>{msg('history.calculatedAt')}</th><th>WQI</th><th>{msg('common.classification')}</th>{fields.map(field => <th key={field.key}>{displayText(field.label)}</th>)}<th className="col-action">{msg('common.action')}</th></tr></thead>
      <tbody>{!rows.length && <tr className="empty-row"><td colSpan={fields.length + 4}>{msg('history.empty')}</td></tr>}{rows.map(item => <tr key={item.id}><td>{formatDateTime(item.at)}</td><td className="strong">{item.wqi}</td><td><ClassificationBadge value={item.qualityClass}/></td>{fields.map(field => <td key={field.key}>{item.inputs[field.key] ?? '—'}</td>)}<td className="col-action"><Link to={`/result?id=${encodeURIComponent(item.id)}`} className="btn btn-secondary btn-sm">{msg('common.view')}</Link></td></tr>)}</tbody>
    </table></div>}</div><Pager meta={data?.meta} noun="calculations" onPage={setPage}/></div>
  </main>;
}
