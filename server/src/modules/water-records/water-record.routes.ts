import { Router } from 'express';
import { z } from 'zod';
import { recordSchema, reviewSchema, recalculateSchema } from '@wqi/contracts';
import * as controller from './water-record.controller.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';

export const recordRouter = Router();
recordRouter.get(['/water-records', '/stations/:id/water-records'], controller.list);
recordRouter.post('/stations/:id/water-records', adminOnly, validate(recordSchema), controller.create);
recordRouter.post('/water-records/recalculate', adminOnly, validate(recalculateSchema), controller.recalculate);
recordRouter.patch('/water-records/:id', adminOnly, validate(recordSchema.extend({ version: z.number().int().min(1) })), controller.update);
recordRouter.patch('/water-records/:id/validation', adminOnly, validate(reviewSchema.extend({ version: z.number().int().min(1) })), controller.review);
