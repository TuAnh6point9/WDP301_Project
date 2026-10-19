import { USER_MESSAGES as M } from '@wqi/contracts';
import { Router } from 'express';
import { predictionInputSchema } from '@wqi/contracts';
import { rateLimit } from 'express-rate-limit';
import { Prediction } from './prediction.model.js';
import { predictWqi, getAiStatus } from '../../integrations/ai/ai.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { pagination, meta, validate, idParam } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';
export const predictionRouter = Router();
// Older predictions still store classificationVersion; it is no longer part of the API.
const hiddenFields = '-classificationVersion';
predictionRouter.get('/status', async (_req, res) => res.json({ data: await getAiStatus() }));
predictionRouter.use(authenticate);
predictionRouter.post('/', rateLimit({ windowMs: 60000, limit: 10, legacyHeaders: false, standardHeaders: 'draft-8',
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: M.RATE_LIMITED } }); },
}), validate(predictionInputSchema), async (req, res) => {
  const result = await predictWqi(req.body.parameters, req.body.unitBasis);
  const data = await Prediction.create({ ...req.body, ...result, userId: res.locals.user!._id });
  res.status(201).json({ data });
});
predictionRouter.get('/', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const filter = { userId: res.locals.user!._id };
  const [data, total] = await Promise.all([Prediction.find(filter).select(hiddenFields).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), Prediction.countDocuments(filter)]);
  res.json({ data, meta: meta(page, limit, total) });
});
predictionRouter.get('/:id', async (req, res) => {
  const data = await Prediction.findOne({ _id: idParam(req.params.id), userId: res.locals.user!._id }).select(hiddenFields).lean();
  if (!data) throw new AppError(404, 'NOT_FOUND', M.NOT_FOUND);
  res.json({ data });
});
