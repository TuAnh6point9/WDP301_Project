import { USER_MESSAGES as M, userErrorMessage as failed, fileSizeMessage } from '@wqi/contracts';
import { useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { listStations } from '@/features/stations/api';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Modal';
import { commitImport, listImportBatches, previewImport } from '../api';
import type { ImportOptions, ImportPreview } from '../types';

const COLUMNS = ['Date', 'Station', 'pH', 'DO', 'BOD5', 'COD', 'NH4+', 'Coliform'];


export function AdminImportPage() {
  const { data: stations = [], loading: stationsLoading, error: stationsError } = useAsync(listStations);
  const { data: recent = [], loading: recentLoading, error: recentError } = useAsync(listImportBatches);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<ImportOptions>({ station: '', duplicates: 'skip' });
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const validated = preview !== null;
  const step = done ? 3 : validated ? 1 : 0;

  async function load(next: File) {
    if (!/\.xlsx$/i.test(next.name)) { toast.show(M.FILE_REQUIRED); return; }
    if (next.size > 10 * 1024 * 1024) { toast.show(fileSizeMessage(10)); return; }
    setFile(next); setPreview(null); setDone(false); setReading(true);
    try {
      setPreview(await previewImport(next, options));
    } catch (error) {
      toast.show(failed(error, M.READ_FILE));
    } finally {
      setReading(false);
    }
  }
  function reset() {
    setFile(null); setPreview(null); setDone(false);
    if (input.current) input.current.value = '';
  }
  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) load(dropped);
  }
  async function runImport() {
    if (!preview) return;
    setImporting(true);
    try {
      await commitImport(preview.id);
      setDone(true);
      toast.show('Import complete');
    } catch (error) {
      toast.show(failed(error, M.IMPORT_FAILED));
    } finally {
      setImporting(false);
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">Import Excel Data</h1>
        <p className="sub">Upload lab results in .xlsx format. Rows are validated before anything is written to the database.</p>
      </div>
      <div className="page-actions">
        <button type="button" className="btn btn-secondary" onClick={() => {
          downloadCsv('wqi-import-template.csv', [COLUMNS]);
          toast.show('Template downloaded (open in Excel and save as .xlsx)');
        }}><Icon name="download"/>Download Template</button>
        <Link to="/admin/data" className="btn btn-secondary">Import History</Link>
      </div>
    </div>

    <ol className="wizard" aria-label="Import steps">
      {['Upload file', 'Validate rows', 'Import to database'].map((label, index) => <li key={label} className={index < step ? 'done' : index === step ? 'on' : undefined} aria-current={index === step ? 'step' : undefined}>{label}</li>)}
    </ol>

    <div className="split stretch" style={{ '--split': 'minmax(0, 1.5fr) minmax(0, 1fr)' } as CSSProperties}>
      <div className="stack-24">
        {/* STEP 1 */}
        <section className="card card-pad stack" aria-labelledby="up-title">
          <h2 className="h3" id="up-title">1 · Upload file</h2>
          <label className={dragging ? 'dropzone is-drag' : 'dropzone'} htmlFor="file" hidden={Boolean(file)} onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
            <span className="dropzone-ic"><Icon name="upload" className="i-lg"/></span>
            <b style={{ fontSize: 14 }}>Drag and drop an .xlsx file here</b>
            <span className="xs muted">or</span>
            <span className="btn btn-primary btn-sm" style={{ padding: '0 14px' }}>Choose File</span>
            <span className="xs muted">Max 10 MB · one sheet · first row is the header</span>
            <input ref={input} id="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={e => { const f = e.target.files?.[0]; if (f) load(f); }}/>
          </label>
          {file && <div className="file-chip">
            <span className="file-ic"><Icon name="file"/></span>
            <div className="stack-4 grow">
              <b style={{ fontSize: 13.5 }}>{file.name}</b>
              <div className="bar" aria-hidden="true"><i style={{ width: reading ? '50%' : '100%' }}/></div>
              <span className="xs muted">{reading ? 'Reading…' : `${(file.size / 1024).toFixed(0)} KB${preview ? ` · ${preview.total} rows` : ''}`}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Remove</button>
          </div>}
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label className="label" htmlFor="opt-station">Station (if not in file)</label>
              <select id="opt-station" className="input sm" value={options.station} disabled={stationsLoading} onChange={e => setOptions({ ...options, station: e.target.value })}><option value="">Read from “Station” column</option>{stations.map(s => s.code).sort().map(code => <option key={code}>{code}</option>)}</select>{stationsLoading && <LoadingIndicator scope="inline"/>}{stationsError && <p role="alert" className="hint">{failed(stationsError, M.LOAD_FAILED)}</p>}</div>
            <div className="field"><label className="label" htmlFor="opt-dup">When a sample already exists</label>
              <select id="opt-dup" className="input sm" value={options.duplicates} onChange={e => setOptions({ ...options, duplicates: e.target.value as ImportOptions['duplicates'] })}><option value="skip">Skip duplicate rows</option><option value="replace">Replace existing values</option></select></div>
          </div>
        </section>

        {/* STEP 2 */}
        <section className="card card-pad stack" aria-labelledby="val-title">
          <div className="row-between">
            <h2 className="h3" id="val-title">2 · Validation result</h2>
            <span className="badge b-neutral">{file ? file.name : 'No file yet'}</span>
          </div>
          <div className="grid cols-3" style={{ gap: 12 }}>
            <div className="tile"><span className="tile-label">Rows read</span><span className="tile-value">{preview ? preview.total : '—'}</span></div>
            <div className="tile"><span className="tile-label">Valid</span><span className="tile-value c-ok">{preview ? preview.valid : '—'}</span></div>
            <div className="tile"><span className="tile-label">Errors</span><span className="tile-value c-danger">{preview ? preview.errors.length : '—'}</span></div>
          </div>
          <div className="card card-flush" style={{ boxShadow: 'none' }}>
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Row</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  {!validated && <tr className="empty-row"><td colSpan={3}>Upload a file to see validation results.</td></tr>}
                  {preview?.rows.map(({ range: row, ok, note }) => <tr key={row}>
                    <td>{row}</td>
                    <td>{ok ? <span className="badge b-good">✓ Valid</span> : <span className="badge b-vpoor">✗ Error</span>}</td>
                    <td className="text-2">{note}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* STEP 3 */}
        <section className="card card-pad stack" aria-labelledby="imp-title">
          <h2 className="h3" id="imp-title">3 · Import to database</h2>
          <p className="small text-2">Valid rows will be added to Data Records and used for WQI calculations. Rows with errors are skipped and listed in the error report.</p>
          <div className="row row-wrap" style={{ gap: 10 }}>
            <button type="button" className="btn btn-primary grow" disabled={!validated || importing || done} onClick={runImport}>
              {done ? 'Imported' : importing ? 'Importing…' : preview ? `Import ${preview.valid} Valid Rows` : 'Import Valid Rows'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={!validated} onClick={() => preview && downloadCsv('import-errors.csv', [['Row', 'Error'], ...preview.errors.map(e => [e.row, e.error])])}><Icon name="download"/>Download Error Report</button>
          </div>
          {done && <div className="banner ok">
            <Icon name="check" strokeWidth={2.4}/>
            <span>{preview?.valid} rows imported, {preview?.errors.length} skipped. WQI recalculated for affected stations.</span>
            <Link to="/admin/data" className="link small" style={{ marginLeft: 'auto' }}>View records</Link>
          </div>}
        </section>
      </div>

      {/* SIDE: FORMAT */}
      <div className="stack-24">
        <section className="card card-pad stack" aria-labelledby="fmt-title">
          <h2 className="h3" id="fmt-title">Required columns</h2>
          <p className="small text-2">Column names are matched case-insensitively. Order does not matter.</p>
          <div className="req-list">
            {[['Date', 'dd/mm/yyyy'], ['Station', 'AKH-xx'], ['pH', '0–14'], ['DO', 'mg/L'], ['BOD5', 'mg/L'], ['COD', 'mg/L'], ['NH4+', 'mg/L'], ['Coliform', 'MPN/100mL']].map(([name, unit]) => <span key={name}>{name} <em>{unit}</em></span>)}
          </div>
        </section>
        <section className="card card-pad stack" aria-labelledby="rules-title">
          <h2 className="h3" id="rules-title">Validation rules</h2>
          <div>
            <div className="list-row"><span className="small">All 8 columns present</span><span className="status ok">Required</span></div>
            <div className="list-row"><span className="small">Numbers only, no text in value cells</span><span className="status ok">Required</span></div>
            <div className="list-row"><span className="small">Station code exists in Stations</span><span className="status ok">Required</span></div>
            <div className="list-row"><span className="small">Values outside QCVN 08 limits</span><span className="status warn">Flagged, still imported</span></div>
            <div className="list-row"><span className="small">Same station + date already stored</span><span className="status off">Per duplicate setting</span></div>
          </div>
        </section>
        <section className="card card-pad stack" aria-labelledby="recent-title">
          <div className="row-between"><h2 className="h3" id="recent-title">Recent imports</h2><Link to="/admin/data" className="link small">All</Link></div>
          <div>
            {recentLoading ? <LoadingIndicator scope="inline"/> : recentError ? <p role="alert" className="small">{failed(recentError, M.LOAD_FAILED)}</p> : !recent.length && <p className="small muted">No imports yet.</p>}
            {recent.slice(0, 3).map(batch => <div className="list-row" key={batch.id}>
              <span className="stack-4"><b className="small">{batch.file}</b><span className="xs muted">{formatDate(batch.date)} · {batch.by}</span></span>
              {batch.status === 'Imported' ? <span className="status ok">{batch.rows} rows</span> : <span className={batch.status === 'Rejected' ? 'status warn' : 'status off'}>{batch.status}</span>}
            </div>)}
          </div>
        </section>
      </div>
    </div>
    {toast.element}
  </main>;
}
