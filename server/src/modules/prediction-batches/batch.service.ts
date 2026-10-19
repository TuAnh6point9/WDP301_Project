import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { PredictionStatus } from '@wqi/contracts';
import { PredictionBatch, PredictionBatchRow, type StoredBatchRow, type ModelSnapshot } from './batch.model.js';
import { parsePredictionWorkbook } from './workbook.js';
import { getAiStatus, predictWqiBatch } from '../../integrations/ai/ai.service.js';
import { AppError } from '../../utils/app-error.js';

export const completedStatuses = ['completed', 'completed_with_errors'];
// Older batches still store classificationVersion in modelSnapshot; it is no longer part of the API.
export const privateFields = '-leaseToken -leaseExpiresAt -active -__v -modelSnapshot.classificationVersion';
export async function ownedBatch(id: string, userId: string) {
  const batch = await PredictionBatch.findOne({ _id: id, userId, status: { $ne: 'uploading' } }).select(privateFields).lean();
  if (!batch) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đợt tính.');
  return batch;
}
export async function previewBatch(buffer: Buffer, fileName: string, userId: string) {
  const rows = await parsePredictionWorkbook(buffer);
  await Promise.all([PredictionBatch.createIndexes(), PredictionBatchRow.createIndexes()]);
  const invalidCount = rows.filter(row => row.issues.length).length;
  const batch = await PredictionBatch.create({ userId, fileName: basename(fileName.replaceAll('\\', '/')).slice(0, 255), status: 'uploading', rowCount: rows.length, validCount: rows.length - invalidCount, invalidCount, errorCount: invalidCount });
  try {
    await PredictionBatchRow.insertMany(rows.map(row => ({ ...row, batchId: batch._id, status: row.issues.length ? 'invalid' : 'pending' })));
    await PredictionBatch.updateOne({ _id: batch._id }, { $set: { status: 'preview' } });
  } catch (error) {
    await PredictionBatchRow.deleteMany({ batchId: batch._id });
    await PredictionBatch.deleteOne({ _id: batch._id });
    throw error;
  }
  return ownedBatch(batch._id.toString(), userId);
}
function verifiedModel(status: PredictionStatus): ModelSnapshot {
  if (!status.available || !status.artifactSha256 || !status.modelVersion) throw new AppError(503, status.reason ?? 'AI_UNAVAILABLE', 'AI chưa sẵn sàng. Kết quả đã lưu được giữ nguyên.');
  return status as ModelSnapshot;
}
function sameModel(expected: ModelSnapshot, actual: ModelSnapshot) {
  if (expected.artifactSha256 !== actual.artifactSha256 || expected.modelVersion !== actual.modelVersion) throw new AppError(409, 'AI_MODEL_CHANGED', 'Model đã thay đổi. Hãy tạo đợt tính mới.');
}
export async function startBatch(id: string, userId: string) {
  const batch = await ownedBatch(id, userId);
  if (['queued', 'running', ...completedStatuses].includes(batch.status)) return batch;
  if (!batch.validCount) throw new AppError(400, 'NO_VALID_ROWS', 'Không có dòng hợp lệ để tính.');
  const current = verifiedModel(await getAiStatus());
  if (batch.modelSnapshot) sameModel(batch.modelSnapshot as ModelSnapshot, current);
  try {
    await PredictionBatch.findOneAndUpdate({ _id: id, userId, status: { $in: ['preview', 'paused'] } },
      { $set: { status: 'queued', active: true, modelSnapshot: batch.modelSnapshot ?? current }, $unset: { pauseCode: 1, leaseToken: 1, leaseExpiresAt: 1 } });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new AppError(409, 'BATCH_ACTIVE', 'Bạn đang có một đợt chờ hoặc đang tính. Hãy chờ đợt đó kết thúc.');
    throw error;
  }
  return ownedBatch(id, userId);
}

export async function processNextBatchChunk() {
  const token = randomUUID();
  const batch = await PredictionBatch.findOneAndUpdate({ active: true, status: { $in: ['queued', 'running'] },
    $or: [{ leaseExpiresAt: { $lte: new Date() } }, { leaseExpiresAt: { $exists: false } }] },
    { $set: { status: 'running', leaseToken: token, leaseExpiresAt: new Date(Date.now() + 120000) } }, { new: true, sort: { createdAt: 1 } });
  if (!batch) return;
  const lock = { _id: batch._id, leaseToken: token, leaseExpiresAt: { $gt: new Date() } };
  try {
    const expected = batch.modelSnapshot as ModelSnapshot;
    sameModel(expected, verifiedModel(await getAiStatus()));
    const rows = await PredictionBatchRow.find({ batchId: batch._id, status: 'pending' }).sort({ rowNumber: 1 }).limit(100).lean<StoredBatchRow[]>();
    if (rows.length) {
      const results = await predictWqiBatch(rows.map(row => ({ rowNumber: row.rowNumber, parameters: row.parameters })), expected);
      // Fence expired workers before persisting; each row changes from pending only once.
      const renewed = await PredictionBatch.updateOne({ ...lock, leaseExpiresAt: { $gt: new Date() } }, { $set: { leaseExpiresAt: new Date(Date.now() + 120000) } });
      if (!renewed.matchedCount) return;
      await PredictionBatchRow.bulkWrite(results.map(row => ({ updateOne: {
        filter: { batchId: batch._id, rowNumber: row.rowNumber, status: 'pending' },
        update: { $set: 'result' in row ? { status: 'success', result: row.result, issues: [] }
          : { status: 'error', issues: [row.error.code === 'AI_INPUT_OUTSIDE_DOMAIN' ? 'Giá trị nằm ngoài miền đầu vào model.'
            : row.error.code === 'AI_OUTPUT_OUT_OF_RANGE' ? 'Model trả WQI ngoài khoảng 0–100; kết quả đã bị loại bỏ.' : 'Model không trả về WQI hợp lệ.'] } },
      } })));
    }
    const counts = await PredictionBatchRow.aggregate<{ _id: string; count: number }>([{ $match: { batchId: batch._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const count = Object.fromEntries(counts.map(item => [item._id, item.count]));
    const pending = count.pending ?? 0, errors = (count.invalid ?? 0) + (count.error ?? 0);
    await PredictionBatch.updateOne({ _id: batch._id, leaseToken: token }, {
      $set: { successCount: count.success ?? 0, errorCount: errors, active: pending > 0,
        status: pending ? 'running' : errors ? 'completed_with_errors' : 'completed', leaseExpiresAt: new Date(0) },
      $unset: { leaseToken: 1 },
    });
  } catch (error) {
    await PredictionBatch.updateOne({ _id: batch._id, leaseToken: token }, { $set: {
      status: 'paused', active: false, pauseCode: error instanceof AppError ? error.code : 'PROCESSING_INTERRUPTED',
    }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } });
  }
  return true;
}

export function startBatchWorker() {
  // ponytail: one worker loop per API process; use a dedicated worker if batch load grows.
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> = Promise.resolve();
  const tick = () => {
    current = (async () => {
      let worked = false;
      try { worked = Boolean(await processNextBatchChunk()); }
      catch { console.error('Prediction batch worker could not access storage.'); }
      finally { if (!stopped) timer = setTimeout(tick, worked ? 0 : 1000).unref(); }
    })();
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await current; };
}
