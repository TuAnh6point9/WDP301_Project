import { USER_MESSAGES as M } from '@wqi/contracts';
import { Station } from './station.model.js';
import { AppError } from '../../utils/app-error.js';
import { stationUpdateSchema, type StationInput, type StationLatest } from '@wqi/contracts';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { WaterRecord } from '../water-records/water-record.model.js';
export async function requireStation(id: string, active = false) {
  const station = await Station.findById(id);
  if (!station || (active && !station.isActive)) throw new AppError(404, 'STATION_NOT_FOUND', M.NOT_FOUND);
  return station;
}
export const createStation = (input: StationInput) => Station.create(input);

type BatchTop = Omit<StationLatest, 'reviewedAt' | 'batches'> & { stationId: Types.ObjectId; reviewedAt: Date | null };
const codeParts = (code: string) => /^D(\d+)-(\d{4})$/.exec(code);
/** Decision 28 (04/11): D<n>-<yyyy> codes order by year then number and beat any other code; other codes order by their latest approval. */
export function newerBatch(a: Pick<BatchTop, 'batchCode' | 'reviewedAt'>, b: Pick<BatchTop, 'batchCode' | 'reviewedAt'>) {
  const pa = codeParts(a.batchCode), pb = codeParts(b.batchCode);
  if (pa && pb) return Number(pa[2]) - Number(pb[2]) || Number(pa[1]) - Number(pb[1]);
  if (pa || pb) return pa ? 1 : -1;
  return (a.reviewedAt?.getTime() ?? 0) - (b.reviewedAt?.getTime() ?? 0);
}

/** One aggregation for the whole page: per station and batch, the verified row lowest in the Excel file. Only public fields leave the database. */
// shortcut: scans verified records without a dedicated index (adding one would build it on the shared Atlas at startup); add {stationId, validationStatus} when records grow large.
async function latestByStation(stationIds: Types.ObjectId[]) {
  const tops = await WaterRecord.aggregate<BatchTop>([
    { $match: { stationId: { $in: stationIds }, validationStatus: 'verified', batchCode: { $type: 'string' } } },
    { $sort: { batchRow: -1, _id: -1 } },
    { $group: { _id: { stationId: '$stationId', batchCode: '$batchCode' }, row: { $first: '$$ROOT' }, reviewedAt: { $max: '$reviewedAt' } } },
    { $project: { _id: 0, stationId: '$_id.stationId', batchCode: '$_id.batchCode', batchRow: { $ifNull: ['$row.batchRow', null] }, wqi: { $ifNull: ['$row.wqi', null] }, qualityClass: { $ifNull: ['$row.qualityClass', null] }, parameters: '$row.parameters', reviewedAt: 1 } },
  ]);
  const latest = new Map<string, StationLatest>();
  for (const id of new Set(tops.map(top => String(top.stationId)))) {
    const batches = tops.filter(top => String(top.stationId) === id);
    const { batchCode, batchRow, wqi, qualityClass, parameters, reviewedAt } = batches.reduce((best, top) => newerBatch(top, best) > 0 ? top : best);
    latest.set(id, { batchCode, batchRow, wqi, qualityClass, parameters, reviewedAt: reviewedAt?.toISOString() ?? null, batches: batches.length });
  }
  return latest;
}

export async function listStations(page: number, limit: number, isAdmin: boolean) {
  const filter = isAdmin ? {} : { isActive: true };
  const [stations, total] = await Promise.all([
    Station.find(filter).sort({ code: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Station.countDocuments(filter),
  ]);
  // The newest approved batch shows on admin pages only; the public map and charts stay as they are (user, 04/11).
  if (!isAdmin) return { data: stations, total };
  const latest = await latestByStation(stations.map(station => station._id));
  return { data: stations.map(station => ({ ...station, latest: latest.get(String(station._id)) ?? null })), total };
}
export async function updateStation(id: string, fields: z.infer<typeof stationUpdateSchema>) {
  const station = await requireStation(id);
  station.set(fields);
  return station.save();
}
