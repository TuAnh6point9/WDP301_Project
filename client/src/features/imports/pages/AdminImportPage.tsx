import { messageText, errorText } from '@/i18n/messages';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage as failed, fileSizeMessage, importColumns, type ImportColumn } from '@wqi/contracts';
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import type { DateRange } from '@/features/system/types';
import { DateRangeFields, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { commitImport, downloadImportTemplate, listBatchRows, listImportBatches, previewImport } from '../api';
import { CheckSummary, CHECKED, cell, PagedDialog, SAMPLE_SIZE } from '../components/CheckSummary';
import { FillCodesDialog, type FillDraft } from '../components/FillCodesDialog';
import type { BatchCheck, ImportBatch, ImportFill, ImportPreview, ImportResult } from '../types';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

type BatchRef = Pick<ImportBatch, '_id' | 'code'>;

const MAX_MB = 5;
// Column guide says what each column means; how values are checked lives in the rules card.
const GUIDE: Record<ImportColumn, TranslationKey> = {
  'Mã đợt': 'imports.colCode',
  'Mã trạm': 'imports.colStation',
  PH: 'imports.colPh',
  DO: 'imports.colDo',
  COD: 'imports.colCod',
  Amoni: 'imports.colAmoni',
  Phosphat: 'imports.colPhosphat',
  Coliforms: 'imports.colColiforms',
  Temp: 'imports.colTemp',
  BOD5: 'imports.colBod5',
  'Ghi chú': 'imports.colNote',
  WQI: 'imports.colWqi',
};
// The batch code and station are required too; a file without them gets them from the dialog.
const EXTRA = importColumns.filter(name => !CHECKED.includes(name));
// The WQI typed in a file is not the record's WQI, so showing it here would only mislead.
const STORED = importColumns.filter(name => name !== 'Mã đợt' && name !== 'WQI');
const list = (items: string[]) => items.join(', ');
const rowsOf = (batch: BatchCheck) => batch.validCount;
const toSave = (preview: ImportPreview) => preview.batches.reduce((sum, batch) => sum + rowsOf(batch), 0);

export function AdminImportPage() {
  useLocale();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [fills, setFills] = useState<ImportFill[]>([]);
  const [fillDraft, setFillDraft] = useState<FillDraft | null>(null);
  const [filling, setFilling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);
  const [history, setHistory] = useState<DateRange & { page: number }>({ from: '', to: '', page: 1 });
  const batches = useAsync(() => listImportBatches(history), [history.from, history.to, history.page], { keepPrevious: true });
  useFirstLoadReadiness(batches.loading, batches.error);
  const [opened, setOpened] = useState<BatchRef | null>(null);
  const step = saved ? 4 : preview ? 3 : file ? 2 : 0;
  const saveCount = preview ? toSave(preview) : 0;
  const skipped = saved ? saved.batches.filter(batch => batch.skipped).map(batch => batch.code) : [];

  async function load(next: File) {
    if (!/\.xlsx$/i.test(next.name)) { toast.show(M.FILE_REQUIRED); return; }
    if (next.size > MAX_MB * 1024 * 1024) { toast.show(fileSizeMessage(MAX_MB)); return; }
    setFile(next); setPreview(null); setPreviewError(''); setSaved(null); setFills([]); setFillDraft(null); setReading(true);
    try {
      const checked = await previewImport(next);
      setPreview(checked);
      setFilling(checked.missing.length > 0);
    } catch (error) {
      setPreviewError(failed(error, M.READ_FILE));
    } finally {
      setReading(false);
    }
  }
  /** Checks the same file again with what the admin filled in. */
  async function applyFills(draft: FillDraft, next: ImportFill[]) {
    if (!file) return;
    setFilling(false); setFillDraft(draft); setFills(next); setPreviewError(''); setReading(true);
    try {
      setPreview(await previewImport(file, next));
    } catch (error) {
      setPreviewError(failed(error, M.READ_FILE));
    } finally {
      setReading(false);
    }
  }
  function reset() {
    setFile(null); setPreview(null); setPreviewError(''); setSaved(null); setFills([]); setFillDraft(null);
    if (input.current) input.current.value = '';
  }
  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) load(dropped);
  }
  async function downloadTemplate() {
    setDownloading(true);
    try {
      const url = URL.createObjectURL(await downloadImportTemplate()), anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'mau-nhap-du-lieu.xlsx'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.show(failed(error, M.DOWNLOAD_FAILED));
    } finally {
      setDownloading(false);
    }
  }
  async function save(confirm: string[]) {
    if (!file || !preview) return;
    setConfirming(false); setSaving(true);
    try {
      // The server re-checks the same file; nothing from the preview is trusted.
      setSaved(await commitImport(file, confirm, fills));
      setHistory(previous => ({ ...previous, page: 1 }));
      batches.reload();
    } catch (error) {
      toast.show(failed(error, M.IMPORT_FAILED));
    } finally {
      setSaving(false);
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('imports.title')}</h1>
        <p className="sub">{msg('imports.description')}</p>
      </div>
      <div className="page-actions"><FeatureGuide id="excel-admin" stage={saved ? 'results' : preview ? 'preview' : 'prepare'}
        busy={reading || saving || downloading} ready={!filling && !confirming && !opened && !skippedOpen}
        autoStart={!batches.loading && !batches.error && !previewError}/><Link to="/admin/data" className="btn btn-secondary">{msg('imports.reviewRecords')}</Link></div>
    </div>

    <ol className="wizard" aria-label={msg('imports.steps')}>
      {[msg('imports.template'), msg('imports.upload'), msg('imports.validate'), msg('imports.commit')].map((label, index) => <li key={index} className={index < step ? 'done' : index === step ? 'on' : undefined} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
    </ol>

    <div className="split stretch" style={{ '--split': 'minmax(0, 1.5fr) minmax(0, 1fr)' } as CSSProperties}>
      <div className="stack-24">
        <section className="card card-pad stack" data-tour="excel-admin-template" aria-labelledby="tpl-title">
          <h2 className="h3" id="tpl-title">{msg('imports.stepTemplate')}</h2>
          <p className="small text-2">{msg('imports.templateHint')}</p>
          <div><button type="button" className="btn btn-secondary" disabled={downloading} onClick={downloadTemplate}><Icon name="download"/>{msg('imports.downloadTemplate')}</button></div>
        </section>

        <section className="card card-pad stack" data-tour="excel-admin-upload" aria-labelledby="up-title">
          <h2 className="h3" id="up-title">{msg('imports.stepUpload')}</h2>
          <label className={dragging ? 'dropzone is-drag' : 'dropzone'} htmlFor="file" hidden={Boolean(file)} onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
            <span className="dropzone-ic"><Icon name="upload" className="i-lg"/></span>
            <b style={{ fontSize: 14 }}>{msg('imports.drop')}</b>
            <span className="xs muted">{msg('common.or')}</span>
            <span className="btn btn-primary btn-sm" style={{ padding: '0 14px' }}>{msg('imports.choose')}</span>
            <span className="xs muted">{msg('common.max')}{' '}{MAX_MB} {msg('imports.fileLimits')}</span>
            <input ref={input} id="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }}/>
          </label>
          {file && <div className="file-chip">
            <span className="file-ic"><Icon name="file"/></span>
            <div className="stack-4 grow">
              <b style={{ fontSize: 13.5 }}>{file.name}</b>
              <div className="bar" aria-hidden="true"><i style={{ width: reading ? '50%' : '100%' }}/></div>
              <span className="xs muted">{reading ? msg('imports.validating') : msg('imports.fileSummary', { size: (file.size / 1024).toFixed(0), rows: preview ? msg('imports.rowSummary', { count: preview.rowCount }) : '' })}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{msg('common.remove')}</button>
          </div>}
          {previewError && <div className="callout callout-warn" role="alert">{messageText(previewError)}</div>}
          {preview && preview.missing.length > 0 && !saved && <div><button type="button" className="btn btn-secondary" onClick={() => setFilling(true)}>{msg('imports.fillOpen')}</button></div>}
        </section>

        {/* Steps 3 and 4 appear once there is a file to talk about. */}
        {file && <section className="card card-pad stack" data-tour="excel-admin-check" aria-labelledby="val-title">
          <div className="row-between">
            <h2 className="h3" id="val-title">{msg('imports.stepValidation')}</h2>
            <span className="badge b-neutral file-name" title={file.name}>{file.name}</span>
          </div>
          <div className="grid cols-3" style={{ gap: 12 }}>
            <div className="tile"><span className="tile-label">{msg('imports.rowsRead')}</span><span className="tile-value">{preview ? preview.rowCount : '—'}</span></div>
            <div className="tile"><span className="tile-label">{msg('imports.rowsToSave')}</span><span className="tile-value c-ok">{preview ? saveCount : '—'}</span></div>
            <div className="tile"><span className="tile-label">{msg('imports.rowsNotSaved')}</span><span className="tile-value c-danger">{preview ? preview.rowCount - saveCount : '—'}</span></div>
          </div>
          {preview && <CheckSummary preview={preview}/>}
        </section>}

        {file && <section className="card card-pad stack" data-tour="excel-admin-save" aria-labelledby="imp-title">
          <h2 className="h3" id="imp-title">{msg('imports.stepCommit')}</h2>
          <p className="small text-2">{msg('imports.saveHint')}</p>
          <button type="button" className="btn btn-primary" disabled={!saveCount || saving || reading || Boolean(saved)} onClick={() => preview?.confirm.length ? setConfirming(true) : void save([])}>
            {saved ? msg('imports.saved') : saving ? msg('common.saving') : preview ? msg('imports.saveCount', { count: saveCount }) : msg('imports.saveRows')}
          </button>
          {saved && <div className="banner ok" data-tour="excel-admin-saved" role="status">
            <Icon name="check" strokeWidth={2.4}/>
            <span className="stack-4">
              <span>{msg('imports.savedSummary', {
                batches: saved.batches.filter(batch => batch.added + batch.overwritten).length,
                records: saved.batches.reduce((sum, batch) => sum + batch.added + batch.overwritten, 0),
                rejected: saved.rejected.length + saved.batches.reduce((sum, batch) => sum + batch.issueCount, 0),
              })}</span>
              {skipped.length > 0 && <span>{msg('imports.skippedBatches', { count: skipped.length, codes: list(skipped.slice(0, SAMPLE_SIZE)) + (skipped.length > SAMPLE_SIZE ? ', …' : '') })}{' '}{skipped.length > SAMPLE_SIZE && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSkippedOpen(true)}>{msg('imports.viewAll')}</button>}</span>}
              {saved.wqi.calculated > 0 && <span>{msg('imports.wqiCalculated', { count: saved.wqi.calculated })}</span>}
              {saved.wqi.pending > 0 && <span>{msg('imports.wqiPending', { count: saved.wqi.pending })}</span>}
            </span>
            <Link to="/admin/data" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}>{msg('imports.reviewRecords')}</Link>
          </div>}
        </section>}
      </div>

      <div className="stack-24">
        <section className="card card-pad stack" data-tour="excel-admin-columns" aria-labelledby="fmt-title">
          <h2 className="h3" id="fmt-title">{msg('imports.columns')}</h2>
          <p className="small text-2">{msg('imports.columnsHint')}</p>
          {([[CHECKED, 'common.required'], [EXTRA, 'common.optional']] as const).map(([names, label]) => <div key={label} className="column-group">
            <h3>{msg(label)} ({names.length})</h3>
            {names.map(name => <details key={name} className="column-guide">
              <summary><b>{name}</b><Icon name="chevronDown"/></summary>
              <p className="small text-2">{msg(GUIDE[name])}</p>
            </details>)}
          </div>)}
        </section>
        {/* Detailed rules stay one click away so the page reads simply at first. */}
        <details className="card card-pad stack rules-card">
          <summary className="h3">{msg('imports.rules')}</summary>
          <div>
            <div className="list-row"><span className="small">{msg('imports.xlsxOneSheet')} {MAX_MB} {msg('imports.noMacros')}</span><span className="status warn">{msg('imports.rejected')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.missingColumn')}</span><span className="status warn">{msg('imports.rejected')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.ruleMissing')}</span><span className="status off">{msg('imports.asksFirst')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.ruleCode')}</span><span className="status warn">{msg('imports.rowRejected')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.invalidRequired')}</span><span className="status off">{msg('imports.flagged')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.ruleStation')}</span><span className="status off">{msg('imports.flagged')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.ruleExisting')}</span><span className="status off">{msg('imports.asksFirst')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.uncheckedFields')}</span><span className="status off">{msg('imports.notChecked')}</span></div>
          </div>
        </details>
      </div>
    </div>

    <section className="card card-flush" data-tour="excel-admin-history" aria-labelledby="hist-title">
      <div className="card-head"><h2 className="h3" id="hist-title">{msg('imports.history')}</h2></div>
      <div className="table-filters">
        <DateRangeFields value={history} onChange={next => setHistory({ ...next, page: 1 })}/>
      </div>
      <div className="table-wrap" aria-busy={batches.loading}>
        <table className="table">
          <thead><tr><th>{msg('imports.batchCode')}</th><th>{msg('imports.uploadedBy')}</th><th>{msg('common.created')}</th><th>{msg('common.records')}</th><th className="col-action">{msg('common.action')}</th></tr></thead>
          <tbody>
            {batches.loading && !batches.data && <tr className="empty-row"><td colSpan={5}><LoadingIndicator scope="inline"/></td></tr>}
            {batches.error && <tr className="empty-row"><td colSpan={5} role="alert">{errorText(batches.error, M.LOAD_FAILED)}</td></tr>}
            {batches.data && !batches.data.data.length && <tr className="empty-row"><td colSpan={5}>{msg('imports.emptyHistory')}</td></tr>}
            {batches.data?.data.map(batch => <tr key={batch._id}>
              <td><b>{batch.code}</b></td>
              <td>{batch.uploadedBy?.name ?? '—'}</td>
              <td>{formatDateTime(batch.createdAt)}</td>
              <td>{batch.rowCount}</td>
              <td className="col-action"><button type="button" className="btn btn-secondary btn-sm" aria-label={msg('imports.openRowsLabel', { code: batch.code ?? '' })} onClick={() => setOpened(batch)}>{msg('imports.openRows')}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={batches.data?.meta} noun="batches" onPage={page => setHistory({ ...history, page })}/>
    </section>

    {opened && <BatchRows key={opened._id} batch={opened} onClose={() => setOpened(null)}/>}
    {filling && preview && <FillCodesDialog preview={preview} draft={fillDraft} guideBusy={reading || saving || downloading} onClose={() => setFilling(false)} onApply={(draft, next) => void applyFills(draft, next)}/>}
    {skippedOpen && <PagedDialog title={msg('imports.skippedTitle')} items={skipped} noun="batches" width={520} onClose={() => setSkippedOpen(false)}>
      {codes => <ul className="batch-list">{codes.map(code => <li key={code} className="list-row"><b>{code}</b></li>)}</ul>}
    </PagedDialog>}
    {confirming && preview && <OverwriteDialog preview={preview} guideBusy={reading || saving || downloading} onClose={() => setConfirming(false)} onSave={keys => void save(keys)}/>}
    {toast.element}
  </main>;
}

/** One tick per batch code that already exists: overwrite the old batch with the new one, or skip it. New batches save either way. */
function OverwriteDialog({ preview, onClose, onSave, guideBusy }: { preview: ImportPreview; onClose: () => void; onSave: (keys: string[]) => void; guideBusy: boolean }) {
  useLocale();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const repeated = preview.batches.filter(batch => batch.existing && rowsOf(batch));
  const count = toSave(preview) - repeated.filter(batch => !chosen.has(batch.code)).reduce((sum, batch) => sum + rowsOf(batch), 0);
  function toggle(code: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(code); else next.delete(code);
    setChosen(next);
  }
  return <Modal width={600} title={msg('imports.confirmTitle')} submitLabel={msg('imports.saveCount', { count })} submitDisabled={!count} onClose={onClose} onSubmit={() => onSave(preview.confirm.filter(key => chosen.has(key.split('|')[0])))}
    footerTourTarget="excel-admin-overwrite-apply" extraAction={<FeatureGuide id="excel-admin" stage="overwrite" busy={guideBusy}/>}>
    <div className="modal-body is-scroll" data-tour="excel-admin-overwrite">
      <p className="small text-2 span-2">{msg('imports.confirmHint')}</p>
      {repeated.length > 1 && <label className="choice-row span-2">
        <input type="checkbox" checked={chosen.size === repeated.length} onChange={event => setChosen(new Set(event.target.checked ? repeated.map(batch => batch.code) : []))}/>
        <b>{msg('imports.overwriteAll', { count: repeated.length })}</b>
      </label>}
      {repeated.map(batch => <div key={batch.code} className="choice-row span-2">
        <input type="checkbox" aria-label={msg('imports.overwriteBatch', { code: batch.code })} checked={chosen.has(batch.code)} onChange={event => toggle(batch.code, event.target.checked)}/>
        <details className="grow">
          <summary><b>{batch.code}</b></summary>
          <div className="stack-4">
            <span className="small text-2">{msg('imports.existingBatch', { date: formatDateTime(batch.existing!.createdAt), name: batch.existing!.uploadedBy?.name ?? '—', count: batch.existing!.rowCount })}</span>
            {batch.replaces > 0 && <span className="small c-warn strong">{msg('imports.willOverwrite', { count: batch.replaces })}</span>}
          </div>
        </details>
      </div>)}
    </div>
  </Modal>;
}

/** View only: records are reviewed on Review Data. */
function BatchRows({ batch, onClose }: { batch: BatchRef; onClose: () => void }) {
  useLocale();
  const [page, setPage] = useState(1);
  const rows = useAsync(() => listBatchRows(batch._id, page), [batch._id, page], { keepPrevious: true });
  // The table renders below the history, far from the button that opens it: bring it into view once its rows arrive.
  const panel = useRef<HTMLElement>(null);
  const shown = useRef(false);
  useEffect(() => {
    if (!rows.data || shown.current) return;
    shown.current = true;
    panel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [rows.data]);
  return <section ref={panel} className="card card-flush" style={{ scrollMarginTop: 'calc(var(--nav-h) + 16px)' }} aria-labelledby="rows-title">
    <div className="card-head">
      <h2 className="h3" id="rows-title">{msg('imports.rowsOfBatch', { code: batch.code })}</h2>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{msg('common.close')}</button>
    </div>
    <div className="table-wrap" aria-busy={rows.loading}>
      <table className="table compact">
        <thead><tr><th>{msg('common.file')}</th><th>{msg('common.row')}</th>{STORED.map(name => <th key={name}>{name}</th>)}</tr></thead>
        <tbody>
          {rows.loading && !rows.data && <tr className="empty-row"><td colSpan={STORED.length + 2}><LoadingIndicator scope="inline"/></td></tr>}
          {rows.error && <tr className="empty-row"><td colSpan={STORED.length + 2} role="alert">{errorText(rows.error, M.LOAD_FAILED)}</td></tr>}
          {rows.data?.rows.map(row => <tr key={row._id}>
            <td className="mono">{row.fileName ?? '—'}</td>
            <td>{row.rowNumber}</td>
            {STORED.map(name => <td key={name}>{cell(row.values[name])}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <Pager meta={rows.data?.meta} noun="rows" onPage={setPage}/>
  </section>;
}
