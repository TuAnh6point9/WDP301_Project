import { errorText } from '@/i18n/messages';
import { displayText, type TranslationKey } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage as failed, inputFlag, parameterDisplayKeys, parameterLabels, rawColumns, rawParameterColumns } from '@wqi/contracts';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Modal, useToast } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import { DateRangeFields, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { FlagCell, flagHint, flagLabel } from '@/features/predictions/flags';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import type { Calculation } from '@/features/predictions/types';
import { ApiError } from '@/lib/http';
import { getRecordDetail, listAdminRecords, reviewRecord } from '../api';
import type { AdminRecord, ReviewStatus } from '../types';

const STATUS: Record<AdminRecord['validationStatus'], [string, string]> = { pending: ['warn', 'Pending review'], verified: ['ok', 'Verified'], rejected: ['off', 'Rejected'] };
const TABS: [string, TranslationKey][] = [['pending', 'records.pendingReview'], ['verified', 'records.verified'], ['rejected', 'records.rejected'], ['', 'records.allStatuses']];
const COLUMNS = 11;
// Excel imports have no sampling date; their batch code stands in for it (decision 24, changed 29/10).
const measured = (r: Pick<AdminRecord, 'measuredAt' | 'batchCode'>) => r.measuredAt ? formatDateTime(r.measuredAt) : r.batchCode ? msg('records.batchLabel', { code: r.batchCode }) : '—';
const nameOf = (r: Pick<AdminRecord, 'stationId' | 'measuredAt' | 'batchCode'>) => `${r.stationId?.code ?? msg('common.record')} · ${measured(r)}`;

// Records come from Excel imports by batch code; manual add/edit, delete and WQI recalculation are not offered.
export function AdminDataPage() {
  useLocale();
  const toast = useToast();
  // The status tab lives in the URL (?status=verified); `status=` means all.
  const [params, setParams] = useSearchParams();
  const asked = params.get('status');
  const status = TABS.some(([value]) => value === asked) ? asked! : 'pending';
  const [range, setRange] = useState({ from: '', to: '', page: 1 });
  const filters = { ...range, status };
  const setFilters = (next: typeof filters) => setRange({ from: next.from, to: next.to, page: next.page });
  // Replace, not push: Back still returns to the page the admin came from. A leftover ?station= is ignored.
  function view(status: string) {
    const query = new URLSearchParams(params);
    query.set('status', status);
    setParams(query, { replace: true });
    setRange(previous => ({ ...previous, page: 1 }));
  }
  const records = useAsync(() => listAdminRecords({ status, createdFrom: range.from, createdTo: range.to, page: range.page }), [range.from, range.to, status, range.page], { keepPrevious: true });
  useFirstLoadReadiness(records.loading, records.error);
  const [opened, setOpened] = useState<AdminRecord | null>(null);
  const rows = records.data?.data ?? [];
  const total = records.data?.meta.total;
  const body = useRef<HTMLTableSectionElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRow = useRef<number | null>(null);

  // The reviewed row leaves the list: keyboard users continue from the row that took its place.
  useEffect(() => {
    if (focusRow.current === null || records.loading) return;
    const buttons = body.current?.querySelectorAll<HTMLElement>('td:last-child button');
    (buttons?.[focusRow.current] ?? buttons?.[buttons.length - 1] ?? heading.current)?.focus();
    focusRow.current = null;
  }, [records.loading, records.data]);

  async function decide(status: ReviewStatus, note: string) {
    if (!opened) return;
    try {
      await reviewRecord(opened._id, { status, note, version: opened.version });
      toast.show({ key: status === 'verified' ? 'records.approvedToast' : 'records.rejectedToast', params: { name: nameOf(opened) } });
    } catch (error) {
      toast.show(failed(error, M.SAVE_RECORD));
      if (!(error instanceof ApiError && error.code === 'RECORD_CHANGED')) return;
    }
    focusRow.current = rows.findIndex(row => row._id === opened._id);
    setOpened(null);
    records.reload();
  }

  const empty = () => {
    if (filters.from || filters.to) return <div className="empty-state"><p>{msg('records.noneInRange')}</p><button type="button" className="btn btn-secondary" onClick={() => setFilters({ ...filters, from: '', to: '', page: 1 })}>{msg('records.showAllDays')}</button></div>;
    if (filters.status === 'pending') return <div className="empty-state"><span className="empty-state-ic"><Icon name="check"/></span><p className="empty-state-title">{msg('records.allDone')}</p><Link to="/admin/import" className="btn btn-primary"><Icon name="upload"/>{msg('records.importNew')}</Link></div>;
    return <div className="empty-state"><p>{msg('records.noneInStatus')}</p></div>;
  };

  return <main className="admin-body">
    <div className="page-head">
      <div className="stack-4">
        <h1 className="h1">{msg('records.title')}</h1>
        <p className="sub">{msg('records.description')}</p>
      </div>
      <div className="page-actions">
        <Link to="/admin/import" className="btn btn-secondary"><Icon name="upload"/>{msg('admin.importExcelAction')}</Link>
      </div>
    </div>

    <section className="card card-flush" aria-labelledby="rec-title">
      <div className="card-head">
        <h2 className="count-title" id="rec-title" ref={heading} tabIndex={-1}>{total === undefined ? msg('common.records') : msg(filters.status === 'pending' ? 'records.remaining' : 'records.total', { count: total })}</h2>
        <span className="small text-2">{msg('records.flagHint')}</span>
      </div>
      <div className="table-filters">
        <div className="tabs" role="group" aria-label={msg('common.status')}>
          {TABS.map(([value, label]) => <button key={value} type="button" className={filters.status === value ? 'on' : undefined} aria-pressed={filters.status === value} onClick={() => view(value)}>{msg(label)}</button>)}
        </div>
        <DateRangeFields label={msg('records.importedOn')} value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
      </div>
      <div className="table-wrap" aria-busy={records.loading}>
        <table className="table">
          <thead><tr><th>{msg('common.station')}</th><th>{msg('records.batchColumn')}</th>{parameterDisplayKeys.map(key => <th key={key}>{parameterLabels[key]}</th>)}<th>WQI</th><th>{msg('common.status')}</th><th className="col-action">{msg('common.action')}</th></tr></thead>
          <tbody ref={body}>
            {records.loading && !records.data && <tr className="empty-row"><td colSpan={COLUMNS}><LoadingIndicator scope="inline"/></td></tr>}
            {records.error && <tr className="empty-row"><td colSpan={COLUMNS} role="alert">{errorText(records.error, M.LOAD_FAILED)}</td></tr>}
            {records.data && !rows.length && <tr className="empty-row"><td colSpan={COLUMNS}>{empty()}</td></tr>}
            {rows.map(r => <tr key={r._id}>
              <td className="strong">{r.stationId?.code ?? '—'}</td>
              <td>{r.measuredAt ? formatDateTime(r.measuredAt) : r.batchCode ? r.batchRow == null ? r.batchCode : msg('records.batchCell', { code: r.batchCode, row: r.batchRow }) : '—'}</td>
              {parameterDisplayKeys.map(key => <FlagCell key={key} name={key} value={r.parameters[key]}>{r.parameters[key]}</FlagCell>)}
              <td className="strong">{r.wqi ?? '—'}</td>
              <td><span className={`status ${STATUS[r.validationStatus][0]}`}>{displayText(STATUS[r.validationStatus][1])}</span></td>
              <td className="col-action">{r.validationStatus === 'pending'
                ? <button type="button" className="btn btn-primary btn-sm row-action" aria-label={msg('records.reviewLabel', { name: nameOf(r) })} onClick={() => setOpened(r)}>{msg('records.review')}</button>
                : <button type="button" className="btn btn-secondary btn-sm row-action" aria-label={msg('records.detailsLabel', { name: nameOf(r) })} onClick={() => setOpened(r)}>{msg('common.details')}</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={records.data?.meta} noun="records" onPage={page => setFilters({ ...filters, page })}/>
    </section>

    {opened && <RecordDialog key={opened._id} record={opened} onClose={() => setOpened(null)} onDecide={decide}/>}
    {toast.element}
  </main>;
}

const show = (value: unknown) => value === null || value === undefined || value === '' ? <span className="muted">{msg('common.empty')}</span> : String(value);
const who = (person: { name: string; email: string } | null, at?: string | null) => person ? `${person.name} (${person.email})${at ? ` · ${formatDateTime(at)}` : ''}` : '—';

/** Everything needed to decide on one measurement, in one place. Reviewed records open read-only. */
function RecordDialog({ record, onClose, onDecide }: { record: AdminRecord; onClose: () => void; onDecide: (status: ReviewStatus, note: string) => Promise<void> }) {
  useLocale();
  const detail = useAsync(() => getRecordDetail(record._id), [record._id]);
  const r = detail.data;
  const raw = r?.source.rowId;
  const pending = record.validationStatus === 'pending';
  const [note, setNote] = useState('');
  const [needsReason, setNeedsReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const noteField = useRef<HTMLTextAreaElement>(null);

  async function decide(status: ReviewStatus) {
    if (saving) return;
    if (status === 'rejected' && note.trim().length < 3) { setNeedsReason(true); noteField.current?.focus(); return; }
    setSaving(true);
    await onDecide(status, note.trim());
    setSaving(false);
  }
  const reject = <button type="button" className="btn btn-danger-outline" disabled={!r || saving} onClick={() => void decide('rejected')}>{msg('records.reject')}</button>;

  return <Modal width={680} title={msg(pending ? 'records.reviewTitle' : 'records.recordTitle', { name: nameOf(record) })} {...(pending && r ? { submitLabel: msg('records.approve'), cancelLabel: msg('common.close'), extraAction: reject, onSubmit: () => void decide('verified') } : {})} onClose={onClose}>
    <div className="modal-body stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {detail.loading && <LoadingIndicator scope="inline"/>}
      {detail.error && <p role="alert">{errorText(detail.error, M.LOAD_FAILED)}</p>}
      {r && <>
        <div className="tiles" role="group" aria-label={msg('records.values')}>{parameterDisplayKeys.map(key => {
          const flag = inputFlag(key, r.parameters[key]);
          // The lab wrote "<x": the stored number is the detection limit itself.
          const below = String(raw?.values[rawParameterColumns[key]] ?? '').trim().startsWith('<');
          return <div className={flag ? `tile ${flag === 'likely-typo' ? 'is-danger' : 'is-warn'}` : 'tile'} key={key} title={flag ? flagHint(flag) : undefined}>
            <span className="tile-label">{parameterLabels[key]}</span><span className="tile-value">{r.parameters[key]}</span>
            {flag && <span className="tile-flag">{flagLabel(flag)}</span>}
            {below && <span className="tile-note">{msg('flags.belowDetection')}</span>}
          </div>;
        })}</div>
        <div className="list-row">
          <b>WQI</b>
          {r.wqi === null
            ? <span className="small text-2">{msg(pending ? 'records.wqiLater' : 'records.notCalculated')}</span>
            : <span className="row" style={{ gap: 8 }}><b>{r.wqi}</b>{r.qualityClass && <ClassificationBadge value={r.qualityClass as Calculation['qualityClass']}/>}</span>}
        </div>
        <p className="small text-2">{msg('common.source')}: {r.source.kind === 'excel' ? msg('records.sourceRow', { file: raw?.batchId?.fileName ?? '—', row: raw?.rowNumber ?? '—' }) : msg('history.manual')}</p>
        {!pending && <div>
          <div className="list-row"><span className="small">{msg('common.status')}</span><span className={`status ${STATUS[r.validationStatus][0]}`}>{displayText(STATUS[r.validationStatus][1])}</span></div>
          <div className="list-row"><span className="small">{msg('records.reviewed')}</span><span className="small">{who(r.reviewedBy, r.reviewedAt)}</span></div>
          {r.reviewNote && <div className="list-row"><span className="small">{msg('records.reviewNote')}</span><span className="small">{r.reviewNote}</span></div>}
        </div>}
        {pending && <div className="field">
          <label className="label" htmlFor="r-note">{msg('records.reviewNote')}</label>
          <textarea id="r-note" ref={noteField} className={needsReason ? 'input is-error' : 'input'} rows={2} maxLength={1000} autoFocus aria-describedby="r-note-hint" placeholder={msg('records.reviewPlaceholder')} value={note} onChange={event => { setNote(event.target.value); setNeedsReason(false); }}/>
          {needsReason ? <span id="r-note-hint" className="hint is-error" role="alert">{msg('records.reasonRequired')}</span> : <span id="r-note-hint" className="hint">{msg('records.noteHint')}</span>}
        </div>}
        <details className="result-technical">
          <summary>{msg('common.moreDetails')}</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <div>
              <div className="list-row"><span className="small">{msg('common.station')}</span><span className="small">{r.stationId ? `${r.stationId.code} · ${r.stationId.name}` : '—'}</span></div>
              <div className="list-row"><span className="small">{msg('records.batchColumn')}</span><span className="small">{measured(r)}</span></div>
              <div className="list-row"><span className="small">{msg('records.unitBasis')}</span><span className="small">{displayText(r.unitBasis)}</span></div>
              <div className="list-row"><span className="small">{msg('common.created')}</span><span className="small">{who(r.createdBy, r.createdAt)}</span></div>
              {r.source.note && <div className="list-row"><span className="small">{msg('imports.sourceNote')}</span><span className="small">{r.source.note}</span></div>}
            </div>
            {raw && <div className="table-wrap"><table className="table compact">
              <caption className="small text-2" style={{ textAlign: 'left' }}>{msg('records.rawRow')}</caption>
              <thead><tr>{rawColumns.map(name => <th key={name}>{name}</th>)}</tr></thead>
              <tbody><tr>{rawColumns.map(name => <td key={name}>{show(raw.values[name])}</td>)}</tr></tbody>
            </table></div>}
          </div>
        </details>
      </>}
    </div>
  </Modal>;
}
