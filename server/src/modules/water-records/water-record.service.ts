import { USER_MESSAGES as M, type PredictionParameters } from '@wqi/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { recordSchema, reviewSchema } from '@wqi/contracts';
import { WaterRecord } from './water-record.model.js';
import { Station } from '../stations/station.model.js';
import { idParam, timeFilter, createdRange } from '../../middleware/validate.js';
import { newerBatch, requireStation } from '../stations/station.service.js';
import { getAiStatus, predictWqi, predictWqiBatch } from '../../integrations/ai/ai.service.js';
import { AppError } from '../../utils/app-error.js';

const wqiFields = (result: { wqi: number; qualityClass: string; modelVersion: string }) => ({ wqi: result.wqi, qualityClass: result.qualityClass, wqiSource: result.modelVersion });
// Waiting never helps here: the model cannot score these values, or no model is set up. Anything else may pass, so the admin retries.
const WQI_NEVER = new Set(['AI_INPUT_OUTSIDE_DOMAIN', 'AI_OUTPUT_OUT_OF_RANGE', 'AI_NOT_CONFIGURED']);

/** WQI for records just saved. An AI that is asleep must not undo the save: those records wait for the approval step. */
export async function calculateRecordWqi(ids: unknown[]) {
  let calculated = 0;
  try {
    const status = ids.length ? await getAiStatus() : null;
    if (status?.available && status.artifactSha256 && status.modelVersion) {
      const expected = { artifactSha256: status.artifactSha256, modelVersion: status.modelVersion };
      for (let start = 0; start < ids.length; start += 100) {
        const records = await WaterRecord.find({ _id: { $in: ids.slice(start, start + 100) } }).select('parameters version').lean();
        const results = await predictWqiBatch(records.map((record, index) => ({ rowNumber: index + 2, parameters: record.parameters })), expected);
        const writes = results.flatMap(row => 'result' in row ? [{ updateOne: { filter: { _id: records[row.rowNumber - 2]._id, version: records[row.rowNumber - 2].version }, update: { $set: wqiFields(row.result) } } }] : []);
        if (writes.length) calculated += (await WaterRecord.bulkWrite(writes, { ordered: false })).modifiedCount;
      }
    }
  } catch { /* The rows are already saved; the count below tells the admin what is still waiting. */ }
  return { calculated, pending: ids.length - calculated };
}
async function wqiForApproval(parameters: PredictionParameters) {
  try { return wqiFields(await predictWqi(parameters)); }
  catch (error) {
    if (error instanceof AppError && WQI_NEVER.has(error.code)) return {};
    throw error;
  }
}

export async function recordFilter(req: Request, isAdmin: boolean) {
  const filter: Record<string, unknown> = { ...timeFilter(req.query) };
  if (req.params.id) {
    filter.stationId = idParam(req.params.id);
    await requireStation(filter.stationId as string, !isAdmin);
  } else if (req.query.stationId) filter.stationId = idParam(req.query.stationId);
  if (!isAdmin) {
    filter.validationStatus = 'verified';
    const activeIds = await Station.find({ isActive: true }).distinct('_id');
    if (filter.stationId) filter.$and = [{ stationId: { $in: activeIds } }];
    else filter.stationId = { $in: activeIds };
  } else {
    if (req.query.status) filter.validationStatus = z.enum(['pending', 'verified', 'rejected']).parse(req.query.status);
    Object.assign(filter, createdRange({ from: req.query.createdFrom, to: req.query.createdTo }));
  }
  return filter;
}
export const publicRecordFields = 'stationId measuredAt parameters unitBasis wqi qualityClass validationStatus version';
type Ordered = { _id: unknown; batchCode?: string | null; batchRow?: number | null; measuredAt?: Date | null; validationStatus?: string | null; reviewedAt?: Date | null };
/** Newest batch first (decision 28, same rule as the station's map value), lowest Excel row first inside a batch; dated rows last. */
export function newestBatchFirst(rows: Ordered[]) {
  // Like the station page, a non-D batch is as new as its latest approval.
  const approved = new Map<string, Date | null>();
  for (const row of rows) if (row.batchCode && row.validationStatus === 'verified' && (row.reviewedAt?.getTime() ?? 0) >= (approved.get(row.batchCode)?.getTime() ?? 0)) approved.set(row.batchCode, row.reviewedAt ?? null);
  const batch = (code: string) => ({ batchCode: code, reviewedAt: approved.get(code) ?? null });
  const byId = (a: Ordered, b: Ordered) => String(b._id).localeCompare(String(a._id));
  return rows.sort((a, b) => {
    if (a.batchCode && b.batchCode) return newerBatch(batch(b.batchCode), batch(a.batchCode)) || b.batchCode.localeCompare(a.batchCode) || (b.batchRow ?? -1) - (a.batchRow ?? -1) || byId(a, b);
    if (a.batchCode || b.batchCode) return a.batchCode ? -1 : 1;
    return (b.measuredAt?.getTime() ?? 0) - (a.measuredAt?.getTime() ?? 0) || byId(a, b);
  });
}
const recordStation = ['stationId', 'name code administrativeArea location isActive'] as const;
export async function listRecords(filter: Record<string, unknown>, page: number, limit: number, admin: boolean) {
  if (admin && typeof filter.stationId === 'string') {
    // shortcut: sorts one station's rows in memory (fine for a few thousand); move the rule into an aggregation when a station passes ~10k rows.
    const rows = newestBatchFirst(await WaterRecord.find(filter).populate(...recordStation).lean());
    return { data: rows.slice((page - 1) * limit, page * limit), total: rows.length };
  }
  const query = WaterRecord.find(filter).populate(...recordStation).sort({ measuredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
  if (!admin) query.select(publicRecordFields);
  const [data, total] = await Promise.all([query.lean(), WaterRecord.countDocuments(filter)]);
  return { data, total };
}
export async function createRecord(stationId: string, fields: z.infer<typeof recordSchema>, userId: string) {
  await requireStation(stationId, true);
  return WaterRecord.create({ ...fields, stationId, source: { kind: 'manual' }, createdBy: userId });
}
/** Admin detail: the record plus who created/reviewed it and the unchanged raw row it came from. */
export async function getRecordDetail(id: string) {
  const record = await WaterRecord.findById(id)
    .populate('stationId', 'name code administrativeArea location isActive')
    .populate('createdBy', 'name email').populate('reviewedBy', 'name email')
    .populate({ path: 'source.rowId', select: 'rowNumber values issues batchId', populate: { path: 'batchId', select: 'fileName createdAt' } })
    .lean();
  if (!record) throw new AppError(404, 'RECORD_NOT_FOUND', M.NOT_FOUND);
  return record;
}
async function requireRecord(id: string) {
  if (!await WaterRecord.exists({ _id: id })) throw new AppError(404, 'RECORD_NOT_FOUND', M.NOT_FOUND);
}
export async function updateRecord(id: string, input: z.infer<typeof recordSchema> & { version: number }) {
  await requireRecord(id);
  const { version, ...fields } = input;
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version }, {
    $set: { ...fields, validationStatus: 'pending', wqi: null, qualityClass: null, wqiSource: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
    $inc: { version: 1 },
  }, { new: true, runValidators: true });
  if (!data) throw new AppError(409, 'RECORD_CHANGED', M.RECORD_CHANGED);
  return data;
}
export async function reviewRecord(id: string, input: z.infer<typeof reviewSchema>, userId: string) {
  const record = await WaterRecord.findById(id).select('parameters wqi version').lean();
  if (!record) throw new AppError(404, 'RECORD_NOT_FOUND', M.NOT_FOUND);
  // Approval publishes the record, so it should carry its WQI. A stale version fails below, without asking the model.
  const wqi = input.status === 'verified' && record.wqi == null && record.version === input.version ? await wqiForApproval(record.parameters) : {};
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version: input.version }, {
    $set: { validationStatus: input.status, reviewedBy: userId, reviewedAt: new Date(), reviewNote: input.note || null, ...wqi },
    $inc: { version: 1 },
  }, { new: true, runValidators: true });
  if (!data) throw new AppError(409, 'RECORD_CHANGED', M.RECORD_CHANGED);
  return data;
}
