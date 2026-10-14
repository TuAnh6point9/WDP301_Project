import { USER_MESSAGES as M } from '@wqi/contracts';
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { User } from '../users/user.model.js';
import { verifyPassword, hashPassword } from './auth.service.js';
import { authenticate, csrfToken } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';

export const authRouter = Router();
const dummyHash = hashPassword('constant-time-login-placeholder');
authRouter.get('/csrf', (req, res) => {
  req.session.csrfToken ??= csrfToken();
  res.json({ data: { csrfToken: req.session.csrfToken } });
});
authRouter.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: M.RATE_LIMITED } }); },
}), validate(z.object({ email: z.string().trim().email().toLowerCase().max(254), password: z.string().min(1).max(128) }).strict()), async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const valid = await verifyPassword(req.body.password, user?.passwordHash ?? await dummyHash);
  if (!valid || !user?.isActive) throw new AppError(401, 'INVALID_CREDENTIALS', M.INVALID_CREDENTIALS);
  await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.userId = user._id.toString();
  req.session.csrfToken = csrfToken();
  await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  res.json({ data: { user: { _id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }, csrfToken: req.session.csrfToken } });
});
authRouter.get('/me', authenticate, (_req, res) => res.json({ data: res.locals.user }));
authRouter.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('akh.sid', { path: '/' });
    res.status(204).end();
  });
});
