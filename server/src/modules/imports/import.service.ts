import { USER_MESSAGES as M } from '@wqi/contracts';
import yauzl from 'yauzl';
import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { type RawValues, normalizeSchema, parametersSchema, parameterKeys, rawParameterColumns, PREDICTION_UNIT_BASIS } from '@wqi/contracts';
import { parsePredictionWorkbook } from '../prediction-batches/workbook.js';
import { ImportBatch, ImportedRow } from './import.model.js';
import { WaterRecord } from '../water-records/water-record.model.js';
import { requireStation } from '../stations/station.service.js';
import { AppError } from '../../utils/app-error.js';
import type { z } from 'zod';

const failFile = () => new AppError(400, 'INVALID_WORKBOOK', M.INVALID_WORKBOOK);
export async function listBatches(page: number, limit: number, filter: Record<string, unknown> = {}) {
  const [data, total] = await Promise.all([
    ImportBatch.find(filter).select('-contentHash').populate('uploadedBy', 'name email').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportBatch.countDocuments(filter),
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
    missingMetadata: ['stationId', 'measuredAt', 'coordinates', 'units'],
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
/** Same column rules as WQI prediction files: the six model columns by name, Temp/BOD5 optional (stored as null). */
export async function parseWorkbook(buffer: Buffer) {
  const rows = (await parsePredictionWorkbook(buffer)).map(({ rowNumber, values, issues }) => ({ rowNumber, values, issues }));
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
  const parameters = parametersSchema.safeParse(Object.fromEntries(parameterKeys.map(key => [key, (row.values as RawValues)[rawParameterColumns[key]]])));
  if (!parameters.success) throw new AppError(400, 'ROW_INVALID', M.ROW_INVALID);
  await requireStation(input.stationId, true);
  const record = await WaterRecord.create({ stationId: input.stationId, measuredAt: input.measuredAt, parameters: parameters.data, unitBasis: PREDICTION_UNIT_BASIS, source: { kind: 'excel', rowId: row._id, note: input.sourceNote }, createdBy: userId });
  await ImportedRow.updateOne({ _id: row._id }, { $set: { waterRecordId: record._id } });
  return record;
}
