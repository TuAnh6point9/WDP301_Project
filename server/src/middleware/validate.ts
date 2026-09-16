import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { z } from 'zod';
import { objectId } from '@wqi/contracts';
import { AppError } from '../utils/app-error.js';

export const validate = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  req.body = schema.parse(req.body);
  next();
};
export const idParam = (value: unknown) => objectId.parse(value);
export function pagination(query: unknown) {
  return z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(query);
}
export function timeFilter(query: unknown) {
  const range = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }).parse(query);
  if (range.from && range.to && new Date(range.from) >= new Date(range.to)) throw new AppError(400, 'INVALID_RANGE', 'Thời gian bắt đầu phải trước thời gian kết thúc.');
  return range.from || range.to ? { measuredAt: { ...(range.from ? { $gte: new Date(range.from) } : {}), ...(range.to ? { $lt: new Date(range.to) } : {}) } } : {};
}
export function meta(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}
