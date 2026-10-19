import { USER_MESSAGES as M } from '@wqi/contracts';
import type { RequestHandler } from 'express';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { User } from '../modules/users/user.model.js';
import { AppError } from '../utils/app-error.js';

declare module 'express-session' {
  interface SessionData { userId?: string; csrfToken?: string }
}
declare module 'express-serve-static-core' {
  interface Locals { user?: { _id: string; name: string; email: string; role: string; isActive: boolean }; requestId: string; auditActor?: string; auditTarget?: string }
}
export const csrfToken = () => randomBytes(32).toString('hex');
export const csrfProtection = (origins: string[]): RequestHandler => (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.headers.origin || !origins.includes(req.headers.origin)) return next(new AppError(403, 'ORIGIN_REJECTED', M.FORBIDDEN));
  const token = req.headers['x-csrf-token'];
  const expected = req.session.csrfToken;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !expected || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) return next(new AppError(403, 'CSRF_REJECTED', M.CSRF));
  next();
};
export const loadUser: RequestHandler = async (req, res, next) => {
  if (req.session.userId) {
    const user = await User.findById(req.session.userId).select('name email role isActive').lean();
    if (user?.isActive) res.locals.user = { ...user, _id: user._id.toString() };
  }
  next();
};
export const authenticate: RequestHandler = (_req, res, next) => {
  if (!res.locals.user) return next(new AppError(401, 'UNAUTHENTICATED', M.SIGN_IN));
  next();
};
export const adminOnly: RequestHandler = (req, res, next) => authenticate(req, res, err => {
  if (err) return next(err);
  if (res.locals.user?.role !== 'admin') return next(new AppError(403, 'FORBIDDEN', M.FORBIDDEN));
  next();
});
