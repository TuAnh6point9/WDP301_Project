import { messageText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { importColumns, type ImportColumn } from '@wqi/contracts';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Pager } from '@/components/Pager';
import { clientPage } from '@/lib/paging';
import { issueGroups, MIXED_STATIONS, sampleRows, type IssueGroup } from '../issues';
import type { BatchCheck, ImportPreview } from '../types';

const UNCHECKED = new Set<ImportColumn>(['Temp', 'BOD5', 'Ghi chú', 'WQI']);
/** The error table shows the checked columns; Temp, BOD5 and Ghi chú stay in the saved raw row. */
export const CHECKED = importColumns.filter(name => !UNCHECKED.has(name));
export const cell = (value: unknown) => value === null || value === undefined || value === '' ? <span className="muted">{msg('common.empty')}</span> : String(value);
export const SAMPLE_SIZE = 3;
const list = (items: string[]) => items.join(', ');
const issueTitle = (key: string) => key === MIXED_STATIONS ? msg('imports.issueMixedStations') : messageText(key);

/** A long list opened on request, ten at a time. */
export function PagedDialog<T>({ title, items, noun, width, onClose, children }: { title: string; items: T[]; noun: string; width: number; onClose: () => void; children: (rows: T[]) => ReactNode }) {
  useLocale();
  const [page, setPage] = useState(1);
  const shown = clientPage(items, page);
  return <Modal width={width} title={title} onClose={onClose}>
    <div className="modal-body is-scroll">
      <div className="card card-flush span-2" style={{ boxShadow: 'none' }}>
        {children(shown.rows)}
        <Pager meta={shown.meta} noun={noun} onPage={setPage}/>
      </div>
    </div>
  </Modal>;
}

function SummaryRow({ title, detail, what, warn = false, onOpen }: { title: string; detail: string; what: string; warn?: boolean; onOpen: () => void }) {
  return <div className="list-row">
    {warn && <span className="c-warn"><Icon name="warn"/></span>}
    <div className="stack-4 grow">
      <b>{title}</b>
      <span className="small text-2">{detail}</span>
    </div>
    <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('imports.viewAllOf', { what })} onClick={onOpen}>{msg('imports.viewAll')}</button>
  </div>;
}

function BatchLine({ batch }: { batch: BatchCheck }) {
  return <li className="list-row">
    <div className="stack-4 grow">
      <span className="batch-line"><b>{batch.code}</b>{msg('imports.batchLine', { rows: batch.rowCount, stations: list(batch.stations) || '—', issues: batch.issueCount })}</span>
      {batch.replaces > 0 && <span className="small c-warn strong">{msg('imports.willOverwrite', { count: batch.replaces })}</span>}
    </div>
    <span className={batch.existing ? 'badge b-poor' : 'badge b-good'}>{batch.existing ? msg('imports.codeExists') : msg('imports.newBatch')}</span>
  </li>;
}

/** Step 3 stays short: one line per kind of result with a few examples; the full lists open in a dialog. */
export function CheckSummary({ preview }: { preview: ImportPreview }) {
  useLocale();
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [group, setGroup] = useState<IssueGroup | null>(null);
  const groups = issueGroups(preview);
  const repeated = preview.batches.filter(batch => batch.existing).length;
  const columns = group?.rows.some(row => row.values) ? CHECKED : [];

  return <div>
    {preview.batches.length > 0 && <SummaryRow
      title={msg('imports.batchCount', { count: preview.batches.length })}
      detail={msg('imports.batchSample', { codes: list(preview.batches.slice(0, SAMPLE_SIZE).map(batch => batch.code)) }) + (repeated ? ` · ${msg('imports.batchRepeated', { count: repeated })}` : '')}
      what={msg('imports.batchesInFile')} onOpen={() => setBatchesOpen(true)}/>}
    {groups.map(item => <SummaryRow key={item.key} warn title={issueTitle(item.key)} detail={msg('imports.issueSample', { count: item.rows.length, rows: sampleRows(item.rows) })} what={issueTitle(item.key)} onOpen={() => setGroup(item)}/>)}
    {!groups.length && <p className="dash-clear"><Icon name="check"/>{msg('imports.noErrorRows')}</p>}

    {batchesOpen && <PagedDialog title={msg('imports.batchesInFile')} items={preview.batches} noun="batches" width={720} onClose={() => setBatchesOpen(false)}>
      {rows => <ul className="batch-list" aria-label={msg('imports.batchesInFile')}>{rows.map(batch => <BatchLine key={batch.code} batch={batch}/>)}</ul>}
    </PagedDialog>}
    {group && <PagedDialog title={issueTitle(group.key)} items={group.rows} noun="rows" width={columns.length ? 960 : 640} onClose={() => setGroup(null)}>
      {rows => <div className="table-wrap">
        <table className="table compact">
          <thead><tr><th>{msg('common.row')}</th><th>{msg('common.issues')}</th>{columns.map(name => <th key={name}>{name}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              <td className="c-danger cell-wrap">{row.issues.map(messageText).join(' · ')}</td>
              {columns.map(name => <td key={name}>{cell(row.values?.[name])}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>}
    </PagedDialog>}
  </div>;
}
