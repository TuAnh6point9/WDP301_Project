import { Router } from 'express';
import { z } from 'zod';
import { recordSchema, reviewSchema } from '@wqi/contracts';
import * as controller from './water-record.controller.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { audited } from '../audit/audit.service.js';

export const recordRouter = Router();
recordRouter.get(['/water-records', '/stations/:id/water-records'], controller.list);
recordRouter.get('/water-records/:id', adminOnly, controller.detail);
recordRouter.post('/stations/:id/water-records', adminOnly, validate(recordSchema), controller.create);
recordRouter.patch('/water-records/:id', adminOnly, validate(recordSchema.extend({ version: z.number().int().min(1) })), controller.update);
recordRouter.patch('/water-records/:id/validation', adminOnly, audited('record.review'), validate(reviewSchema.extend({ version: z.number().int().min(1) })), controller.review);
