import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parsePredictionWorkbook } from '../src/modules/prediction-batches/workbook.js';

const columns = ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD', 'Temp', 'BOD5'];
async function file(rows: unknown[][], headers = columns) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Samples');
  sheet.addRow(headers);
  rows.forEach(row => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}
describe('prediction workbook', () => {
  it('accepts the six model columns alone, with either or both optional columns', async () => {
    for (const optional of [[], ['Temp'], ['BOD5'], ['Temp', 'BOD5']]) {
      const rows = await parsePredictionWorkbook(await file([[5000, 0.2, 7.2, 0.3, 5.7, 25]], [...columns.slice(0, 6), ...optional]));
      expect(rows[0].parameters).toEqual({ coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 });
      expect(rows[0].values).toEqual({ PH: 7.2, Temp: null, BOD5: null, COD: 25, DO: 5.7, Amoni: 0.2, Phosphat: 0.3, Coliforms: 5000 });
      expect(rows[0].issues).toEqual([]);
    }
  });
  it('maps reordered model columns amid extra columns without requiring optional measurements', async () => {
    const rows = await parsePredictionWorkbook(await file(
      [['Station A', 25, 5000, 7.2, 5.7, 0.2, 0.3, 'notes', null]],
      ['Station', 'COD', 'Coliforms', 'PH', 'DO', 'Amoni', 'Phosphat', 'Notes', 'Temp'],
    ));
    expect(rows[0].parameters).toEqual({ coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 });
    expect(rows[0].values.Temp).toBeNull();
    expect(rows[0].values.BOD5).toBeNull();
  });
  it('rejects each missing model header and duplicate recognized headers', async () => {
    for (const required of columns.slice(0, 6)) {
      await expect(parsePredictionWorkbook(await file([[1, 1, 1, 1, 1]], columns.filter(name => name !== required)))).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
    }
    for (const duplicate of ['PH', 'Temp']) {
      await expect(parsePredictionWorkbook(await file([[1]], [...columns, duplicate]))).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
    }
  });
  it('maps by header, preserves source row numbers and does not validate unused columns', async () => {
    const parsed = await parsePredictionWorkbook(await file([
      [5000, 0.2, 7.2, 0.3, 5.7, 25, 'not measured', null], [],
      [100, 1, 8, 2, 20, 100000, null, -1],
    ]));
    expect(parsed.map(row => row.rowNumber)).toEqual([2, 4]);
    expect(parsed[0].parameters).toEqual({ coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 });
    expect(parsed.map(row => row.issues)).toEqual([[], []]);
    expect(parsed[0].values.Temp).toBe('not measured');
  });
  it('reports text, formula, missing, negative and invalid pH per row without coercion', async () => {
    const parsed = await parsePredictionWorkbook(await file([
      [100, 1, '7,2', 1, 5, 20], [100, 1, 7, 1, { formula: '2+3', result: 5 }, 20],
      [100, 1, 15, 1, 5, 20], [100, -1, 7, 1, 5, 20], [100, 1, 7, null, 5, 20],
    ]));
    expect(parsed.every(row => row.issues.length > 0 && !row.parameters)).toBe(true);
    expect(parsed[0].values.PH).toBe('7,2');
    expect(parsed[1].values.DO).toBe('=2+3');
  });
  it('rejects duplicate/missing headers, extra sheets, empty and oversized workbooks', async () => {
    await expect(parsePredictionWorkbook(await file([[1]], [...columns.slice(0, 7), 'PH']))).rejects.toThrow();
    await expect(parsePredictionWorkbook(await file([], columns))).rejects.toThrow();
    await expect(parsePredictionWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow();
    const book = new ExcelJS.Workbook(); book.addWorksheet('a'); book.addWorksheet('b');
    await expect(parsePredictionWorkbook(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow();
  });
  it('accepts 10,000 data rows and rejects one more', async () => {
    const rows = Array.from({ length: 10000 }, () => [100, 1, 7, 1, 5, 20, 25, 3]);
    expect(await parsePredictionWorkbook(await file(rows))).toHaveLength(10000);
    await expect(parsePredictionWorkbook(await file([...rows, rows[0]]))).rejects.toThrow();
  });
  it('ignores blank gaps and trailing formatting without counting them as samples', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Samples');
    sheet.addRow(columns); sheet.addRow([100, 1, 7, 1, 5, 20, 25, 3]);
    sheet.getRow(10005).values = [100, 1, 8, 1, 5, 20, 25, 3];
    sheet.getRow(10010).getCell(1).numFmt = '0.00';
    const rows = await parsePredictionWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
    expect(rows.map(row => row.rowNumber)).toEqual([2, 10005]);
  });
});
