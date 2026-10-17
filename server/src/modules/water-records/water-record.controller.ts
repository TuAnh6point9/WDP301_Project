import type { RequestHandler } from 'express';
import * as service from './water-record.service.js';
import { idParam, pagination, meta } from '../../middleware/validate.js';

export const list: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const admin = res.locals.user?.role === 'admin';
  const result = await service.listRecords(await service.recordFilter(req, admin), page, limit, admin);
  res.json({ data: result.data, meta: meta(page, limit, result.total) });
};
export const create: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await service.createRecord(idParam(req.params.id), req.body, res.locals.user!._id) });
};
export const update: RequestHandler = async (req, res) => {
  res.json({ data: await service.updateRecord(idParam(req.params.id), req.body) });
};
export const recalculate: RequestHandler = async (req, res) => {
  res.json({ data: await service.recalculateRecords(req.body.ids) });
};
export const review: RequestHandler = async (req, res) => {
  res.json({ data: await service.reviewRecord(idParam(req.params.id), req.body, res.locals.user!._id) });
};
