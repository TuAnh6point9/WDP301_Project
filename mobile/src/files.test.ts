import { describe, expect, it } from 'vitest';
import { fileProblem } from './predict';

describe('workbook check before upload (same as the web button)', () => {
  it('accepts an .xlsx file up to 5 MB, any letter case', () => {
    expect(fileProblem('ket-qua.XLSX', 5 * 1024 * 1024)).toBeNull();
  });
  it('rejects other extensions, look-alike names and files over 5 MB', () => {
    expect(fileProblem('data.xls', 10)).toBe('Please choose an .xlsx file up to 5 MB.');
    expect(fileProblem('dataxlsx', 10)).toBe('Please choose an .xlsx file up to 5 MB.');
    expect(fileProblem('big.xlsx', 5 * 1024 * 1024 + 1)).toBe('Please choose an .xlsx file up to 5 MB.');
  });
});
