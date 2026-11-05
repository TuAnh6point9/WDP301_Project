import { msg, useLocale } from '@/i18n';
import { useState, type KeyboardEvent } from 'react';
import { Modal } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import { clientPage, PAGE_SIZE } from '@/lib/paging';
import { applyStation, fileStation, fillsFor, initialRanges, nextRange, rangeError, spanOf, unassignedRuns, unfinishedRows, type FillRange, type RangeForm } from '../fill';
import type { ImportFill, ImportPreview } from '../types';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

export type FillDraft = { ranges: FillRange[] };
const MAX_RUNS_SHOWN = 4;
const lengthOf = (range?: FillRange) => range ? range.last - range.first + 1 : 1;

/** The admin gives a batch code to a range of rows, then one station to that batch. Rows left unfinished are rejected by the check that follows. */
export function FillCodesDialog({ preview, draft, onClose, onApply, guideBusy = false }: {
  preview: Pick<ImportPreview, 'missing' | 'stations'>; draft: FillDraft | null; guideBusy?: boolean;
  onClose: () => void; onApply: (draft: FillDraft, fills: ImportFill[]) => void;
}) {
  useLocale();
  const { missing, stations } = preview;
  const [ranges, setRanges] = useState<FillRange[]>(() => draft?.ranges ?? initialRanges(missing));
  // The next suggested range is as long as the last batch, starting from the first one the file gives.
  const [size, setSize] = useState(() => lengthOf(ranges[0]));
  const [form, setForm] = useState<RangeForm>(() => ({ ...nextRange(missing, ranges, size), code: '' }));
  const [editing, setEditing] = useState<number | null>(null);
  const [problem, setProblem] = useState<ReturnType<typeof rangeError>>(null);
  const [bulkStation, setBulkStation] = useState('');
  const [page, setPage] = useState(1);

  const shown = clientPage(ranges, page);
  const { noCode, noStation } = unfinishedRows(missing, ranges);
  const runs = unassignedRuns(missing, ranges);

  /** Checks the boxes and returns the ranges they lead to; a mistake is shown and nothing changes. */
  function withForm() {
    const error = rangeError(form, missing, ranges, editing ?? undefined);
    setProblem(error);
    if (error) return null;
    const added: FillRange = { first: Number(form.first), last: Number(form.last), code: form.code.trim().toUpperCase(), station: ranges.find(range => range.first === editing)?.station ?? '', locked: false };
    return { next: ranges.filter(range => range.first !== editing).concat(added).sort((a, b) => a.first - b.first), added };
  }
  function resetForm(next: FillRange[], length = size) {
    setEditing(null); setProblem(null);
    setForm({ ...nextRange(missing, next, length), code: '' });
  }
  function assign() {
    const result = withForm();
    if (!result) return;
    setRanges(result.next); setSize(lengthOf(result.added));
    setPage(Math.ceil((result.next.indexOf(result.added) + 1) / PAGE_SIZE));
    resetForm(result.next, lengthOf(result.added));
  }
  function edit(range: FillRange) {
    setEditing(range.first); setProblem(null);
    setForm({ first: String(range.first), last: String(range.last), code: range.code });
  }
  function remove(range: FillRange) {
    const next = ranges.filter(item => item !== range);
    setRanges(next);
    resetForm(next);
  }
  function submit() {
    // What is still typed in the boxes counts, so pressing Check straight away does not lose it.
    const next = form.code.trim() ? withForm()?.next : ranges;
    if (next) onApply({ ranges: next }, fillsFor(missing, next));
  }
  const enterAssigns = (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); assign(); } };
  const setStation = (range: FillRange, station: string) => setRanges(ranges.map(item => item === range ? { ...item, station } : item));

  return <Modal width={760} title={msg('imports.fillTitle')} submitLabel={msg('imports.fillApply')} onClose={onClose} onSubmit={submit}
    footerTourTarget="excel-admin-fill-apply" extraAction={<FeatureGuide id="excel-admin" stage="fill" busy={guideBusy}/>}>
    <div className="modal-body is-scroll">
      <p className="small span-2" role="status">
        {msg('imports.fillAssigned', { batches: ranges.length })}
        <span className={noCode ? 'c-warn strong' : undefined}>{' · '}{msg('imports.fillNoCode', { rows: noCode })}</span>
        <span className={noStation ? 'c-warn strong' : undefined}>{' · '}{msg('imports.fillNoStation', { batches: noStation })}</span>
      </p>
      <p className="small text-2 span-2">{msg('imports.fillIntro')}</p>

      {(runs.length > 0 || editing !== null) && <div className="span-2 stack-4">
        <div className="fill-form" data-tour="excel-admin-fill-range">
          <div className="field"><label className="label" htmlFor="fill-from">{msg('imports.fillFrom')}</label><input id="fill-from" className="input sm" inputMode="numeric" value={form.first} onKeyDown={enterAssigns} onChange={event => setForm({ ...form, first: event.target.value })}/></div>
          <div className="field"><label className="label" htmlFor="fill-to">{msg('imports.fillTo')}</label><input id="fill-to" className="input sm" inputMode="numeric" value={form.last} onKeyDown={enterAssigns} onChange={event => setForm({ ...form, last: event.target.value })}/></div>
          <div className="field"><label className="label" htmlFor="fill-code">{msg('imports.batchCode')}</label><input id="fill-code" className={problem?.key.startsWith('imports.fillCode') ? 'input sm is-error' : 'input sm'} maxLength={40} placeholder={msg('imports.fillCodeHint')} value={form.code} onKeyDown={enterAssigns} onChange={event => setForm({ ...form, code: event.target.value })}/></div>
          <button type="button" className="btn btn-primary" onClick={assign}>{msg(editing === null ? 'imports.fillAssign' : 'imports.fillUpdate')}</button>
          {editing !== null && <button type="button" className="btn btn-ghost" onClick={() => resetForm(ranges)}>{msg('common.cancel')}</button>}
        </div>
        {problem && <p className="small c-danger" role="alert">{msg(problem.key, { rows: problem.rows ?? '' })}</p>}
        {runs.length > 0 && <p className="xs text-2">{msg('imports.fillUnassigned', { rows: runs.slice(0, MAX_RUNS_SHOWN).map(([first, last]) => spanOf({ first, last })).join(', ') + (runs.length > MAX_RUNS_SHOWN ? ', …' : '') })}</p>}
      </div>}

      {noStation > 1 && <div className="fill-bulk span-2">
        <label className="small" htmlFor="fill-bulk">{msg('imports.fillBulk', { batches: noStation })}</label>
        <select id="fill-bulk" className="input sm" aria-label={msg('imports.fillBulkLabel')} value={bulkStation} onChange={event => setBulkStation(event.target.value)}>
          <option value="">{msg('imports.fillChoose')}</option>
          {stations.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
        <button type="button" className="btn btn-secondary" disabled={!bulkStation} onClick={() => { setRanges(applyStation(ranges, missing, bulkStation)); setBulkStation(''); }}>{msg('imports.fillBulkApply', { batches: noStation })}</button>
      </div>}

      <div className="card card-flush span-2" data-tour="excel-admin-fill-station" style={{ boxShadow: 'none' }}>
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>{msg('common.row')}</th><th>{msg('imports.batchCode')}</th><th>{msg('imports.fillStations')}</th><th className="col-action">{msg('common.action')}</th></tr></thead>
            <tbody>
              {!ranges.length && <tr className="empty-row"><td colSpan={4}>{msg('imports.fillEmptyList')}</td></tr>}
              {shown.rows.map(range => {
                const given = fileStation(range, missing);
                return <tr key={range.first}>
                  <td>{spanOf(range)}</td>
                  <td><b>{range.code}</b></td>
                  {given ? <td><b>{given}</b></td> : <td><select className="input sm" aria-label={msg('imports.fillStationOf', { code: range.code })} value={range.station} onChange={event => setStation(range, event.target.value)}>
                    <option value="">{msg('imports.fillChoose')}</option>
                    {stations.map(code => <option key={code} value={code}>{code}</option>)}
                  </select></td>}
                  <td className="col-action">{!range.locked && <div className="fill-actions">
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={msg('imports.fillEditLabel', { code: range.code })} onClick={() => edit(range)}>{msg('imports.fillEdit')}</button>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={msg('imports.fillRemoveLabel', { code: range.code })} onClick={() => remove(range)}>{msg('imports.fillRemove')}</button>
                  </div>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <Pager meta={shown.meta} noun="batches" onPage={setPage}/>
      </div>
    </div>
  </Modal>;
}
