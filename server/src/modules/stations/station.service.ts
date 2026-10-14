import { USER_MESSAGES as M } from '@wqi/contracts';
import { Station } from './station.model.js';
import { AppError } from '../../utils/app-error.js';
import { stationUpdateSchema, type StationInput } from '@wqi/contracts';
import type { z } from 'zod';
export async function requireStation(id: string, active = false) {
  const station = await Station.findById(id);
  if (!station || (active && !station.isActive)) throw new AppError(404, 'STATION_NOT_FOUND', M.NOT_FOUND);
  return station;
}
export const createStation = (input: StationInput) => Station.create(input);
export async function listStations(page: number, limit: number, isAdmin: boolean) {
  const filter = isAdmin ? {} : { isActive: true };
  const [data, total] = await Promise.all([
    Station.find(filter).sort({ code: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Station.countDocuments(filter),
  ]);
  return { data, total };
}
export async function updateStation(id: string, fields: z.infer<typeof stationUpdateSchema>) {
  const station = await requireStation(id);
  station.set(fields);
  return station.save();
}
