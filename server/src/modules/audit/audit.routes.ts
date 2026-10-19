import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from './audit.model.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { createdRange, pagination, meta } from '../../middleware/validate.js';

export const auditRouter = Router();
auditRouter.get('/', adminOnly, async (req, res) => {
  const { page, limit } = pagination(req.query);
  const { action } = z.object({ action: z.string().trim().max(60).optional() }).parse(req.query);
  const filter = { ...createdRange(req.query), ...(action ? { action } : {}) };
  const [data, total] = await Promise.all([
    AuditLog.find(filter).populate('actorId', 'name email').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ data, meta: meta(page, limit, total) });
});
