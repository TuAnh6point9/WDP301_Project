import { USER_MESSAGES as M } from '@wqi/contracts';
import type { Request } from 'express';
import { z } from 'zod';
import { recordSchema, reviewSchema, parametersSchema, type AiResult, type Parameters } from '@wqi/contracts';
import { WaterRecord } from './water-record.model.js';
import { Station } from '../stations/station.model.js';
import { idParam, timeFilter } from '../../middleware/validate.js';
import { requireStation } from '../stations/station.service.js';
import { predictWqi } from '../../integrations/ai/ai.service.js';
import { AppError } from '../../utils/app-error.js';

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
  } else if (req.query.status) {
    filter.validationStatus = z.enum(['pending', 'verified', 'rejected']).parse(req.query.status);
  }
  return filter;
}
export const publicRecordFields = 'stationId measuredAt parameters unitBasis wqi qualityClass validationStatus version';
const stationFields = 'name code administrativeArea location isActive';
export async function listRecords(filter: Record<string, unknown>, page: number, limit: number, admin: boolean) {
  const query = WaterRecord.find(filter).populate('stationId', stationFields).sort({ measuredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
  if (!admin) query.select(publicRecordFields);
  const [data, total] = await Promise.all([query.lean(), WaterRecord.countDocuments(filter)]);
  return { data, total };
}
const wqiFields = (result: AiResult) => ({
  wqi: result.wqi, qualityClass: result.qualityClass, wqiSource: `${result.algorithm} ${result.modelVersion} · ${result.artifactSha256.slice(0, 12)}`,
});
/** WQI from the CatBoost service; the measurements are kept with a null WQI when the service cannot answer. */
export async function deriveWqi(parameters: Parameters) {
  try {
    return wqiFields(await predictWqi(parameters));
  } catch (error) {
    if (error instanceof AppError) return { wqi: null, qualityClass: null, wqiSource: null };
    throw error;
  }
}
export async function createRecord(stationId: string, fields: z.infer<typeof recordSchema>, userId: string) {
  await requireStation(stationId, true);
  const record = await WaterRecord.create({ ...fields, ...await deriveWqi(fields.parameters), stationId, source: { kind: 'manual' }, createdBy: userId });
  return record.populate('stationId', stationFields);
}
async function requireRecord(id: string) {
  if (!await WaterRecord.exists({ _id: id })) throw new AppError(404, 'RECORD_NOT_FOUND', M.NOT_FOUND);
}
export async function updateRecord(id: string, input: z.infer<typeof recordSchema> & { version: number }) {
  await requireRecord(id);
  const { version, ...fields } = input;
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version }, {
    $set: { ...fields, ...await deriveWqi(fields.parameters), validationStatus: 'pending', reviewedBy: null, reviewedAt: null, reviewNote: null },
    $inc: { version: 1 },
  }, { new: true, runValidators: true }).populate('stationId', stationFields);
  if (!data) throw new AppError(409, 'RECORD_CHANGED', M.RECORD_CHANGED);
  return data;
}
/** Recomputes WQI from stored measurements. A record edited meanwhile keeps the WQI of its newer edit. */
export async function recalculateRecords(ids: string[]) {
  const records = await WaterRecord.find({ _id: { $in: ids } }).select('parameters version').lean();
  if (records.length !== new Set(ids).size) throw new AppError(404, 'RECORD_NOT_FOUND', M.NOT_FOUND);
  let updated = 0, skipped = 0;
  for (const record of records) {
    // Legacy records without the six model measurements cannot be scored.
    const parameters = parametersSchema.safeParse(record.parameters);
    if (!parameters.success) { skipped++; continue; }
    const fields = wqiFields(await predictWqi(parameters.data));
    const saved = await WaterRecord.updateOne({ _id: record._id, version: record.version }, { $set: fields });
    if (saved.matchedCount) updated++; else skipped++;
  }
  return { updated, skipped };
}
export async function reviewRecord(id: string, input: z.infer<typeof reviewSchema> & { version: number }, userId: string) {
  await requireRecord(id);
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version: input.version }, {
    $set: { validationStatus: input.status, reviewedBy: userId, reviewedAt: new Date(), reviewNote: input.note },
    $inc: { version: 1 },
  }, { new: true, runValidators: true }).populate('stationId', stationFields);
  if (!data) throw new AppError(409, 'RECORD_CHANGED', M.RECORD_CHANGED);
  return data;
}
