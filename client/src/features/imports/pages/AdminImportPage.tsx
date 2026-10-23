import { messageText, errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage as failed, fileSizeMessage, rawColumns, parameterKeys, parameterLabels, rawParameterColumns } from '@wqi/contracts';
import { useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { listStations } from '@/features/stations/api';
import { defaultRange } from '@/features/system/api';
import type { DateRange } from '@/features/system/types';
import { DateRangeFields, Pager, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { commitImport, listBatchRows, listImportBatches, normalizeRow, previewImport } from '../api';
import type { ImportBatch, ImportedRow, ImportPreview } from '../types';

type BatchRef = Pick<ImportBatch, '_id' | 'fileName'>;

const MAX_MB = 5;
// Same column rules as the WQI calculation upload: the six model columns are required, Temp/BOD5 are optional.
const MODEL_COLUMNS = new Set<string>(Object.values(rawParameterColumns));
const REQUIRED = rawColumns.filter(name => MODEL_COLUMNS.has(name));
const OPTIONAL = rawColumns.filter(name => !MODEL_COLUMNS.has(name));
/** Row issues only concern the six model columns, so any issue blocks normalization. */
const usable = (row: ImportedRow) => !row.waterRecordId && !row.issues.length;
const cell = (value: unknown) => value === null || value === undefined || value === '' ? <span className="muted">{msg('common.empty')}</span> : String(value);

export function AdminImportPage() {
  useLocale();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Awaited<ReturnType<typeof commitImport>> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [history, setHistory] = useState<DateRange & { page: number }>(() => ({ ...defaultRange(), page: 1 }));
  const batches = useAsync(() => listImportBatches(history), [history.from, history.to, history.page]);
  useFirstLoadReadiness(batches.loading, batches.error);
  const [opened, setOpened] = useState<BatchRef | null>(null);
  const step = imported ? 3 : preview ? 1 : 0;

  async function load(next: File) {
    if (!/\.xlsx$/i.test(next.name)) { toast.show(M.FILE_REQUIRED); return; }
    if (next.size > MAX_MB * 1024 * 1024) { toast.show(fileSizeMessage(MAX_MB)); return; }
    setFile(next); setPreview(null); setPreviewError(''); setImported(null); setReading(true);
    try {
      setPreview(await previewImport(next));
    } catch (error) {
      setPreviewError(failed(error, M.READ_FILE));
    } finally {
      setReading(false);
    }
  }
  function reset() {
    setFile(null); setPreview(null); setPreviewError(''); setImported(null);
    if (input.current) input.current.value = '';
  }
  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) load(dropped);
  }
  async function runImport() {
    if (!file || !preview) return;
    setImporting(true);
    try {
      // The server re-validates the same file; nothing from the preview is trusted.
      const result = await commitImport(file);
      setImported(result);
      toast.show(result.duplicate ? 'This file was already imported' : 'Import complete');
      setHistory(previous => ({ ...previous, page: 1 }));
      batches.reload();
    } catch (error) {
      toast.show(failed(error, M.IMPORT_FAILED));
    } finally {
      setImporting(false);
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('imports.title')}</h1>
        <p className="sub">{msg('imports.description')}</p>
      </div>
      <div className="page-actions"><Link to="/admin/data" className="btn btn-secondary">{msg('imports.reviewRecords')}</Link></div>
    </div>

    <ol className="wizard" aria-label={msg('imports.steps')}>
      {[msg('imports.upload'), msg('imports.validate'), msg('imports.commit')].map((label, index) => <li key={index} className={index < step ? 'done' : index === step ? 'on' : undefined} aria-current={index === step ? 'step' : undefined}>{displayText(label)}</li>)}
    </ol>

    <div className="split stretch" style={{ '--split': 'minmax(0, 1.5fr) minmax(0, 1fr)' } as CSSProperties}>
      <div className="stack-24">
        <section className="card card-pad stack" aria-labelledby="up-title">
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
        </section>

        <section className="card card-pad stack" aria-labelledby="val-title">
          <div className="row-between">
            <h2 className="h3" id="val-title">{msg('imports.stepValidation')}</h2>
            <span className="badge b-neutral">{file ? file.name : msg('imports.noFile')}</span>
          </div>
          <div className="grid cols-3" style={{ gap: 12 }}>
            <div className="tile"><span className="tile-label">{msg('imports.rowsRead')}</span><span className="tile-value">{preview ? preview.rowCount : '—'}</span></div>
            <div className="tile"><span className="tile-label">{msg('imports.validRows')}</span><span className="tile-value c-ok">{preview ? preview.rowCount - preview.issueCount : '—'}</span></div>
            <div className="tile"><span className="tile-label">{msg('imports.invalidRows')}</span><span className="tile-value c-danger">{preview ? preview.issueCount : '—'}</span></div>
          </div>
          {preview?.duplicate && <div className="banner warn"><Icon name="warn"/><span>{msg('imports.duplicateHint')}</span></div>}
          {preview && <p className="small text-2">{msg('imports.missingMetadata')}</p>}
          <div className="card card-flush" style={{ boxShadow: 'none' }}>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>{msg('common.row')}</th>{rawColumns.map(name => <th key={name}>{displayText(name)}</th>)}<th>{msg('common.issues')}</th></tr></thead>
                <tbody>
                  {!preview && <tr className="empty-row"><td colSpan={rawColumns.length + 2}>{msg('imports.uploadHint')}</td></tr>}
                  {preview?.rows.map(row => <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    {rawColumns.map(name => <td key={name}>{cell(row.values[name])}</td>)}
                    <td className={row.issues.length ? 'c-danger small' : 'small text-2'}>{row.issues.map(messageText).join(' · ') || msg('common.ok')}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
          {preview && preview.rowCount > preview.rows.length && <span className="xs muted">{msg('imports.firstRows')}{' '}{preview.rows.length} {msg('common.of')} {preview.rowCount} {msg('common.rowsNoun')}.</span>}
        </section>

        <section className="card card-pad stack" aria-labelledby="imp-title">
          <h2 className="h3" id="imp-title">{msg('imports.stepCommit')}</h2>
          <p className="small text-2">{msg('imports.rawHint')}</p>
          <button type="button" className="btn btn-primary" disabled={!preview || importing || Boolean(imported)} onClick={runImport}>
            {imported ? msg('imports.imported') : importing ? msg('imports.importing') : preview ? msg('imports.importCount', { count: preview.rowCount }) : msg('imports.importRows')}
          </button>
          {imported && <div className={imported.duplicate ? 'banner warn' : 'banner ok'}>
            <Icon name={imported.duplicate ? 'warn' : 'check'} strokeWidth={2.4}/>
            <span>{imported.duplicate ? msg('imports.alreadyImported', { file: imported.batch.fileName }) : msg('imports.storedBatch', { count: imported.batch.rowCount, file: imported.batch.fileName })}</span>
            <button type="button" className="link small" style={{ marginLeft: 'auto' }} onClick={() => setOpened(imported.batch)}>{msg('imports.openRows')}</button>
          </div>}
        </section>
      </div>

      <div className="stack-24">
        <section className="card card-pad stack" aria-labelledby="fmt-title">
          <h2 className="h3" id="fmt-title">{msg('imports.columns')}</h2>
          <p className="small text-2">{msg('imports.columnsHint')}</p>
          <span className="label">{msg('common.required')}</span>
          <div className="req-list">{REQUIRED.map(name => <span key={name}>{displayText(name)} <em>{msg('imports.requiredLower')}</em></span>)}</div>
          <span className="label">{msg('common.optional')}</span>
          <div className="req-list">{OPTIONAL.map(name => <span key={name}>{displayText(name)} <em>{msg('imports.missingOptional')}</em></span>)}</div>
        </section>
        <section className="card card-pad stack" aria-labelledby="rules-title">
          <h2 className="h3" id="rules-title">{msg('imports.rules')}</h2>
          <div>
            <div className="list-row"><span className="small">{msg('imports.xlsxOneSheet')} {MAX_MB} {msg('imports.noMacros')}</span><span className="status warn">{msg('imports.rejected')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.missingColumn')}</span><span className="status warn">{msg('imports.rejected')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.invalidRequired')}</span><span className="status off">{msg('imports.flagged')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.uncheckedFields')}</span><span className="status off">{msg('imports.notChecked')}</span></div>
            <div className="list-row"><span className="small">{msg('imports.sameFile')}</span><span className="status off">{msg('imports.notReimported')}</span></div>
          </div>
        </section>
      </div>
    </div>

    <section className="card card-flush" aria-labelledby="hist-title">
      <div className="card-head"><h2 className="h3" id="hist-title">{msg('imports.history')}</h2></div>
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <DateRangeFields value={history} onChange={next => setHistory({ ...next, page: 1 })}/>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('common.file')}</th><th>{msg('imports.uploadedBy')}</th><th>{msg('common.created')}</th><th>{msg('common.rows')}</th><th>{msg('imports.invalidRows')}</th><th>{msg('common.status')}</th><th className="t-right">{msg('common.action')}</th></tr></thead>
          <tbody>
            {batches.loading && <tr className="empty-row"><td colSpan={7}><LoadingIndicator scope="inline"/></td></tr>}
            {batches.error && <tr className="empty-row"><td colSpan={7} role="alert">{errorText(batches.error, M.LOAD_FAILED)}</td></tr>}
            {batches.data && !batches.data.data.length && <tr className="empty-row"><td colSpan={7}>{msg('imports.emptyHistory')}</td></tr>}
            {batches.data?.data.map(batch => <tr key={batch._id}>
              <td className="mono">{batch.fileName}</td>
              <td>{batch.uploadedBy?.name ?? '—'}</td>
              <td>{formatDateTime(batch.createdAt)}</td>
              <td>{batch.rowCount}</td>
              <td className={batch.issueCount ? 'c-danger strong' : undefined}>{batch.issueCount}</td>
              <td><span className={`status ${batch.status === 'ready' ? 'ok' : batch.status === 'failed' ? 'warn' : 'off'}`}>{batch.status === 'ready' ? msg('imports.imported') : batch.status === 'failed' ? msg('common.failed') : msg('imports.importingStatus')}</span></td>
              <td className="t-right">{batch.status === 'ready' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpened(batch)}>{msg('common.rows')}</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={batches.data?.meta} noun="batches" onPage={page => setHistory({ ...history, page })}/>
    </section>

    {opened && <BatchRows key={opened._id} batch={opened} onClose={() => setOpened(null)} toast={toast.show}/>}
    {toast.element}
  </main>;
}

function BatchRows({ batch, onClose, toast }: { batch: BatchRef; onClose: () => void; toast: (text: string) => void }) {
  useLocale();
  const [page, setPage] = useState(1);
  const rows = useAsync(() => listBatchRows(batch._id, page), [batch._id, page]);
  const [normalizing, setNormalizing] = useState<ImportedRow | null>(null);
  return <section className="card card-flush" aria-labelledby="rows-title">
    <div className="card-head">
      <h2 className="h3" id="rows-title">{msg('imports.rowsOf')}{' '}{batch.fileName}</h2>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{msg('common.close')}</button>
    </div>
    <div className="table-wrap">
      <table className="table compact">
        <thead><tr><th>{msg('common.row')}</th>{rawColumns.map(name => <th key={name}>{displayText(name)}</th>)}<th>{msg('common.issues')}</th><th className="t-right">{msg('common.record')}</th></tr></thead>
        <tbody>
          {rows.loading && <tr className="empty-row"><td colSpan={rawColumns.length + 3}><LoadingIndicator scope="inline"/></td></tr>}
          {rows.error && <tr className="empty-row"><td colSpan={rawColumns.length + 3} role="alert">{errorText(rows.error, M.LOAD_FAILED)}</td></tr>}
          {rows.data?.rows.map(row => <tr key={row._id}>
            <td>{row.rowNumber}</td>
            {rawColumns.map(name => <td key={name}>{cell(row.values[name])}</td>)}
            <td className={row.issues.length ? 'c-danger small' : 'small text-2'}>{row.issues.map(messageText).join(' · ') || msg('common.ok')}</td>
            <td className="t-right">{row.waterRecordId
              ? <span className="status ok">{msg('imports.normalized')}</span>
              : usable(row) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNormalizing(row)}>{msg('imports.normalize')}</button> : <span className="small muted">{msg('imports.invalidValues')}</span>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <Pager meta={rows.data?.meta} noun="rows" onPage={setPage}/>
    {normalizing && <NormalizeModal batch={batch} row={normalizing} onClose={() => setNormalizing(null)} onDone={() => { setNormalizing(null); toast('Record created · pending review'); rows.reload(); }} toast={toast}/>}
  </section>;
}

function NormalizeModal({ batch, row, onClose, onDone, toast }: { batch: BatchRef; row: ImportedRow; onClose: () => void; onDone: () => void; toast: (text: string) => void }) {
  useLocale();
  const stations = useAsync(listStations);
  async function save(form: FormData) {
    try {
      // datetime-local has no zone; measurement times are entered in Vietnam time.
      await normalizeRow(batch._id, row._id, { stationId: String(form.get('station')), measuredAt: `${String(form.get('measuredAt'))}:00+07:00`, sourceNote: String(form.get('note')).trim() });
      onDone();
    } catch (error) {
      toast(failed(error, M.SAVE_RECORD));
    }
  }
  const none = stations.data && !stations.data.length;
  return <Modal width={560} title={msg('imports.normalizeRow', { row: row.rowNumber })} submitLabel={none ? undefined : msg('imports.createRecord')} onClose={onClose} onSubmit={event => save(new FormData(event.currentTarget))}>
    <div className="modal-body">
      <div className="field span-2"><span className="label">{msg('imports.unchanged')}</span>
        <div className="req-list">{parameterKeys.map(key => <span key={key}>{parameterLabels[key]} <em>{String(row.values[rawParameterColumns[key]])}</em></span>)}</div>
        <span className="hint">{msg('imports.rawOnly')}</span></div>
      <div className="field span-2"><label className="label" htmlFor="n-station">{msg('common.station')}</label>
        {stations.loading ? <LoadingIndicator scope="inline"/> : stations.error ? <p role="alert" className="hint">{errorText(stations.error, M.LOAD_FAILED)}</p>
          : none ? <p role="alert" className="hint">{msg('imports.needStation')}</p>
            : <select id="n-station" name="station" className="input sm" required>{stations.data!.map(station => <option key={station.id} value={station.id}>{station.code} · {station.name}</option>)}</select>}</div>
      <div className="field"><label className="label" htmlFor="n-time">{msg('imports.measuredAt')}</label><input id="n-time" name="measuredAt" type="datetime-local" className="input sm" required/></div>
      <div className="field"><label className="label" htmlFor="n-note">{msg('imports.sourceNote')}</label><input id="n-note" name="note" className="input sm" required minLength={10} maxLength={2000} placeholder={msg('imports.sourcePlaceholder')}/></div>
    </div>
  </Modal>;
}
