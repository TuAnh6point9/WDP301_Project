import { errorText } from '@/i18n/messages';
import { displayText, qualityLabel } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { USER_MESSAGES as M, userErrorMessage as failed, parameterKeys, parameterLabels, rawColumns } from '@wqi/contracts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { Modal, useToast } from '@/components/Modal';
import { defaultRange } from '@/features/system/api';
import type { DateRange } from '@/features/system/types';
import { DateRangeFields, Pager, useFirstLoadReadiness } from '@/features/system/components/AdminControls';
import { ApiError } from '@/lib/http';
import { getRecordDetail, listAdminRecords, reviewRecord } from '../api';
import type { AdminRecord, ReviewStatus } from '../types';

const STATUS: Record<AdminRecord['validationStatus'], [string, string]> = { pending: ['warn', 'Pending review'], verified: ['ok', 'Verified'], rejected: ['off', 'Rejected'] };

// Records are created by normalizing imported rows; manual add/edit, delete and WQI recalculation are not offered.
export function AdminDataPage() {
  useLocale();
  const toast = useToast();
  const [filters, setFilters] = useState<DateRange & { status: string; page: number }>(() => ({ ...defaultRange(), status: 'pending', page: 1 }));
  const records = useAsync(() => listAdminRecords({ status: filters.status, createdFrom: filters.from, createdTo: filters.to, page: filters.page }), [filters.from, filters.to, filters.status, filters.page]);
  useFirstLoadReadiness(records.loading, records.error);
  const [reviewing, setReviewing] = useState<AdminRecord | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  async function review(form: FormData) {
    if (!reviewing) return;
    try {
      await reviewRecord(reviewing._id, { status: form.get('status') as ReviewStatus, note: String(form.get('note')).trim(), version: reviewing.version });
      toast.show('Review saved');
    } catch (error) {
      toast.show(failed(error, M.SAVE_RECORD));
      if (!(error instanceof ApiError && error.code === 'RECORD_CHANGED')) return;
    }
    setReviewing(null);
    records.reload();
  }

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
        <h2 className="h3" id="rec-title">{msg('common.records')}</h2>
        <span className="small muted">{msg('records.unitsNote')}</span>
      </div>
      <div className="toolbar" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center', gap: 10 }}>
        <select className="input sm" style={{ width: 'auto' }} aria-label={msg('common.status')} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value, page: 1 })}>
          <option value="">{msg('records.allStatuses')}</option><option value="pending">{msg('records.pendingReview')}</option><option value="verified">{msg('records.verified')}</option><option value="rejected">{msg('records.rejected')}</option>
        </select>
        <DateRangeFields value={filters} onChange={next => setFilters({ ...filters, ...next, page: 1 })}/>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{msg('common.station')}</th><th>{msg('records.measuredAt')}</th>{parameterKeys.map(key => <th key={key}>{parameterLabels[key]}</th>)}<th>{msg('common.status')}</th><th>{msg('common.created')}</th><th className="t-right">{msg('common.action')}</th></tr></thead>
          <tbody>
            {records.loading && <tr className="empty-row"><td colSpan={11}><LoadingIndicator scope="inline"/></td></tr>}
            {records.error && <tr className="empty-row"><td colSpan={11} role="alert">{errorText(records.error, M.LOAD_FAILED)}</td></tr>}
            {records.data && !records.data.data.length && <tr className="empty-row"><td colSpan={11}>{msg('records.noMatches')}</td></tr>}
            {records.data?.data.map(r => <tr key={r._id}>
              <td className="strong">{r.stationId?.code ?? '—'}</td>
              <td>{formatDateTime(r.measuredAt)}</td>
              {parameterKeys.map(key => <td key={key}>{r.parameters[key]}</td>)}
              <td><span className={`status ${STATUS[r.validationStatus][0]}`}>{displayText(STATUS[r.validationStatus][1])}</span></td>
              <td>{formatDateTime(r.createdAt)}</td>
              <td className="t-right"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <button type="button" className="btn btn-ghost btn-sm" aria-label={msg('records.detailsLabel', { station: r.stationId?.code ?? msg('common.record'), date: formatDateTime(r.measuredAt) })} onClick={() => setViewing(r._id)}>{msg('common.details')}</button>
                {r.validationStatus === 'pending' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReviewing(r)}>{msg('records.review')}</button>}
              </span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Pager meta={records.data?.meta} noun="records" onPage={page => setFilters({ ...filters, page })}/>
    </section>

    {reviewing && <Modal width={480} title={msg('records.reviewTitle', { station: reviewing.stationId?.code ?? msg('common.record'), date: formatDateTime(reviewing.measuredAt) })} submitLabel={msg('records.saveReview')} onClose={() => setReviewing(null)} onSubmit={event => review(new FormData(event.currentTarget))}>
      <div className="modal-body">
        <div className="field span-2"><label className="label" htmlFor="r-status">{msg('records.decision')}</label>
          <select id="r-status" name="status" className="input sm" defaultValue="verified"><option value="verified">{msg('records.publish')}</option><option value="rejected">{msg('records.rejected')}</option></select></div>
        <div className="field span-2"><label className="label" htmlFor="r-note">{msg('records.reviewNote')}</label><input id="r-note" name="note" className="input sm" required minLength={3} maxLength={1000} placeholder={msg('records.reviewPlaceholder')}/></div>
      </div>
    </Modal>}
    {viewing && <RecordDetail id={viewing} onClose={() => setViewing(null)}/>}
    {toast.element}
  </main>;
}

const show = (value: unknown) => value === null || value === undefined || value === '' ? <span className="muted">{msg('common.empty')}</span> : String(value);
const who = (person: { name: string; email: string } | null, at?: string | null) => person ? `${person.name} (${person.email})${at ? ` · ${formatDateTime(at)}` : ''}` : '—';

function RecordDetail({ id, onClose }: { id: string; onClose: () => void }) {
  useLocale();
  const detail = useAsync(() => getRecordDetail(id), [id]);
  const r = detail.data;
  const raw = r?.source.rowId;
  return <Modal width={720} title={r ? msg('records.recordTitle', { station: r.stationId?.code ?? '—', date: formatDateTime(r.measuredAt) }) : msg('records.details')} onClose={onClose}>
    <div className="modal-body stack" style={{ display: 'flex', flexDirection: 'column' }}>
      {detail.loading && <LoadingIndicator scope="inline"/>}
      {detail.error && <p role="alert">{errorText(detail.error, M.LOAD_FAILED)}</p>}
      {r && <>
        <p className="callout callout-neutral small">{msg('records.detailsHint')}</p>
        <section className="stack" aria-labelledby="d-values">
          <h3 className="h4" id="d-values">{msg('records.values')}</h3>
          <div className="tiles compact">{parameterKeys.map(key => <div className="tile" key={key}><span className="tile-label">{parameterLabels[key]}</span><span className="tile-value">{r.parameters[key]}</span></div>)}</div>
          <div className="list-row"><span className="small">WQI</span><span className="small">{r.wqi === null ? msg('records.notCalculated') : `${r.wqi} · ${r.qualityClass ? qualityLabel(r.qualityClass) : ''}${r.wqiSource ? ` (${r.wqiSource})` : ''}`}</span></div>
        </section>
        <section aria-labelledby="d-record">
          <h3 className="h4" id="d-record">{msg('common.record')}</h3>
          <div className="list-row"><span className="small">{msg('common.station')}</span><span className="small">{r.stationId ? `${r.stationId.code} · ${r.stationId.name}` : '—'}</span></div>
          <div className="list-row"><span className="small">{msg('records.measuredAt')}</span><span className="small">{formatDateTime(r.measuredAt)}</span></div>
          <div className="list-row"><span className="small">{msg('records.unitBasis')}</span><span className="small mono">{displayText(r.unitBasis)}</span></div>
          <div className="list-row"><span className="small">{msg('common.status')}</span><span className={`status ${STATUS[r.validationStatus][0]}`}>{displayText(STATUS[r.validationStatus][1])}</span></div>
          <div className="list-row"><span className="small">{msg('common.created')}</span><span className="small">{who(r.createdBy, r.createdAt)}</span></div>
          <div className="list-row"><span className="small">{msg('records.reviewed')}</span><span className="small">{who(r.reviewedBy, r.reviewedAt)}</span></div>
          {r.reviewNote && <div className="list-row"><span className="small">{msg('records.reviewNote')}</span><span className="small">{r.reviewNote}</span></div>}
        </section>
        <section aria-labelledby="d-source">
          <h3 className="h4" id="d-source">{msg('common.source')}</h3>
          <div className="list-row"><span className="small">{msg('common.origin')}</span><span className="small">{r.source.kind === 'excel' ? msg('records.sourceRow', { file: raw?.batchId?.fileName ?? '—', row: raw?.rowNumber ?? '—' }) : msg('history.manual')}</span></div>
          {r.source.note && <div className="list-row"><span className="small">{msg('imports.sourceNote')}</span><span className="small">{r.source.note}</span></div>}
          {raw && <div className="table-wrap"><table className="table compact">
            <caption className="xs muted" style={{ textAlign: 'left' }}>{msg('records.rawRow')}</caption>
            <thead><tr>{rawColumns.map(name => <th key={name}>{name}</th>)}</tr></thead>
            <tbody><tr>{rawColumns.map(name => <td key={name}>{show(raw.values[name])}</td>)}</tr></tbody>
          </table></div>}
        </section>
      </>}
    </div>
  </Modal>;
}
