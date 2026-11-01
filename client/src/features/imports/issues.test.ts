import { describe, expect, it } from 'vitest';
import { USER_MESSAGES, batchStationMessage } from '@wqi/contracts';
import { issueGroups, MIXED_STATIONS, sampleRows } from './issues';

describe('issueGroups', () => {
  it('puts rows with the same problem together, rows without a batch code first', () => {
    const groups = issueGroups({
      rejected: [{ rowNumber: 2, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }, { rowNumber: 3, reason: USER_MESSAGES.BATCH_CODE_REQUIRED }, { rowNumber: 4, reason: USER_MESSAGES.BATCH_CODE_INVALID }],
      rows: [
        { rowNumber: 5, values: {}, issues: [`Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}`] },
        { rowNumber: 6, values: {}, issues: [`Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}`, `PH: ${USER_MESSAGES.INVALID_NUMBER}`] },
      ] as never,
    });
    expect(groups.map(group => [group.key, group.rows.map(row => row.rowNumber)])).toEqual([
      [USER_MESSAGES.BATCH_CODE_REQUIRED, [2, 3]], [USER_MESSAGES.BATCH_CODE_INVALID, [4]],
      [`Mã trạm: ${USER_MESSAGES.STATION_REQUIRED}`, [5, 6]], [`PH: ${USER_MESSAGES.INVALID_NUMBER}`, [6]],
    ]);
  });

  it('treats a batch with two stations as one problem although each message names another station', () => {
    const groups = issueGroups({ rejected: [], rows: [
      { rowNumber: 5, values: {}, issues: [`Mã trạm: ${batchStationMessage('AH1', 2)}`] },
      { rowNumber: 6, values: {}, issues: [`Mã trạm: ${batchStationMessage('AH2', 3)}`] },
    ] as never });
    expect(groups.map(group => [group.key, group.rows.length])).toEqual([[MIXED_STATIONS, 2]]);
  });
});

describe('sampleRows', () => {
  it('shows the first three row numbers', () => {
    expect(sampleRows([{ rowNumber: 2 }, { rowNumber: 3 }, { rowNumber: 4 }, { rowNumber: 5 }])).toBe('2, 3, 4');
    expect(sampleRows([{ rowNumber: 9 }])).toBe('9');
  });
});
