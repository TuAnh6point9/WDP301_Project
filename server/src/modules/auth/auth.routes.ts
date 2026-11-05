import { USER_MESSAGES as M } from '@wqi/contracts';
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { User } from '../users/user.model.js';
import { verifyPassword, hashPassword } from './auth.service.js';
import { authenticate, csrfToken } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';
import { audited } from '../audit/audit.service.js';
import { AuditLog } from '../audit/audit.model.js';

export const authRouter = Router();
const dummyHash = hashPassword('constant-time-login-placeholder');
authRouter.get('/csrf', (req, res) => {
  req.session.csrfToken ??= csrfToken();
  res.json({ data: { csrfToken: req.session.csrfToken } });
});
authRouter.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: M.RATE_LIMITED } }); },
}), audited('auth.login'), validate(z.object({ email: z.string().trim().email().toLowerCase().max(254), password: z.string().min(1).max(128) }).strict()), async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash +guideLoginSeenAt');
  const valid = await verifyPassword(req.body.password, user?.passwordHash ?? await dummyHash);
  // Only a known account id is logged; the typed e-mail never is.
  if (user) res.locals.auditTarget = user.id;
  if (!valid || !user?.isActive) throw new AppError(401, 'INVALID_CREDENTIALS', M.INVALID_CREDENTIALS);
  res.locals.auditActor = user.id;
  let autoStart = false;
  const claimedAt = new Date();
  if (!user.guideLoginSeenAt) {
    // Recognize accounts used before this policy; browser keys never decide account state.
    const previousLogin = await AuditLog.exists({ action: 'auth.login', actorId: user._id, outcome: 'success' });
    const claim = await User.updateOne({ _id: user._id, guideLoginSeenAt: { $exists: false } }, { $set: { guideLoginSeenAt: claimedAt } });
    autoStart = claim.modifiedCount === 1 && !previousLogin;
  }
  try {
    await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user._id.toString();
    req.session.csrfToken = csrfToken();
    req.session.guideAutoStart = autoStart;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
  } catch (error) {
    if (autoStart) await User.updateOne({ _id: user._id, guideLoginSeenAt: claimedAt }, { $unset: { guideLoginSeenAt: 1 } });
    throw error;
  }
  res.json({ data: { user: { _id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }, csrfToken: req.session.csrfToken }, guidance: { autoStart } });
});
authRouter.get('/me', authenticate, (req, res) => res.json({ data: res.locals.user, guidance: { autoStart: req.session.guideAutoStart === true } }));
authRouter.post('/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('akh.sid', { path: '/' });
    res.status(204).end();
  });
});
