import { USER_MESSAGES as M } from '@wqi/contracts';
import type { Request, RequestHandler } from 'express';
import * as service from './import.service.js';
import { idParam, pagination, meta } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';

function requireFile(req: Request) {
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new AppError(400, 'FILE_REQUIRED', M.FILE_REQUIRED);
  return req.file;
}
export const list: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { data, total } = await service.listBatches(page, limit);
  res.json({ data, meta: meta(page, limit, total) });
};
export const preview: RequestHandler = async (req, res) => {
  res.json({ data: await service.previewWorkbook(requireFile(req).buffer) });
};
export const commit: RequestHandler = async (req, res) => {
  const file = requireFile(req);
  const result = await service.commitWorkbook(file.buffer, file.originalname, res.locals.user!._id);
  res.status(result.duplicate ? 200 : 201).json({ data: result });
};
export const rows: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { batch, rows, total } = await service.listBatchRows(idParam(req.params.id), page, limit);
  res.json({ data: { batch, rows }, meta: meta(page, limit, total) });
};
export const normalize: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await service.normalizeRow(idParam(req.params.id), idParam(req.params.rowId), req.body, res.locals.user!._id) });
};
