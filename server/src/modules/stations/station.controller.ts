import type { RequestHandler } from 'express';
import * as service from './station.service.js';
import { idParam, pagination, meta } from '../../middleware/validate.js';

export const list: RequestHandler = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { data, total } = await service.listStations(page, limit, res.locals.user?.role === 'admin');
  res.json({ data, meta: meta(page, limit, total) });
};
export const get: RequestHandler = async (req, res) => {
  res.json({ data: await service.requireStation(idParam(req.params.id), res.locals.user?.role !== 'admin') });
};
export const create: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await service.createStation(req.body) });
};
export const update: RequestHandler = async (req, res) => {
  res.json({ data: await service.updateStation(idParam(req.params.id), req.body) });
};
export const deactivate: RequestHandler = async (req, res) => {
  await service.updateStation(idParam(req.params.id), { isActive: false });
  res.status(204).end();
};
