import { USER_MESSAGES as M, fileSizeMessage, rowLimitMessage, formulaCellMessage, invalidCellMessage, importNumberIssue, importRangeIssue } from '@wqi/contracts';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { rawColumns, type RawValues, normalizeSchema } from '@wqi/contracts';
import { ImportBatch, ImportedRow } from './import.model.js';
import { WaterRecord } from '../water-records/water-record.model.js';
import { deriveWqi } from '../water-records/water-record.service.js';
import { requireStation } from '../stations/station.service.js';
import { AppError } from '../../utils/app-error.js';
import type { z } from 'zod';

const failFile = () => new AppError(400, 'INVALID_WORKBOOK', M.INVALID_WORKBOOK);
export async function listBatches(page: number, limit: number) {
  const [data, total] = await Promise.all([
    ImportBatch.find().select('-contentHash').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportBatch.countDocuments(),
  ]);
  return { data, total };
}
export async function listBatchRows(batchId: string, page: number, limit: number) {
  const batch = await ImportBatch.findById(batchId).select('-contentHash').lean();
  if (!batch) throw new AppError(404, 'NOT_FOUND', M.NOT_FOUND);
  const [rows, total] = await Promise.all([
    ImportedRow.find({ batchId }).sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportedRow.countDocuments({ batchId }),
  ]);
  return { batch, rows, total };
}
export async function previewWorkbook(buffer: Buffer) {
  const result = await parseWorkbook(buffer);
  return {
    rows: result.rows.slice(0, 20), rowCount: result.rows.length, issueCount: result.issueCount,
    missingMetadata: ['stationId', 'measuredAt', 'tss', 'coordinates', 'units'],
    duplicate: Boolean(await ImportBatch.exists({ contentHash: result.contentHash, status: 'ready' })),
  };
}
export async function inspectArchive(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(failFile());
      let bytes = 0;
      let entries = 0;
      zip.on('error', () => reject(failFile()));
      zip.on('entry', (entry: yauzl.Entry) => {
        bytes += entry.uncompressedSize;
        entries += 1;
        if (bytes > 50 * 1024 * 1024 || entries > 200 || /vbaProject\.bin$/i.test(entry.fileName)) {
          zip.close();
          reject(new AppError(400, 'WORKBOOK_LIMIT', M.WORKBOOK_LIMIT));
        } else zip.readEntry();
      });
      zip.on('end', resolve);
      zip.readEntry();
    });
  });
}
export async function parseWorkbook(buffer: Buffer) {
  if (buffer.length > 5 * 1024 * 1024) throw new AppError(400, 'FILE_TOO_LARGE', fileSizeMessage(5));
  await inspectArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); }
  catch { throw failFile(); }
  if (workbook.worksheets.length !== 1) throw failFile();
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > 10001) throw new AppError(400, 'ROW_LIMIT', rowLimitMessage(10000));
  const header = sheet.getRow(1);
  if (rawColumns.some((name, index) => header.getCell(index + 1).value !== name)) throw failFile();
  const rows: { rowNumber: number; values: RawValues; issues: string[] }[] = [];
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, column) => {
      if (column > 8 && cell.value !== null) throw failFile();
      if (cell.type === ExcelJS.ValueType.Formula) throw new AppError(400, 'FORMULA_NOT_ALLOWED', formulaCellMessage(cell.address));
    });
    if (rowNumber === 1) return;
    const values = {} as RawValues;
    const issues: string[] = [];
    rawColumns.forEach((name, index) => {
      const cell = row.getCell(index + 1);
      const value = cell.value;
      if (value !== null && typeof value !== 'number' && typeof value !== 'string') throw new AppError(400, 'UNSUPPORTED_CELL', invalidCellMessage(cell.address));
      values[name] = value;
      if (typeof value !== 'number' || !Number.isFinite(value)) issues.push(importNumberIssue(name));
      else if (value < 0 || (name === 'PH' && value > 14)) issues.push(importRangeIssue(name));
    });
    rows.push({ rowNumber, values, issues });
  });
  if (!rows.length) throw new AppError(400, 'EMPTY_WORKBOOK', M.EMPTY_WORKBOOK);
  return { rows, contentHash: createHash('sha256').update(buffer).digest('hex'), issueCount: rows.filter(row => row.issues.length).length };
}
export async function commitWorkbook(buffer: Buffer, fileName: string, userId: string) {
  const parsed = await parseWorkbook(buffer);
  const leaseToken = randomUUID();
  const leaseExpiry = () => new Date(Date.now() + 5 * 60 * 1000);
  let batch = await ImportBatch.findOne({ contentHash: parsed.contentHash }).select('+leaseExpiresAt');
  if (batch?.status === 'ready') return { batch, duplicate: true };
  if (batch?.status === 'importing' && batch.leaseExpiresAt && batch.leaseExpiresAt > new Date()) throw new AppError(409, 'IMPORT_IN_PROGRESS', M.IMPORT_IN_PROGRESS);
  if (batch) {
    batch = await ImportBatch.findOneAndUpdate({ _id: batch._id, $or: [
      { status: 'failed' },
      { status: 'importing', leaseExpiresAt: { $lte: new Date() } },
      { status: 'importing', leaseExpiresAt: { $exists: false } },
    ] }, { $set: { status: 'importing', uploadedBy: userId, leaseToken, leaseExpiresAt: leaseExpiry() } }, { new: true });
    if (!batch) throw new AppError(409, 'IMPORT_IN_PROGRESS', M.IMPORT_IN_PROGRESS);
  } else {
    try {
      batch = await ImportBatch.create({ fileName: basename(fileName).slice(0, 255), contentHash: parsed.contentHash, rowCount: parsed.rows.length, issueCount: parsed.issueCount, status: 'importing', uploadedBy: userId, leaseToken, leaseExpiresAt: leaseExpiry() });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new AppError(409, 'IMPORT_IN_PROGRESS', M.IMPORT_IN_PROGRESS);
      throw error;
    }
  }
  try {
    // A renewable lease permits retry after interruption; row upserts preserve original values.
    for (let start = 0; start < parsed.rows.length; start += 250) {
      const lease = await ImportBatch.updateOne({ _id: batch._id, status: 'importing', leaseToken }, { $set: { leaseExpiresAt: leaseExpiry() } });
      if (!lease.matchedCount) throw new AppError(409, 'IMPORT_IN_PROGRESS', M.IMPORT_IN_PROGRESS);
      await ImportedRow.bulkWrite(parsed.rows.slice(start, start + 250).map(row => ({ updateOne: {
        filter: { batchId: batch._id, rowNumber: row.rowNumber }, update: { $setOnInsert: { ...row, batchId: batch._id } }, upsert: true,
      } })));
    }
    const completed = await ImportBatch.findOneAndUpdate({ _id: batch._id, status: 'importing', leaseToken }, { $set: { status: 'ready' }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }, { new: true });
    if (!completed) throw new AppError(409, 'IMPORT_IN_PROGRESS', M.IMPORT_IN_PROGRESS);
    return { batch: completed, duplicate: false };
  } catch (error) {
    await ImportBatch.updateOne({ _id: batch._id, leaseToken }, { $set: { status: 'failed' }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } }).catch(() => undefined);
    throw error;
  }
}
export async function normalizeRow(batchId: string, rowId: string, input: z.infer<typeof normalizeSchema>, userId: string) {
  const batch = await ImportBatch.findOne({ _id: batchId, status: 'ready' });
  const row = batch && await ImportedRow.findOne({ _id: rowId, batchId });
  if (!row) throw new AppError(404, 'ROW_NOT_FOUND', M.NOT_FOUND);
  const existing = await WaterRecord.findOne({ 'source.rowId': row._id });
  if (existing) {
    await ImportedRow.updateOne({ _id: row._id }, { $set: { waterRecordId: existing._id } });
    throw new AppError(409, 'ROW_ALREADY_NORMALIZED', M.ROW_NORMALIZED);
  }
  await requireStation(input.stationId, true);
  const { sourceNote, ...fields } = input;
  const record = await WaterRecord.create({ ...fields, ...await deriveWqi(fields.parameters), source: { kind: 'excel', rowId: row._id, note: sourceNote }, createdBy: userId });
  await ImportedRow.updateOne({ _id: row._id }, { $set: { waterRecordId: record._id } });
  return record;
}
