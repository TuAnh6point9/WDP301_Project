import { USER_MESSAGES as M } from '@wqi/contracts';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import * as service from './import.service.js';
import { idParam, pagination, meta, createdRange } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';

function requireFile(req: Request) {
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new AppError(400, 'FILE_REQUIRED', M.FILE_REQUIRED);
  return req.file;
}
const fillsSchema = z.array(z.tuple([z.number().int().positive(), z.string().max(40), z.string().max(40)])).max(10000);
/** `fills` is JSON: [rowNumber, batch code, station code] for the rows the admin completed in the dialog. */
function readFills(req: Request): service.ImportFills {
  try {
    return new Map(fillsSchema.parse(JSON.parse(String(req.body?.fills ?? '[]'))).map(([row, code, station]) => [row, { code: code.trim().toUpperCase(), station: station.trim().toUpperCase() }]));
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', M.INVALID_DATA);
  }
}
export const list: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { data, total } = await service.listBatches(page, limit, createdRange(req.query));
  res.json({ data, meta: meta(page, limit, total) });
};
export const template: RequestHandler = async (_req, res) => {
  res.attachment('mau-nhap-du-lieu.xlsx').send(await service.templateWorkbook());
};
export const preview: RequestHandler = async (req, res) => {
  res.json({ data: await service.previewWorkbook(requireFile(req).buffer, readFills(req)) });
};
export const commit: RequestHandler = async (req, res) => {
  const file = requireFile(req);
  // Comma-separated keys from the preview's `confirm` list; codes and station codes never contain commas.
  const confirmed = String(req.body?.confirm ?? '').split(',').filter(Boolean);
  const result = await service.commitWorkbook(file.buffer, file.originalname, res.locals.user!._id, confirmed, readFills(req));
  res.locals.auditTarget = result.batches.map(batch => batch.code).join(',').slice(0, 300);
  res.status(201).json({ data: result });
};
export const rows: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { batch, rows, total } = await service.listBatchRows(idParam(req.params.id), page, limit);
  res.json({ data: { batch, rows }, meta: meta(page, limit, total) });
};
