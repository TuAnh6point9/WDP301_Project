import ExcelJS from 'exceljs';
import { USER_MESSAGES as M, batchCodePattern, rawColumns, parseDecimal, predictionParametersSchema, validationIssueMessage, type RawValues, type ImportValues, type PredictionParameters } from '@wqi/contracts';
import { inspectArchive } from '../imports/import.service.js';
import { AppError } from '../../utils/app-error.js';

const featureColumns = { coliform: 'Coliforms', nh4: 'Amoni', ph: 'PH', po4: 'Phosphat', do: 'DO', cod: 'COD' } as const;
const optionalColumns = new Set(['Mã đợt', 'Mã trạm', 'Temp', 'BOD5', 'Ghi chú', 'WQI']);
const headerKey = (text: string) => text.trim().normalize('NFC').toLowerCase();
export type WorkbookRow = { rowNumber: number; values: RawValues & Partial<ImportValues>; parameters?: PredictionParameters; issues: string[]; label?: string };

/** A column with no name that holds only batch codes, as in files that write the code beside the first row of each batch. */
function batchLabelColumn(sheet: ExcelJS.Worksheet) {
  for (let index = 1; index <= sheet.columnCount; index += 1) {
    if (sheet.getRow(1).getCell(index).text.trim()) continue;
    const texts: string[] = [];
    sheet.getColumn(index).eachCell((cell, rowNumber) => { if (rowNumber > 1 && cell.text.trim()) texts.push(cell.text.trim().toUpperCase()); });
    if (texts.length && texts.every(text => /^[A-Z]/.test(text) && batchCodePattern.test(text))) return index;
  }
  return null;
}

function sourceValue(cell: ExcelJS.Cell): number | string | null {
  const value = cell.value;
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (cell.type === ExcelJS.ValueType.Formula) return `=${cell.formula ?? '[shared formula]'}`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'richText' in value) return value.richText.map(part => part.text).join('');
  return cell.text;
}

/** WQI calculation files use the eight raw columns; the admin import passes its own column list. Non-optional columns are required. */
export async function parsePredictionWorkbook(buffer: Buffer, columns: readonly string[] = rawColumns): Promise<WorkbookRow[]> {
  const invalid = () => columns === rawColumns
    ? new AppError(400, 'INVALID_WORKBOOK', 'The file needs one sheet with all six columns PH, COD, DO, Amoni, Phosphat, Coliforms; data column names must be unique. Temp and BOD5 are optional.')
    : new AppError(400, 'INVALID_IMPORT_WORKBOOK', M.INVALID_IMPORT_WORKBOOK);
  if (buffer.length > 5 * 1024 * 1024) throw new AppError(400, 'FILE_TOO_LARGE', 'Files can be up to 5 MB.');
  await inspectArchive(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]); }
  catch { throw invalid(); }
  if (book.worksheets.length !== 1) throw invalid();
  const sheet = book.worksheets[0];
  const headers = sheet.getRow(1);
  const positions = columns.map(name => {
    const matches: number[] = [];
    headers.eachCell((cell, index) => { if (headerKey(cell.text) === headerKey(name)) matches.push(index); });
    if (matches.length > 1 || (!matches.length && !optionalColumns.has(name))) throw invalid();
    return matches[0];
  });
  const labelColumn = columns === rawColumns ? null : batchLabelColumn(sheet);
  const rows: WorkbookRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(columns.map((name, index) => [name, positions[index] ? sourceValue(row.getCell(positions[index])) : null])) as WorkbookRow['values'];
    if (Object.values(values).every(value => value === null || value === '')) return;
    if (rows.length >= 10000 || rowNumber > 1048576) throw new AppError(400, 'ROW_LIMIT', 'Files can have up to 10,000 data rows.');
    // Formula cells hold "=…" in values, so parseDecimal rejects them like any other text.
    const candidate = Object.fromEntries(Object.entries(featureColumns).map(([key, column]) => [key, parseDecimal(values[column])]));
    const parsed = predictionParametersSchema.safeParse(candidate);
    const label = labelColumn ? row.getCell(labelColumn).text.trim().toUpperCase() : '';
    rows.push({ rowNumber, values, ...(label ? { label } : {}), ...(parsed.success ? { parameters: parsed.data } : {}),
      issues: parsed.success ? [] : parsed.error.issues.map(issue => `${featureColumns[issue.path[0] as keyof typeof featureColumns]}: ${validationIssueMessage(issue)}`) });
  });
  if (!rows.length) throw new AppError(400, 'EMPTY_WORKBOOK', 'The file has no data rows.');
  return rows;
}
