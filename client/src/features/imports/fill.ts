import { batchCodePattern } from '@wqi/contracts';
import type { TranslationKey } from '@/i18n';
import type { ImportFill, MissingRow } from './types';

export type { MissingRow };
/** The consecutive rows of one batch, which all belong to one station. `locked` means the file's own column holds the code. */
export type FillRange = { first: number; last: number; code: string; station: string; locked: boolean };
export type RangeForm = { first: string; last: string; code: string };

const inRange = (range: FillRange, rowNumber: number) => rowNumber >= range.first && rowNumber <= range.last;
const rangeOf = (ranges: FillRange[], rowNumber: number) => ranges.find(range => inRange(range, rowNumber));
export const spanOf = ({ first, last }: { first: number; last: number }) => first === last ? String(first) : `${first}–${last}`;
/** The station the file already gives this batch; the server flags a row that says otherwise. */
export const fileStation = (range: FillRange, missing: MissingRow[]) => missing.find(row => inRange(range, row.rowNumber) && row.station)?.station ?? '';

/** What the file already says: a code starts a batch that lasts until the next code or the next row that is not missing anything. */
export function initialRanges(missing: MissingRow[]): FillRange[] {
  const ranges: FillRange[] = [];
  let open = false;
  for (const row of missing) {
    const mark = row.code || row.label || '', current = ranges.at(-1);
    const follows = open && current && row.rowNumber === current.last + 1;
    if (mark && !(follows && mark === current.code)) {
      ranges.push({ first: row.rowNumber, last: row.rowNumber, code: mark, station: '', locked: Boolean(row.code) });
      open = true;
    } else if (follows) {
      current.last = row.rowNumber;
    } else {
      open = false;
    }
  }
  return ranges;
}

export function unassignedRuns(missing: MissingRow[], ranges: FillRange[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const { rowNumber } of missing) {
    if (rangeOf(ranges, rowNumber)) continue;
    const run = runs.at(-1);
    if (run && run[1] === rowNumber - 1) run[1] = rowNumber;
    else runs.push([rowNumber, rowNumber]);
  }
  return runs;
}

/** A starting point for the From and To boxes; the admin can change both. */
export function nextRange(missing: MissingRow[], ranges: FillRange[], size: number) {
  const run = unassignedRuns(missing, ranges)[0];
  return run ? { first: String(run[0]), last: String(Math.min(run[0] + size - 1, run[1])) } : { first: '', last: '' };
}

/** `except` is the first row of the range being edited, which may overlap itself and keep its code. */
export function rangeError(form: RangeForm, missing: MissingRow[], ranges: FillRange[], except?: number): { key: TranslationKey; rows?: string } | null {
  if (!/^\d+$/.test(form.first.trim()) || !/^\d+$/.test(form.last.trim())) return { key: 'imports.fillRangeNumbers' };
  const first = Number(form.first), last = Number(form.last), others = ranges.filter(range => range.first !== except);
  if (first > last) return { key: 'imports.fillRangeOrder' };
  if (!missing.some(row => row.rowNumber >= first && row.rowNumber <= last)) return { key: 'imports.fillRangeEmpty' };
  const clash = others.find(range => first <= range.last && last >= range.first);
  if (clash) return { key: 'imports.fillRangeOverlap', rows: spanOf(clash) };
  const code = form.code.trim().toUpperCase();
  if (!code) return { key: 'imports.fillCodeRequired' };
  if (!batchCodePattern.test(code)) return { key: 'imports.fillCodeInvalid' };
  const used = others.find(range => range.code === code);
  return used ? { key: 'imports.fillCodeUsed', rows: spanOf(used) } : null;
}

/** Every row of a batch gets its code and its one station. The server only uses a fill where the file's cell is empty. */
export const fillsFor = (missing: MissingRow[], ranges: FillRange[]): ImportFill[] => missing.flatMap((row): ImportFill[] => {
  const range = rangeOf(ranges, row.rowNumber);
  return range ? [[row.rowNumber, range.code.toUpperCase(), fileStation(range, missing) || range.station]] : [];
});

export function unfinishedRows(missing: MissingRow[], ranges: FillRange[]) {
  return {
    noCode: missing.filter(row => !rangeOf(ranges, row.rowNumber)).length,
    noStation: ranges.filter(range => !range.station && !fileStation(range, missing)).length,
  };
}

/** Runs only when the admin asks: gives one station to the batches still without one, never over a choice already made. */
export const applyStation = (ranges: FillRange[], missing: MissingRow[], station: string) =>
  ranges.map(range => range.station || fileStation(range, missing) ? range : { ...range, station });
