import { Router } from 'express';
import { z } from 'zod';
import { userSchema } from '@wqi/contracts';
import { User } from './user.model.js';
import { hashPassword } from '../auth/auth.service.js';
import { adminOnly } from '../../middleware/authenticate.js';
import { validate, idParam, pagination, meta } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';
export const userRouter = Router();
userRouter.use(adminOnly);
userRouter.get('/', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const [data, total] = await Promise.all([User.find().select('name email role isActive').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments()]);
  res.json({ data, meta: meta(page, limit, total) });
});
userRouter.post('/', validate(userSchema), async (req, res) => {
  const { password, ...fields } = req.body;
  const user = await User.create({ ...fields, passwordHash: await hashPassword(password) });
  res.status(201).json({ data: { _id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
});
userRouter.patch('/:id', validate(z.object({ name: z.string().trim().min(2).max(100).optional(), role: z.enum(['user', 'admin']).optional(), isActive: z.boolean().optional(), password: z.string().min(12).max(128).optional() }).strict()), async (req, res) => {
  const id = idParam(req.params.id);
  if (id === res.locals.user?._id && (req.body.isActive === false || req.body.role === 'user')) throw new AppError(409, 'SELF_LOCKOUT', 'Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.');
  const { password, ...fields } = req.body;
  if (password) fields.passwordHash = await hashPassword(password);
  const data = await User.findByIdAndUpdate(id, { $set: fields }, { new: true, runValidators: true }).select('name email role isActive');
  if (!data) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
  res.json({ data });
});
