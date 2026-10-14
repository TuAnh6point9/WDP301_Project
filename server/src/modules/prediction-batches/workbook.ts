import ExcelJS from 'exceljs';
import { rawColumns, predictionParametersSchema, validationIssueMessage, type RawValues, type PredictionParameters } from '@wqi/contracts';
import { inspectArchive } from '../imports/import.service.js';
import { AppError } from '../../utils/app-error.js';

const featureColumns = { coliform: 'Coliforms', nh4: 'Amoni', ph: 'PH', po4: 'Phosphat', do: 'DO', cod: 'COD' } as const;
export type WorkbookRow = { rowNumber: number; values: RawValues; parameters?: PredictionParameters; issues: string[] };

function sourceValue(cell: ExcelJS.Cell): number | string | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (cell.type === ExcelJS.ValueType.Formula) return `=${cell.formula ?? '[shared formula]'}`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('');
  return cell.text;
}

export async function parsePredictionWorkbook(buffer: Buffer): Promise<WorkbookRow[]> {
  const invalid = () => new AppError(400, 'INVALID_WORKBOOK', 'File cần một sheet với đủ sáu cột PH, COD, DO, Amoni, Phosphat, Coliforms; tên cột dữ liệu không được trùng. Temp và BOD5 không bắt buộc.');
  if (buffer.length > 5 * 1024 * 1024) throw new AppError(400, 'FILE_TOO_LARGE', 'File tối đa 5 MB.');
  await inspectArchive(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]); }
  catch { throw invalid(); }
  if (book.worksheets.length !== 1) throw invalid();
  const sheet = book.worksheets[0];
  const headers = sheet.getRow(1);
  const positions = rawColumns.map(name => {
    const matches: number[] = [];
    headers.eachCell((cell, index) => { if (cell.value === name) matches.push(index); });
    if (matches.length > 1 || (!matches.length && name !== 'Temp' && name !== 'BOD5')) throw invalid();
    return matches[0];
  });
  const rows: WorkbookRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(rawColumns.map((name, index) => [name, positions[index] ? sourceValue(row.getCell(positions[index])) : null])) as RawValues;
    if (Object.values(values).every(value => value === null || value === '')) return;
    if (rows.length >= 10000 || rowNumber > 1048576) throw new AppError(400, 'ROW_LIMIT', 'File tối đa 10.000 dòng dữ liệu.');
    const candidate = Object.fromEntries(Object.entries(featureColumns).map(([key, column]) => {
      const cell = row.getCell(positions[rawColumns.indexOf(column)]);
      return [key, cell.type === ExcelJS.ValueType.Formula ? null : values[column]];
    }));
    const parsed = predictionParametersSchema.safeParse(candidate);
    rows.push({ rowNumber, values, ...(parsed.success ? { parameters: parsed.data } : {}),
      issues: parsed.success ? [] : parsed.error.issues.map(issue => `${featureColumns[issue.path[0] as keyof typeof featureColumns]}: ${validationIssueMessage(issue)}`) });
  });
  if (!rows.length) throw new AppError(400, 'EMPTY_WORKBOOK', 'File không có dòng dữ liệu.');
  return rows;
}
