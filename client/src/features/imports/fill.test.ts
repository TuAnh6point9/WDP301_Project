import { describe, expect, it } from 'vitest';
import { applyStation, fileStation, fillsFor, initialRanges, nextRange, rangeError, unassignedRuns, unfinishedRows, type FillRange, type MissingRow } from './fill';

const blank = (rowNumber: number, extra: Partial<MissingRow> = {}): MissingRow => ({ rowNumber, code: '', station: '', ...extra });
const rows = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => blank(from + index));
const range = (first: number, last: number, code: string, station = '', locked = false): FillRange => ({ first, last, code, station, locked });
const spans = (ranges: FillRange[]) => ranges.map(item => [item.first, item.last, item.code, item.locked]);

describe('initialRanges', () => {
  it('assigns nothing when the file says nothing', () => {
    expect(initialRanges(rows(2, 10))).toEqual([]);
  });

  it('takes a code written beside a row as the start of a batch, up to the next code', () => {
    const file = [...rows(2, 3), blank(4, { label: 'D9-2018' }), ...rows(5, 6), blank(7, { label: 'D1-2019' }), blank(8)];
    expect(spans(initialRanges(file))).toEqual([[4, 6, 'D9-2018', false], [7, 8, 'D1-2019', false]]);
  });

  it('keeps every row of a long batch together, however many rows it has', () => {
    const file = [blank(2, { label: 'D1-2027' }), ...rows(3, 16), blank(17, { label: 'D2-2027' })];
    expect(spans(initialRanges(file))).toEqual([[2, 16, 'D1-2027', false], [17, 17, 'D2-2027', false]]);
  });

  it('stops a batch at a row that is not missing anything', () => {
    expect(spans(initialRanges([blank(2, { label: 'D9-2018' }), blank(3), blank(5)]))).toEqual([[2, 3, 'D9-2018', false]]);
  });

  it('locks a code from the file\'s own column and joins the empty cells below it', () => {
    const file = [blank(2, { code: 'D01-2026' }), blank(3, { code: 'D01-2026' }), blank(4), blank(5, { code: 'D02-2026' })];
    expect(spans(initialRanges(file))).toEqual([[2, 4, 'D01-2026', true], [5, 5, 'D02-2026', true]]);
  });

  it('leaves the station empty: only the admin knows it', () => {
    expect(initialRanges([blank(2, { label: 'D9-2018' })])[0].station).toBe('');
  });
});

describe('unassignedRuns', () => {
  it('lists the rows still without a batch code as runs', () => {
    const missing = [...rows(2, 10), ...rows(20, 21)];
    expect(unassignedRuns(missing, [])).toEqual([[2, 10], [20, 21]]);
    expect(unassignedRuns(missing, [range(2, 4, 'D1-2026')])).toEqual([[5, 10], [20, 21]]);
    expect(unassignedRuns(missing, [range(2, 10, 'D1-2026'), range(20, 21, 'D2-2026')])).toEqual([]);
  });
});

describe('nextRange', () => {
  it('suggests the next unassigned rows, no further than the end of the run', () => {
    expect(nextRange(rows(2, 30), [range(2, 10, 'D1-2026')], 9)).toEqual({ first: '11', last: '19' });
    expect(nextRange(rows(2, 12), [range(2, 10, 'D1-2026')], 9)).toEqual({ first: '11', last: '12' });
    expect(nextRange(rows(2, 3), [range(2, 3, 'D1-2026')], 9)).toEqual({ first: '', last: '' });
  });
});

describe('rangeError', () => {
  const missing = rows(2, 30), ranges = [range(2, 10, 'D1-2026'), range(11, 19, 'D2-2026')];
  const check = (first: string, last: string, code: string, except?: number) => rangeError({ first, last, code }, missing, ranges, except)?.key ?? null;

  it('accepts a free range with a new code', () => {
    expect(check('20', '28', 'd3-2026')).toBeNull();
  });

  it('explains what is wrong with the rows', () => {
    expect(check('', '28', 'D3-2026')).toBe('imports.fillRangeNumbers');
    expect(check('2x', '28', 'D3-2026')).toBe('imports.fillRangeNumbers');
    expect(check('28', '20', 'D3-2026')).toBe('imports.fillRangeOrder');
    expect(check('40', '50', 'D3-2026')).toBe('imports.fillRangeEmpty');
    expect(check('19', '25', 'D3-2026')).toBe('imports.fillRangeOverlap');
    expect(rangeError({ first: '19', last: '25', code: 'D3-2026' }, missing, ranges)?.rows).toBe('11–19');
  });

  it('explains what is wrong with the code', () => {
    expect(check('20', '28', ' ')).toBe('imports.fillCodeRequired');
    expect(check('20', '28', 'Đ 1')).toBe('imports.fillCodeInvalid');
    expect(check('20', '28', 'd1-2026')).toBe('imports.fillCodeUsed');
  });

  it('lets a range be edited over itself and keep its code', () => {
    expect(check('2', '12', 'D1-2026', 2)).toBe('imports.fillRangeOverlap');
    expect(check('3', '10', 'D1-2026', 2)).toBeNull();
  });
});

describe('fileStation', () => {
  it('is the station the file already gives this batch', () => {
    const missing = [blank(2), blank(3, { station: 'AH2' }), blank(4)];
    expect(fileStation(range(2, 4, 'D1-2026'), missing)).toBe('AH2');
    expect(fileStation(range(2, 2, 'D1-2026'), missing)).toBe('');
  });
});

describe('fillsFor', () => {
  it('gives every row of a batch the same code and the one station chosen for the batch', () => {
    expect(fillsFor(rows(2, 6), [range(2, 4, 'd9-2018', 'AH7')])).toEqual([[2, 'D9-2018', 'AH7'], [3, 'D9-2018', 'AH7'], [4, 'D9-2018', 'AH7']]);
  });

  it('sends the code alone until a station is chosen', () => {
    expect(fillsFor(rows(2, 3), [range(2, 3, 'D1-2026')])).toEqual([[2, 'D1-2026', ''], [3, 'D1-2026', '']]);
  });

  it('fills the empty cells of a batch with the station the file gives it elsewhere', () => {
    expect(fillsFor([blank(2, { station: 'AH2' }), blank(3)], [range(2, 3, 'D1-2026')])).toEqual([[2, 'D1-2026', 'AH2'], [3, 'D1-2026', 'AH2']]);
  });
});

describe('unfinishedRows', () => {
  it('counts rows without a batch code and batches without a station', () => {
    const missing = [...rows(2, 7), blank(8, { station: 'AH3' })];
    const ranges = [range(2, 3, 'D1-2026', 'AH1'), range(4, 5, 'D2-2026'), range(8, 8, 'D3-2026')];
    expect(unfinishedRows(missing, ranges)).toEqual({ noCode: 2, noStation: 1 });
  });
});

describe('applyStation', () => {
  it('gives the station to batches without one and leaves the others alone', () => {
    const missing = [...rows(2, 7), blank(8, { station: 'AH3' })];
    const ranges = [range(2, 3, 'D1-2026', 'AH1'), range(4, 5, 'D2-2026'), range(6, 7, 'D3-2026'), range(8, 8, 'D4-2026')];
    expect(applyStation(ranges, missing, 'AH5').map(item => item.station)).toEqual(['AH1', 'AH5', 'AH5', '']);
  });
});
