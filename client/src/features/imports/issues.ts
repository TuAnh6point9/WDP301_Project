import { batchStationMessage } from '@wqi/contracts';
import type { ImportPreview } from './types';

export type IssueRow = { rowNumber: number; issues: string[]; values?: ImportPreview['rows'][number]['values'] };
export type IssueGroup = { key: string; rows: IssueRow[] };

/** A batch with two stations: each message names another station, yet it is one kind of problem. */
export const MIXED_STATIONS = 'mixed-stations';
const mixedStart = `Mã trạm: ${batchStationMessage('', 0).split(' ').slice(0, 4).join(' ')}`;
const SAMPLE_SIZE = 3;

/** One group per kind of problem, rows without a usable batch code first. A row with two problems is in both groups. */
export function issueGroups(preview: Pick<ImportPreview, 'rejected' | 'rows'>): IssueGroup[] {
  const groups = new Map<string, IssueRow[]>();
  const add = (key: string, row: IssueRow) => groups.set(key, [...(groups.get(key) ?? []), row]);
  for (const { rowNumber, reason } of preview.rejected) add(reason, { rowNumber, issues: [reason] });
  for (const row of preview.rows) for (const issue of row.issues) add(issue.startsWith(mixedStart) ? MIXED_STATIONS : issue, row);
  return [...groups].map(([key, rows]) => ({ key, rows }));
}

export const sampleRows = (rows: { rowNumber: number }[]) => rows.slice(0, SAMPLE_SIZE).map(row => row.rowNumber).join(', ');
