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
  const { id } = useParams();
  const { user, sessionEpoch } = useAuth();
  return <BatchContent key={`${user?._id}:${sessionEpoch}:${id ?? 'new'}`} id={id}/>;
}
function BatchContent({ id }: { id?: string }) {
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
    <div className="page-head"><div className="stack-4"><h1 className="h1">Calculate WQI from Excel</h1><p className="sub">Each row is one sample. Preview the data, calculate in bulk and download the results.</p></div><Link className="btn btn-secondary" to="/history/excel">Excel Calculation History</Link></div>
    <Link className="back-link" to="/calculate"><Icon name="back"/>Back to Calculate WQI</Link>
    {failure && <div className="callout callout-warn" role="alert"><span className="grow">{failure}</span>{id && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRevision(n => n + 1)}>Try again</button>}</div>}
    {id && !batch && loading && <LoadingIndicator label="Loading batch…" scope="inline"/>}
    {batch && <>
      <section className="card card-pad stack" aria-label="Batch details">
        <div className="row row-wrap"><h2 className="h3 grow" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{batch.fileName}</h2><span className="badge" role="status">{batchStatusLabels[batch.status]}</span></div>
        <p className="small">Rows: {batch.rowCount.toLocaleString('en-US')} · Valid: {batch.validCount.toLocaleString('en-US')} · Input errors: {batch.invalidCount.toLocaleString('en-US')}</p>
        {working && !failure && <div className="excel-processing" aria-busy="true"><LoadingIndicator label="Calculating WQI from Excel…"/><p className="small text-2">Calculating WQI from Excel…</p></div>}
        {batch.status !== 'preview' && <div className="stack-8"><label htmlFor="batch-progress">Processed {processed}/{batch.rowCount} rows · Succeeded: {batch.successCount} · Errors: {batch.errorCount}</label><progress className="excel-progress" id="batch-progress" max={batch.rowCount} value={processed}/></div>}
        {working && <p className="small text-2" role="status">You can leave this page. The batch keeps running on the server; reopen it from Excel Calculation History.</p>}
        {batch.status === 'paused' && <p className="small" role="status">{batch.pauseCode === 'AI_MODEL_CHANGED' ? 'The model has changed. Create a new batch to avoid mixing results from different models.' : 'The batch was interrupted. Saved results are kept; click Continue to calculate the remaining rows.'}</p>}
        <div className="row row-wrap" style={{ gap: 12 }}>
          {(batch.status === 'preview' || batch.status === 'paused') && <button className="btn btn-primary" type="button" disabled={busy || uploading || !batch.validCount || batch.pauseCode === 'AI_MODEL_CHANGED'} onClick={start}>{busy ? 'Sending…' : batch.status === 'paused' ? 'Continue' : `Calculate ${batch.validCount} valid row${batch.validCount === 1 ? '' : 's'}`}</button>}
          <button className="btn btn-secondary" type="button" disabled={!completed || busy} onClick={download}>Download Excel results</button>
        </div>
        <ExcelFileButton label="Choose another file" disabled={busy} onBusyChange={setUploading}/>
      </section>
      <section className={`card card-flush${revealed ? ' excel-results-reveal' : ''}`} aria-label="Data and results">
        <div className="card-pad row row-wrap"><h2 className="h3 grow">Data and results</h2><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setPage(1); }}/>Show error rows only</label></div>
        <div className="table-wrap" aria-busy={loading}><table className="table">
          <caption className="sr-only">Source data and WQI results by Excel row number</caption>
          <thead><tr><th>Excel row</th>{rawColumns.map(key => <th key={key}>{key}</th>)}<th>WQI</th><th>Classification</th><th>Status / error reason</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row._id}><td>{row.rowNumber}</td>{rawColumns.map(key => <td key={key}>{row.values[key] ?? '—'}</td>)}<td>{row.result?.wqi ?? '—'}</td><td>{row.result ? <ClassificationBadge value={row.result.qualityClass}/> : '—'}</td><td>{row.issues.length ? row.issues.join('; ') : row.status === 'success' ? 'Succeeded' : 'Pending'}</td></tr>)}{!rows.length && <tr><td colSpan={12}>{loading ? 'Loading…' : errorsOnly ? 'No error rows.' : 'No data.'}</td></tr>}</tbody>
        </table></div>
        <div className="table-foot"><span className="small">Rows: {meta?.total ?? 0} · Page {page}/{Math.max(1, meta?.pages ?? 1)}</span><div className="pager"><button className="btn btn-secondary btn-sm" type="button" disabled={loading || page <= 1} onClick={() => setPage(n => n - 1)}>Previous page</button><button className="btn btn-secondary btn-sm" type="button" disabled={loading || page >= (meta?.pages ?? 1)} onClick={() => setPage(n => n + 1)}>Next page</button></div></div>
      </section>
    </>}
    <ResearchNote unitStatus="unverified" referenceBasis="lecturer-provided"/>
  </main>;
}
