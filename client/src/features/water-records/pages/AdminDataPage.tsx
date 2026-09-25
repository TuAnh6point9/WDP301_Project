import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadCsv } from '@/lib/csv';
import { quality } from '@/lib/wqi';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { Modal, useToast } from '@/components/Modal';
import { listStations } from '@/features/stations/api';
import { createWaterRecord, deleteWaterRecords, listWaterRecords, recalculateWqi, updateWaterRecord } from '../api';
import { getImportErrors, listImportBatches, rollbackImport } from '@/features/imports/api';
import type { ImportBatch } from '@/features/imports/types';
import type { RecordColumn as Col, WaterRecord as Rec, WaterRecordInput } from '../types';

// Limits: QCVN 08-MT:2015/BTNMT, column A2.
const LIMITS: Record<Col, readonly [number | null, number | null]> = { ph: [6, 8.5], do: [5, null], bod: [null, 6], cod: [null, 15], nh4: [null, .3], col: [null, 5000] };
const COLS: Col[] = ['ph', 'do', 'bod', 'cod', 'nh4', 'col'];
const DEC: Record<Col, number> = { ph: 1, do: 1, bod: 2, cod: 1, nh4: 2, col: 0 };
const FIELDS: [Col, string, string][] = [['ph', 'pH', '0.01'], ['do', 'DO (mg/L)', '0.01'], ['bod', 'BOD5 (mg/L)', '0.01'], ['cod', 'COD (mg/L)', '0.01'], ['nh4', 'NH₄⁺ (mg/L)', '0.01'], ['col', 'Coliform (MPN/100mL)', '1']];

const outOfRange = (k: Col, v: number | null) => { if (v === null) return false; const [lo, hi] = LIMITS[k]; return (lo !== null && v < lo) || (hi !== null && v > hi); };
const statusOf = (r: Rec) => COLS.some(k => r[k] === null) ? 'missing' : COLS.some(k => outOfRange(k, r[k])) ? 'flagged' : 'valid';
const fmtDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const failed = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

type Pending = { kind: 'delete'; ids: string[] } | { kind: 'rollback'; batch: ImportBatch };

export function AdminDataPage() {
  const { data, error, reload } = useAsync(() => Promise.all([listWaterRecords(), listImportBatches(), listStations()]));
  if (!data) return <PageStatus admin error={error} onRetry={reload}/>;
  const [records, imports, stations] = data;
  return <DataRecords initial={records} imports={imports} codes={stations.map(s => s.code).sort()}/>;
}

function DataRecords({ initial, imports, codes }: { initial: Rec[]; imports: ImportBatch[]; codes: string[] }) {
  const toast = useToast();
  const [records, setRecords] = useState(initial);
  const [filters, setFilters] = useState({ q: '', station: '', status: '', from: '', to: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Rec | 'new' | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const q = filters.q.trim().toLowerCase();
  const rows = records.filter(r => (!q || r.station.toLowerCase().includes(q) || r.source.toLowerCase().includes(q))
    && (!filters.station || r.station === filters.station) && (!filters.status || statusOf(r) === filters.status)
    && (!filters.from || r.date >= filters.from) && (!filters.to || r.date <= filters.to));
  const selVisible = rows.filter(r => selected.has(r.id)).length;
  const toggle = (id: string, on: boolean) => setSelected(previous => { const next = new Set(previous); if (on) next.add(id); else next.delete(id); return next; });

  async function save(form: FormData) {
    const num = (name: string) => { const v = String(form.get(name) ?? ''); return v === '' ? null : Number(v); };
    const input: WaterRecordInput = { date: String(form.get('date')), station: String(form.get('station')), ph: num('ph'), do: num('do'), bod: num('bod'), cod: num('cod'), nh4: num('nh4'), col: num('col') };
    try {
      const saved = editing && editing !== 'new' ? await updateWaterRecord(editing.id, input) : await createWaterRecord(input);
      setRecords(previous => (editing === 'new' ? [saved, ...previous] : previous.map(r => r.id === saved.id ? saved : r)).sort((a, b) => b.date.localeCompare(a.date)));
      toast.show(editing === 'new' ? 'Record added' : 'Record updated · WQI recalculated');
      setEditing(null);
    } catch (error) {
      toast.show(failed(error, 'Could not save the record'));
    }
  }
  async function confirm() {
    if (!pending) return;
    try {
      if (pending.kind === 'delete') {
        await deleteWaterRecords(pending.ids);
        setRecords(previous => previous.filter(r => !pending.ids.includes(r.id)));
        setSelected(previous => new Set([...previous].filter(id => !pending.ids.includes(id))));
        toast.show(`${pending.ids.length} record${pending.ids.length > 1 ? 's' : ''} deleted`);
      } else {
        await rollbackImport(pending.batch.id);
        toast.show('Import rolled back');
      }
    } catch (error) {
      toast.show(failed(error, 'The action failed'));
    }
    setPending(null);
  }
  async function recalculate() {
    try {
      await recalculateWqi([...selected]);
      toast.show(`WQI recalculated for ${selected.size} record${selected.size > 1 ? 's' : ''}`);
    } catch (error) {
      toast.show(failed(error, 'Could not recalculate WQI'));
    }
  }
  async function errorReport(batch: ImportBatch) {
    try {
      const errors = await getImportErrors(batch.id);
      downloadCsv(`${batch.file.replace('.xlsx', '')}-errors.csv`, [['Row', 'Error'], ...errors.map(e => [e.row, e.error])]);
    } catch (error) {
      toast.show(failed(error, 'Could not download the error report'));
    }
  }

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">Measurement Records</h1>
        <p className="sub">Review, correct and remove water quality samples before they are used for WQI and reports.</p>
      </div>
      <div className="page-actions">
        <Link to="/admin/import" className="btn btn-secondary"><Icon name="upload"/>Import Excel</Link>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" strokeWidth={2.4}/>Add Record</button>
      </div>
    </div>

    <div className="grid cols-4">
      <div className="card card-pad-sm stat"><span className="stat-label">Total Records</span><span className="stat-value">{records.length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Import Batches</span><span className="stat-value">{imports.length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Flagged (out of range)</span><span className="stat-value c-warn">{records.filter(r => statusOf(r) === 'flagged').length}</span></div>
      <div className="card card-pad-sm stat"><span className="stat-label">Missing Values</span><span className="stat-value c-danger">{records.filter(r => statusOf(r) === 'missing').length}</span></div>
    </div>

    {/* RECORDS */}
    <section className="card card-flush" aria-labelledby="rec-title">
      <div className="card-head">
        <h2 className="h3" id="rec-title">All Records</h2>
        <span className="small muted">Values marked ▲ are outside QCVN 08-MT:2015 column A2 limits</span>
      </div>
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <label className="input-icon grow" style={{ maxWidth: 280, flexBasis: 200 }}>
          <Icon name="search"/>
          <input type="search" className="input sm" placeholder="Search station or source…" aria-label="Search records" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })}/>
        </label>
        <select className="input sm" style={{ width: 'auto' }} aria-label="Station" value={filters.station} onChange={e => setFilters({ ...filters, station: e.target.value })}>
          <option value="">All Stations</option>
          {codes.map(code => <option key={code}>{code}</option>)}
        </select>
        <select className="input sm" style={{ width: 'auto' }} aria-label="Status" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option><option value="valid">Valid</option><option value="flagged">Flagged</option><option value="missing">Missing value</option>
        </select>
        <input type="date" className="input sm" style={{ width: 150 }} aria-label="From date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}/>
        <input type="date" className="input sm" style={{ width: 150 }} aria-label="To date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}/>
      </div>
      <div className="bulk-bar" hidden={selected.size === 0}>
        <span>{selected.size} selected</span>
        <span className="grow"/>
        <button type="button" className="btn btn-secondary btn-sm" onClick={recalculate}>Recalculate WQI</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
          downloadCsv('wqi-records-selected.csv', [['Date', 'Station', 'pH', 'DO', 'BOD5', 'COD', 'NH4', 'Coliform', 'WQI', 'Source'], ...records.filter(r => selected.has(r.id)).map(r => [r.date, r.station, ...COLS.map(k => r[k]), r.wqi, r.source])]);
          toast.show('Exported CSV');
        }}>Export selected</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setPending({ kind: 'delete', ids: [...selected] })}>Delete selected</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="col-check"><input type="checkbox" aria-label="Select all visible records" checked={rows.length > 0 && selVisible === rows.length} ref={el => { if (el) el.indeterminate = selVisible > 0 && selVisible < rows.length; }} onChange={e => rows.forEach(r => toggle(r.id, e.target.checked))}/></th>
              <th>Date</th><th>Station</th><th>pH</th><th>DO</th><th>BOD5</th><th>COD</th><th>NH₄⁺</th><th>Coliform</th><th>WQI</th><th>Source</th><th>Status</th><th className="t-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr className="empty-row"><td colSpan={13}>No records match these filters.</td></tr>}
            {rows.map(r => {
              const s = statusOf(r);
              return <tr key={r.id} className={selected.has(r.id) ? 'is-selected' : undefined}>
                <td className="col-check"><input type="checkbox" aria-label={`Select ${r.station} ${fmtDate(r.date)}`} checked={selected.has(r.id)} onChange={e => toggle(r.id, e.target.checked)}/></td>
                <td>{fmtDate(r.date)}</td>
                <td className="strong">{r.station}</td>
                {COLS.map(k => {
                  const v = r[k];
                  return <td key={k} className={v === null ? 'cell-missing' : outOfRange(k, v) ? 'cell-flag' : undefined} title={v !== null && outOfRange(k, v) ? 'Outside QCVN 08 A2 limit' : undefined}>
                    {v === null ? 'missing' : v.toLocaleString('en-US', { minimumFractionDigits: Math.min(1, DEC[k]), maximumFractionDigits: DEC[k] })}
                  </td>;
                })}
                <td>{r.wqi === null ? <span className="small muted">—</span> : <span className={`badge b-${quality(r.wqi).key}`}>{r.wqi}</span>}</td>
                <td className="small text-2">{r.source}</td>
                <td>{s === 'valid' ? <span className="status ok">Valid</span> : s === 'flagged' ? <span className="status warn">Flagged</span> : <span className="status off" style={{ color: 'var(--danger)' }}>Missing value</span>}</td>
                <td className="t-right"><span className="row-actions">
                  <button type="button" aria-label="Edit record" title="Edit" onClick={() => setEditing(r)}><Icon name="edit"/></button>
                  <button type="button" className="danger" aria-label="Delete record" title="Delete" onClick={() => setPending({ kind: 'delete', ids: [r.id] })}><Icon name="trash"/></button>
                </span></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="small muted">Showing {rows.length} of {records.length} records</span>
        <div className="pager">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Previous page" disabled>‹</button>
          <button type="button" className="btn btn-secondary btn-sm is-current" aria-current="page">1</button>
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Next page" disabled>›</button>
        </div>
      </div>
    </section>

    {/* IMPORT HISTORY */}
    <section className="card card-flush" aria-labelledby="imp-title">
      <div className="card-head">
        <h2 className="h3" id="imp-title">Import History</h2>
        <Link to="/admin/import" className="link small">New import</Link>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>File</th><th>Uploaded by</th><th>Date</th><th>Rows</th><th>Errors</th><th>Status</th><th className="t-right">Action</th></tr></thead>
          <tbody>
            {!imports.length && <tr className="empty-row"><td colSpan={7}>No imports yet.</td></tr>}
            {imports.map(item => <tr key={item.id}>
              <td className="mono">{item.file}</td><td>{item.by}</td><td>{item.date}</td><td>{item.rows}</td>
              <td className={item.errors ? 'c-danger strong' : undefined}>{item.errors}</td>
              <td><span className={`status ${item.status === 'Imported' ? 'ok' : item.status === 'Rejected' ? 'warn' : 'off'}`}>{item.status}</span></td>
              <td className="t-right">
                {item.status === 'Imported' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending({ kind: 'rollback', batch: item })}>Roll back</button>}
                {item.status === 'Rejected' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => errorReport(item)}>Error report</button>}
                {item.status === 'Rolled back' && <span className="small muted">—</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {editing && <Modal title={editing === 'new' ? 'Add Record' : `Edit Record — ${editing.station}, ${fmtDate(editing.date)}`} submitLabel="Save Changes" onClose={() => setEditing(null)} onSubmit={event => save(new FormData(event.currentTarget))}>
      <div className="modal-body">
        <div className="field"><label className="label" htmlFor="e-date">Sample date</label><input id="e-date" name="date" type="date" className="input sm" required defaultValue={editing === 'new' ? new Date().toISOString().slice(0, 10) : editing.date}/></div>
        <div className="field"><label className="label" htmlFor="e-station">Station</label>
          <select id="e-station" name="station" className="input sm" defaultValue={editing === 'new' ? codes[0] : editing.station}>{codes.map(code => <option key={code}>{code}</option>)}</select></div>
        {FIELDS.map(([k, label, step]) => <div className="field" key={k}><label className="label" htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} name={k} type="number" step={step} min="0" max={k === 'ph' ? 14 : undefined} className="input sm" defaultValue={editing === 'new' ? '' : editing[k] ?? ''}/></div>)}
        <div className="field span-2"><label className="label" htmlFor="e-note">Reason for change</label><input id="e-note" name="note" type="text" className="input sm" placeholder="e.g. Corrected typo from lab sheet"/><span className="hint">Saved to the audit log. WQI is recalculated automatically.</span></div>
      </div>
    </Modal>}

    {pending && <Modal width={440} danger title={pending.kind === 'rollback' ? 'Roll back this import?' : pending.ids.length > 1 ? `Delete ${pending.ids.length} records?` : 'Delete this record?'} submitLabel={pending.kind === 'rollback' ? 'Roll back' : 'Delete'} onClose={() => setPending(null)} onSubmit={confirm}>
      <div style={{ padding: '18px 22px' }} className="small text-2">
        {pending.kind === 'rollback'
          ? `All records imported from ${pending.batch.file} will be removed. You can re-import the file later.`
          : 'Deleted samples are removed from WQI calculations, charts and reports. This action is recorded in the audit log.'}
      </div>
    </Modal>}
    {toast.element}
  </main>;
}
