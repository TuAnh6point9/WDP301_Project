import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error);
  let failure = new AppError(500, 'INTERNAL_ERROR', 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
  if (error instanceof AppError) failure = error;
  else if (error instanceof ZodError) failure = new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.', error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
  else if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) failure = new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không đúng cấu trúc.');
  else if (error instanceof multer.MulterError) failure = new AppError(400, 'UPLOAD_ERROR', 'File vượt giới hạn 5 MB hoặc trường tải lên không hợp lệ.');
  else if (error && typeof error === 'object' && 'code' in error && error.code === 11000) failure = new AppError(409, 'DUPLICATE', 'Dữ liệu đã tồn tại. Không ghi đè bản ghi cũ.');
  else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') failure = new AppError(400, 'INVALID_JSON', 'JSON không hợp lệ.');
  else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') failure = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Nội dung yêu cầu quá lớn.');
  if (failure.status === 500) console.error(JSON.stringify({ requestId: res.locals.requestId, event: 'request_failed', error: error instanceof Error ? error.name : 'UnknownError' }));
  res.status(failure.status).json({ error: { code: failure.code, message: failure.message, details: failure.details, requestId: res.locals.requestId } });
};
