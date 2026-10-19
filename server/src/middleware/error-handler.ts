import { USER_MESSAGES as M, validationIssueMessage } from '@wqi/contracts';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/app-error.js';
import { recordAudit } from '../modules/audit/audit.service.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return _next(error);
  let failure = new AppError(500, 'INTERNAL_ERROR', M.INTERNAL);
  if (error instanceof AppError) failure = error;
  else if (error instanceof ZodError) failure = new AppError(400, 'VALIDATION_ERROR', M.INVALID_DATA, error.issues.map(i => ({ field: i.path.join('.'), message: validationIssueMessage(i) })));
  else if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) failure = new AppError(400, 'VALIDATION_ERROR', M.INVALID_DATA);
  else if (error instanceof multer.MulterError) failure = new AppError(400, 'UPLOAD_ERROR', M.UPLOAD_INVALID);
  else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) failure = new AppError(409, 'DUPLICATE', M.DUPLICATE);
  else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') failure = new AppError(400, 'INVALID_JSON', M.INVALID_DATA);
  else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') failure = new AppError(413, 'PAYLOAD_TOO_LARGE', M.WORKBOOK_LIMIT);
  if (failure.status === 500) console.error(JSON.stringify({ requestId: res.locals.requestId, event: 'request_failed', error: error instanceof Error ? error.name : 'UnknownError' }));
  if (failure.status >= 500) void recordAudit({ action: 'system.error', actorId: res.locals.user?._id ?? null, target: `${req.method} ${req.originalUrl.split('?')[0]}`.slice(0, 300), outcome: 'failure', status: failure.status, requestId: res.locals.requestId });
  res.status(failure.status).json({ error: { code: failure.code, message: failure.message, details: failure.details, requestId: res.locals.requestId } });
};
