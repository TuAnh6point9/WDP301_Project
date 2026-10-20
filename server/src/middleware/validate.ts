import { USER_MESSAGES as M } from '@wqi/contracts';
import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { z } from 'zod';
import { objectId, userErrorMap } from '@wqi/contracts';
import { AppError } from '../utils/app-error.js';

export const validate = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  req.body = schema.parse(req.body, { errorMap: userErrorMap });
  next();
};
export const idParam = (value: unknown) => objectId.parse(value);
export function pagination(query: unknown) {
  return z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(query);
}
export function timeFilter(query: unknown) {
  const range = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }).parse(query);
  if (range.from && range.to && new Date(range.from) >= new Date(range.to)) throw new AppError(400, 'INVALID_RANGE', M.INVALID_RANGE);
  return range.from || range.to ? { measuredAt: { ...(range.from ? { $gte: new Date(range.from) } : {}), ...(range.to ? { $lt: new Date(range.to) } : {}) } } : {};
}
/** `from`/`to` are calendar days in Asia/Saigon; the range is [from 00:00, to + 1 day 00:00). */
export function createdRange(query: unknown): { createdAt?: { $gte?: Date; $lt?: Date } } {
  const day = z.string().date();
  const range = z.object({ from: day.optional(), to: day.optional() }).parse(query);
  if (range.from && range.to && range.from > range.to) throw new AppError(400, 'INVALID_RANGE', M.INVALID_RANGE);
  const start = (value: string) => new Date(`${value}T00:00:00+07:00`);
  return range.from || range.to ? { createdAt: { ...(range.from ? { $gte: start(range.from) } : {}), ...(range.to ? { $lt: new Date(start(range.to).getTime() + 86400000) } : {}) } } : {};
}
export function meta(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}
