import type { Request } from 'express';
import { z } from 'zod';
import { recordSchema, reviewSchema } from '@wqi/contracts';
import { WaterRecord } from './water-record.model.js';
import { Station } from '../stations/station.model.js';
import { idParam, timeFilter } from '../../middleware/validate.js';
import { requireStation } from '../stations/station.service.js';
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
export async function listRecords(filter: Record<string, unknown>, page: number, limit: number, admin: boolean) {
  const query = WaterRecord.find(filter).populate('stationId', 'name code administrativeArea location isActive').sort({ measuredAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
  if (!admin) query.select(publicRecordFields);
  const [data, total] = await Promise.all([query.lean(), WaterRecord.countDocuments(filter)]);
  return { data, total };
}
export async function createRecord(stationId: string, fields: z.infer<typeof recordSchema>, userId: string) {
  await requireStation(stationId, true);
  return WaterRecord.create({ ...fields, stationId, source: { kind: 'manual' }, createdBy: userId });
}
async function requireRecord(id: string) {
  if (!await WaterRecord.exists({ _id: id })) throw new AppError(404, 'RECORD_NOT_FOUND', 'Không tìm thấy bản ghi.');
}
export async function updateRecord(id: string, input: z.infer<typeof recordSchema> & { version: number }) {
  await requireRecord(id);
  const { version, ...fields } = input;
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version }, {
    $set: { ...fields, validationStatus: 'pending', wqi: null, qualityClass: null, wqiSource: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
    $inc: { version: 1 },
  }, { new: true, runValidators: true });
  if (!data) throw new AppError(409, 'RECORD_CHANGED', 'Bản ghi đã thay đổi. Vui lòng tải lại.');
  return data;
}
export async function reviewRecord(id: string, input: z.infer<typeof reviewSchema> & { version: number }, userId: string) {
  await requireRecord(id);
  const data = await WaterRecord.findOneAndUpdate({ _id: id, version: input.version }, {
    $set: { validationStatus: input.status, reviewedBy: userId, reviewedAt: new Date(), reviewNote: input.note },
    $inc: { version: 1 },
  }, { new: true, runValidators: true });
  if (!data) throw new AppError(409, 'RECORD_CHANGED', 'Bản ghi đã thay đổi. Vui lòng tải lại.');
  return data;
}
