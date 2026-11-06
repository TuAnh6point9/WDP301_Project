import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { idParam, pagination, meta } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';
import { PredictionBatch, PredictionBatchRow } from './batch.model.js';
import { completedStatuses, ownedBatch, previewBatch, privateFields, startBatch } from './batch.service.js';
import { calculationColumns } from './workbook.js';
import { cellValue, vietnameseIssue } from './export-vi.js';

export const predictionBatchRouter = Router();
predictionBatchRouter.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }).single('file');
predictionBatchRouter.post('/preview', rateLimit({ windowMs: 60000, limit: 10, legacyHeaders: false }), upload, async (req, res) => {
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new AppError(400, 'FILE_REQUIRED', 'Please choose an .xlsx file up to 5 MB.');
  res.status(201).json({ data: await previewBatch(req.file.buffer, req.file.originalname, res.locals.user!._id) });
});
predictionBatchRouter.get('/', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const filter = { userId: res.locals.user!._id, status: { $ne: 'uploading' } };
  const [data, total] = await Promise.all([PredictionBatch.find(filter).select(privateFields).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), PredictionBatch.countDocuments(filter)]);
  res.json({ data, meta: meta(page, limit, total) });
});
predictionBatchRouter.post('/:id/start', async (req, res) => {
  res.status(202).json({ data: await startBatch(idParam(req.params.id), res.locals.user!._id) });
});
predictionBatchRouter.get('/:id', async (req, res) => {
  res.json({ data: await ownedBatch(idParam(req.params.id), res.locals.user!._id) });
});
predictionBatchRouter.get('/:id/rows', async (req, res) => {
  const batch = await ownedBatch(idParam(req.params.id), res.locals.user!._id);
  const { page, limit } = pagination(req.query);
  const kind = z.enum(['all', 'errors']).parse(req.query.filter ?? 'all');
  const filter = { batchId: batch._id, ...(kind === 'errors' ? { status: { $in: ['invalid', 'error'] } } : {}) };
  const [data, total] = await Promise.all([PredictionBatchRow.find(filter).select('-parameters -__v -result.classificationVersion').sort({ rowNumber: 1 }).skip((page - 1) * limit).limit(limit).lean(), PredictionBatchRow.countDocuments(filter)]);
  res.json({ data, meta: meta(page, limit, total) });
});
predictionBatchRouter.get('/:id/export', async (req, res) => {
  const batch = await ownedBatch(idParam(req.params.id), res.locals.user!._id);
  if (!completedStatuses.includes(batch.status)) throw new AppError(409, 'BATCH_NOT_FINISHED', 'The batch has not finished yet.');
  // Vietnamese only, in the data-entry template's column order (user's request 06/11); stored classes are already Vietnamese.
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Kết quả WQI');
  sheet.addRow([...calculationColumns, 'WQI', 'Phân loại', 'Trạng thái', 'Lý do lỗi', 'Dòng Excel']);
  for await (const row of PredictionBatchRow.find({ batchId: batch._id }).sort({ rowNumber: 1 }).cursor()) {
    const values = row.values as Partial<Record<string, number | string | null>>;
    sheet.addRow([...calculationColumns.map(key => cellValue(values[key])), row.result?.wqi ?? null, row.result?.qualityClass ?? null,
      row.status === 'success' ? 'Thành công' : 'Lỗi', row.issues.length ? row.issues.map(vietnameseIssue).join('; ') : null, row.rowNumber]);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach(column => { column.width = 16; });
  const provenance = book.addWorksheet('Thông tin');
  provenance.addRows([['Mã lượt tính', batch._id.toString()], ['Tên file', batch.fileName], ['Thời gian tạo', batch.createdAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })]]);
  provenance.columns.forEach(column => { column.width = 40; });
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`ket-qua-wqi-${batch._id}.xlsx`);
  await book.xlsx.write(res); res.end();
});
