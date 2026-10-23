import { messageText } from '@/i18n/messages';
import { displayText, msg, useLocale, localeName } from '@/i18n';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rawColumns, type PageMeta, type PredictionBatch, type PredictionBatchRow } from '@wqi/contracts';
import { useAuth } from '@/features/auth/AuthContext';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { ResearchNote } from '../components/ResearchNote';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { ExcelFileButton } from '../components/ExcelFileButton';
import { Icon } from '@/components/Icon';
import { batchFailure, batchStatusLabels, getWqiBatch, getWqiBatchRows, getWqiBatchExcel, startWqiBatch } from '../batch-api';

export function BatchPage() {
  useLocale();
  const { id } = useParams();
  const { user, sessionEpoch } = useAuth();
  return <BatchContent key={`${user?._id}:${sessionEpoch}:${id ?? 'new'}`} id={id}/>;
}
function BatchContent({ id }: { id?: string }) {
  useLocale();
  const [batch, setBatch] = useState<PredictionBatch>();
  const [rows, setRows] = useState<PredictionBatchRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>();
  const [page, setPage] = useState(1), [errorsOnly, setErrorsOnly] = useState(false);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id)), [failure, setFailure] = useState('');
  const [uploading, setUploading] = useState(false), [revealed, setRevealed] = useState(false);
  const wasWorking = useRef(false);
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  usePageReadiness(!id ? 'ready' : batch ? 'ready' : failure ? 'error' : 'pending');
  useEffect(() => {
    if (!id) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setFailure('');
    async function refresh() {
      try {
        const detail = await getWqiBatch(id!);
        if (!active) return;
        // Read rows after the terminal status, so completion never reveals an older table snapshot.
        const data = await getWqiBatchRows(id!, page, errorsOnly);
        if (!active) return;
        const finished = detail.status === 'completed' || detail.status === 'completed_with_errors';
        if (wasWorking.current && finished) setRevealed(true);
        wasWorking.current = ['queued', 'running'].includes(detail.status);
        setBatch(detail); setRows(data.rows); setMeta(data.meta); setFailure('');
        if (['queued', 'running'].includes(detail.status)) timer = setTimeout(refresh, 2000);
      } catch (error) {
        if (active) setFailure(batchFailure(error, 'Could not load the batch. Saved results are kept.'));
      } finally { if (active) setLoading(false); }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [id, page, errorsOnly, revision]);
  async function action(run: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailure('');
    try { await run(); }
    catch (error) { if (mounted.current) setFailure(batchFailure(error)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function start() {
    if (!id || uploading) return;
    void action(async () => { const updated = await startWqiBatch(id); if (mounted.current) { wasWorking.current = true; setBatch(updated); setRevision(n => n + 1); } });
  }
  function download() {
    if (!id) return;
    void action(async () => {
      const blob = await getWqiBatchExcel(id); if (!mounted.current) return;
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `wqi-${id}.xlsx`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const completed = batch?.status === 'completed' || batch?.status === 'completed_with_errors';
  const working = batch?.status === 'queued' || batch?.status === 'running';
  const processed = batch ? batch.successCount + batch.errorCount : 0;
  return <main className="container page stack-24">
    <div className="page-head"><div className="stack-4"><h1 className="h1">{msg('excel.title')}</h1><p className="sub">{msg('excel.description')}</p></div><Link className="btn btn-secondary" to="/history/excel">{msg('excel.history')}</Link></div>
    <Link className="back-link" to="/calculate"><Icon name="back"/>{msg('excel.backCalculate')}</Link>
    {failure && <div className="callout callout-warn" role="alert"><span className="grow">{messageText(failure)}</span>{id && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRevision(n => n + 1)}>{msg('common.tryAgain')}</button>}</div>}
    {id && !batch && loading && <LoadingIndicator label={msg('excel.loadingBatch')} scope="inline"/>}
    {batch && <>
      <section className="card card-pad stack" aria-label={msg('excel.details')}>
        <div className="row row-wrap"><h2 className="h3 grow" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{batch.fileName}</h2><span className="badge" role="status">{displayText(batchStatusLabels[batch.status])}</span></div>
        <p className="small">{msg('excel.rowsPrefix')}{' '}{batch.rowCount.toLocaleString(localeName())} {' '}{msg('excel.validPrefix')}{' '}{batch.validCount.toLocaleString(localeName())} {' '}{msg('excel.errorsPrefix')}{' '}{batch.invalidCount.toLocaleString(localeName())}</p>
        {working && !failure && <div className="excel-processing" aria-busy="true"><LoadingIndicator label={msg('excel.calculating')}/><p className="small text-2">{msg('excel.calculating')}</p></div>}
        {batch.status !== 'preview' && <div className="stack-8"><label htmlFor="batch-progress">{msg('excel.processed')}{' '}{processed}/{batch.rowCount} {' '}{msg('excel.successPrefix')}{' '}{batch.successCount} {' '}{msg('excel.errorPrefix')}{' '}{batch.errorCount}</label><progress className="excel-progress" id="batch-progress" max={batch.rowCount} value={processed}/></div>}
        {working && <p className="small text-2" role="status">{msg('excel.backgroundHint')}</p>}
        {batch.status === 'paused' && <p className="small" role="status">{batch.pauseCode === 'AI_MODEL_CHANGED' ? msg('excel.changedModel') : msg('excel.interrupted')}</p>}
        <div className="row row-wrap" style={{ gap: 12 }}>
          {(batch.status === 'preview' || batch.status === 'paused') && <button className="btn btn-primary" type="button" disabled={busy || uploading || !batch.validCount || batch.pauseCode === 'AI_MODEL_CHANGED'} onClick={start}>{busy ? msg('excel.sending') : batch.status === 'paused' ? msg('excel.continue') : msg('excel.calculateRows', { count: batch.validCount })}</button>}
          <button className="btn btn-secondary" type="button" disabled={!completed || busy} onClick={download}>{msg('excel.downloadResults')}</button>
        </div>
        <ExcelFileButton label={msg('excel.chooseAnother')} disabled={busy} onBusyChange={setUploading}/>
      </section>
      <section className={`card card-flush${revealed ? ' excel-results-reveal' : ''}`} aria-label={msg('excel.dataResults')}>
        <div className="card-pad row row-wrap"><h2 className="h3 grow">{msg('excel.dataResults')}</h2><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setPage(1); }}/>{msg('excel.errorsOnly')}</label></div>
        <div className="table-wrap" aria-busy={loading}><table className="table">
          <caption className="sr-only">{msg('excel.tableCaption')}</caption>
          <thead><tr><th>{msg('excel.excelRow')}</th>{rawColumns.map(key => <th key={key}>{key}</th>)}<th>WQI</th><th>{msg('common.classification')}</th><th>{msg('excel.statusReason')}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row._id}><td>{row.rowNumber}</td>{rawColumns.map(key => <td key={key}>{row.values[key] ?? '—'}</td>)}<td>{row.result?.wqi ?? '—'}</td><td>{row.result ? <ClassificationBadge value={row.result.qualityClass}/> : '—'}</td><td>{row.issues.length ? row.issues.map(messageText).join('; ') : row.status === 'success' ? msg('excel.succeeded') : msg('common.pending')}</td></tr>)}{!rows.length && <tr><td colSpan={12}>{loading ? msg('common.loading') : errorsOnly ? msg('excel.noErrors') : msg('common.noDataPeriod')}</td></tr>}</tbody>
        </table></div>
        <div className="table-foot"><span className="small">{msg('excel.rowsPrefix')}{' '}{meta?.total ?? 0} {' '}{msg('excel.pagePrefix')}{' '}{page}/{Math.max(1, meta?.pages ?? 1)}</span><div className="pager"><button className="btn btn-secondary btn-sm" type="button" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>{msg('common.previous')}</button><button className="btn btn-secondary btn-sm" type="button" disabled={loading || page >= (meta?.pages ?? 1)} onClick={() => setPage(n => n + 1)}>{msg('common.next')}</button></div></div>
      </section>
    </>}
    <ResearchNote unitStatus="unverified" referenceBasis="lecturer-provided"/>
  </main>;
}
