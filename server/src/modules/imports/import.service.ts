import { USER_MESSAGES as M, PREDICTION_UNIT_BASIS, batchCodePattern, batchStationMessage, importColumns, maxLengthMessage } from '@wqi/contracts';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { basename } from 'node:path';
import { Types } from 'mongoose';
import { parsePredictionWorkbook, type WorkbookRow } from '../prediction-batches/workbook.js';
import { ImportBatch, ImportedRow } from './import.model.js';
import { WaterRecord } from '../water-records/water-record.model.js';
import { calculateRecordWqi } from '../water-records/water-record.service.js';
import { Station } from '../stations/station.model.js';
import { AppError } from '../../utils/app-error.js';

const failFile = () => new AppError(400, 'INVALID_WORKBOOK', M.INVALID_WORKBOOK);
// Legacy file batches (no batch code) stay in the database but are never listed (decision 24).
const coded = { code: { $type: 'string' } };
export async function listBatches(page: number, limit: number, filter: Record<string, unknown> = {}) {
  const query = { ...filter, ...coded };
  const [data, total] = await Promise.all([
    ImportBatch.find(query).select('-contentHash').populate('uploadedBy', 'name email').sort({ code: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportBatch.countDocuments(query),
  ]);
  return { data, total };
}
export async function listBatchRows(batchId: string, page: number, limit: number) {
  const batch = await ImportBatch.findOne({ _id: batchId, ...coded }).select('-contentHash').lean();
  if (!batch) throw new AppError(404, 'NOT_FOUND', M.NOT_FOUND);
  const [rows, total] = await Promise.all([
    ImportedRow.find({ batchId }).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImportedRow.countDocuments({ batchId }),
  ]);
  return { batch, rows, total };
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

const text = (value: unknown) => value == null ? '' : String(value).trim();
type Row = WorkbookRow & { code: string; station: string; stationId?: Types.ObjectId; note: string };
/** Codes the admin typed for rows whose cells are empty, by row number. */
export type ImportFills = Map<number, { code: string; station: string }>;
/** Groups rows by batch code and checks them against active stations and the records already in each batch. Writes nothing. */
async function analyze(buffer: Buffer, fills: ImportFills) {
  const rows = await parsePredictionWorkbook(buffer, importColumns);
  const active = new Map((await Station.find({ isActive: true }).select('code').lean()).map(station => [station.code, station._id]));
  const stations = [...active.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const missing = rows.filter(row => !text(row.values['Mã đợt']) || !text(row.values['Mã trạm'])).map(row => ({
    rowNumber: row.rowNumber, code: text(row.values['Mã đợt']).toUpperCase(), station: text(row.values['Mã trạm']).toUpperCase(), ...(row.label ? { label: row.label } : {}),
  }));
  const rejected: { rowNumber: number; reason: string }[] = [];
  const groups = new Map<string, Row[]>();
  for (const source of rows) {
    // A fill only reaches an empty cell: what the file says always wins.
    const fill = fills.get(source.rowNumber);
    const row = { ...source, values: { ...source.values, 'Mã đợt': text(source.values['Mã đợt']) ? source.values['Mã đợt'] : fill?.code || null, 'Mã trạm': text(source.values['Mã trạm']) ? source.values['Mã trạm'] : fill?.station || null } };
    const code = text(row.values['Mã đợt']).toUpperCase();
    if (!batchCodePattern.test(code)) { rejected.push({ rowNumber: row.rowNumber, reason: code ? M.BATCH_CODE_INVALID : M.BATCH_CODE_REQUIRED }); continue; }
    const station = text(row.values['Mã trạm']).toUpperCase(), note = text(row.values['Ghi chú']);
    const group = groups.get(code) ?? [];
    groups.set(code, group);
    // A batch belongs to one station, whatever number of rows it holds.
    const earlier = station ? group.find(other => other.station) : undefined;
    const issues = [...row.issues,
      ...(active.has(station) ? [] : [`Mã trạm: ${station ? M.STATION_UNKNOWN : M.STATION_REQUIRED}`]),
      ...(earlier && earlier.station !== station ? [`Mã trạm: ${batchStationMessage(earlier.station, earlier.rowNumber)}`] : []),
      ...(note.length > 2000 ? [`Ghi chú: ${maxLengthMessage(2000)}`] : [])];
    group.push({ ...row, code, station, stationId: active.get(station), note, issues });
  }
  const codes = [...groups.keys()];
  const [batches, records] = await Promise.all([
    ImportBatch.find({ code: { $in: codes } }).populate<{ uploadedBy: { name: string } | null }>('uploadedBy', 'name').lean(),
    WaterRecord.find({ batchCode: { $in: codes } }).select('batchCode').lean(),
  ]);
  const summaries = codes.map(code => {
    const group = groups.get(code)!, valid = group.filter(row => !row.issues.length);
    const batch = batches.find(item => item.code === code);
    return {
      code, rowCount: group.length, stations: [...new Set(group.map(row => row.station).filter(Boolean))], issueCount: group.length - valid.length,
      validCount: valid.length, replaces: records.filter(record => record.batchCode === code).length,
      existing: batch ? { createdAt: batch.createdAt, uploadedBy: batch.uploadedBy && { name: batch.uploadedBy.name }, rowCount: batch.rowCount } : null,
    };
  });
  // The admin chooses, per existing batch, to overwrite it; commit recomputes these keys and compares.
  const confirm = summaries.filter(batch => batch.existing && batch.validCount).flatMap(confirmKeys);
  return { rows, groups, rejected, summaries, confirm, missing, stations };
}
const confirmKeys = (batch: { code: string; replaces: number }) => [batch.code, `${batch.code}|${batch.replaces}`];

export async function previewWorkbook(buffer: Buffer, fills: ImportFills = new Map()) {
  const { rows, groups, rejected, summaries, confirm, missing, stations } = await analyze(buffer, fills);
  const flagged = [...groups.values()].flat().filter(row => row.issues.length).sort((a, b) => a.rowNumber - b.rowNumber);
  return { rowCount: rows.length, batches: summaries, confirm, rejected, missing, stations, rows: flagged.map(({ rowNumber, values, issues }) => ({ rowNumber, values, issues })) };
}

/** Re-checks the file from scratch, then saves each valid row as a pending record of its batch. An existing batch the admin did not choose to overwrite is skipped. */
export async function commitWorkbook(buffer: Buffer, fileName: string, userId: string, confirmed: string[], fills: ImportFills = new Map()) {
  const { groups, rejected, summaries } = await analyze(buffer, fills);
  // A batch that changed since the admin looked at it no longer matches the keys, so it is skipped rather than overwritten unseen.
  const skips = (batch: typeof summaries[number]) => Boolean(batch.existing) && !confirmKeys(batch).every(key => confirmed.includes(key));
  if (summaries.every(batch => batch.issueCount === batch.rowCount || skips(batch))) throw new AppError(400, 'NO_ROWS_TO_IMPORT', M.NO_ROWS_TO_IMPORT);
  const source = basename(fileName.replaceAll('\\', '/')).slice(0, 255);
  const batches: { code: string; created: boolean; added: number; overwritten: number; issueCount: number; skipped?: number }[] = [];
  const savedIds: Types.ObjectId[] = [];
  for (const summary of summaries) {
    const { code, issueCount } = summary, valid = groups.get(code)!.filter(row => !row.issues.length);
    if (!valid.length) { batches.push({ code, created: false, added: 0, overwritten: 0, issueCount }); continue; }
    if (skips(summary)) { batches.push({ code, created: false, added: 0, overwritten: 0, issueCount, skipped: valid.length }); continue; }
    const upserted = await ImportBatch.findOneAndUpdate({ code }, { $setOnInsert: { fileName: source, rowCount: 0, issueCount: 0, status: 'ready', uploadedBy: userId } }, { upsert: true, new: true, includeResultMetadata: true });
    const batchId = upserted.value!._id, overwrite = Boolean(summary.existing);
    const rowIds = valid.map(() => new Types.ObjectId());
    // The unique {batchCode, batchRow} index makes these upserts safe against a concurrent commit of the same rows.
    const written = await WaterRecord.bulkWrite(valid.map((row, index) => {
      // New values: an overwritten record loses its review and WQI and waits for review again.
      const fields = { stationId: row.stationId, parameters: row.parameters!, validationStatus: 'pending' as const, wqi: null, qualityClass: null, wqiSource: null, reviewedBy: null, reviewedAt: null, reviewNote: null,
        source: { kind: 'excel' as const, rowId: rowIds[index], note: row.note || `${source} · ${code} · dòng ${row.rowNumber}` } };
      const inserted = { measuredAt: null, unitBasis: PREDICTION_UNIT_BASIS, createdBy: new Types.ObjectId(userId) };
      return { updateOne: { filter: { batchCode: code, batchRow: row.rowNumber }, upsert: true,
        update: overwrite ? { $set: fields, $setOnInsert: inserted, $inc: { version: 1 } } : { $setOnInsert: { ...fields, ...inserted, version: 1 } } } };
    }), { ordered: false });
    // A row is saved when a record now points at its new raw-row id; a concurrent commit may have saved the others first.
    const saved = await WaterRecord.find({ 'source.rowId': { $in: rowIds } }).select('source.rowId').lean();
    savedIds.push(...saved.map(record => record._id));
    const recordOf = new Map(saved.map(record => [String(record.source?.rowId), record._id]));
    await ImportedRow.deleteMany({ waterRecordId: { $in: saved.map(record => record._id) }, _id: { $nin: rowIds } });
    await ImportedRow.insertMany(valid.flatMap((row, index) => {
      const waterRecordId = recordOf.get(String(rowIds[index]));
      return waterRecordId ? [{ _id: rowIds[index], batchId, fileName: source, rowNumber: row.rowNumber, values: row.values, waterRecordId }] : [];
    }));
    // Overwriting replaces the whole batch: the old rows the new file does not have go too. This comes last, so a failure above loses nothing.
    if (overwrite) {
      const stale = await WaterRecord.find({ batchCode: code, _id: { $nin: saved.map(record => record._id) } }).select('_id').lean();
      await ImportedRow.deleteMany({ waterRecordId: { $in: stale.map(record => record._id) } });
      await WaterRecord.deleteMany({ _id: { $in: stale.map(record => record._id) } });
    }
    await ImportBatch.updateOne({ _id: batchId }, { $set: { rowCount: await WaterRecord.countDocuments({ batchCode: code }) } });
    batches.push({ code, created: !upserted.lastErrorObject?.updatedExisting, added: written.upsertedCount, overwritten: saved.length - written.upsertedCount, issueCount });
  }
  return { batches, rejected, wqi: await calculateRecordWqi(savedIds) };
}

// Two rows of one batch at one station, and another batch; the second row uses decimal commas.
const templateRows = [
  ['D01-2026', 'AH1', 7.2, 5.6, 18, 0.25, 0.12, 4600, 27.5, null, 'Phiếu 00826'],
  ['D01-2026', 'AH1', '6,9', '5,2', 21, '0,31', '0,1', 2400, null, 6, null],
  ['D02-2026', 'AH2', 7.5, 6.1, 15, 0.18, 0.09, 1500, 28, 5, null],
];
export async function templateWorkbook() {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Data');
  sheet.columns = importColumns.map(header => ({ header, width: header === 'Ghi chú' ? 24 : 12 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(templateRows);
  return Buffer.from(await book.xlsx.writeBuffer());
}
