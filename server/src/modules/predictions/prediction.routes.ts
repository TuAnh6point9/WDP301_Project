import { USER_MESSAGES as M } from '@wqi/contracts';
import { Router } from 'express';
import { parameterDisplayKeys, predictionInputSchema, rawParameterColumns } from '@wqi/contracts';
import ExcelJS from 'exceljs';
import { rateLimit } from 'express-rate-limit';
import { Prediction } from './prediction.model.js';
import { predictWqi, getAiStatus } from '../../integrations/ai/ai.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { pagination, meta, validate, idParam } from '../../middleware/validate.js';
import { AppError } from '../../utils/app-error.js';
export const predictionRouter = Router();
// Older predictions still store classificationVersion; it is no longer part of the API.
const hiddenFields = '-classificationVersion';
const perMinute = (limit: number) => rateLimit({ windowMs: 60000, limit, legacyHeaders: false, standardHeaders: 'draft-8',
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message: M.RATE_LIMITED } }); },
});
predictionRouter.get('/status', async (_req, res) => res.json({ data: await getAiStatus() }));
// Visitors may try the model without an account; nothing is stored until a signed-in user saves.
predictionRouter.post('/preview', perMinute(20), validate(predictionInputSchema), async (req, res) => {
  const result = await predictWqi(req.body.parameters, req.body.unitBasis);
  res.json({ data: { ...req.body, ...result, createdAt: new Date().toISOString() } });
});
predictionRouter.use(authenticate);
predictionRouter.post('/', perMinute(10), validate(predictionInputSchema), async (req, res) => {
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
// History/report download (user's request 06/11): Vietnamese, the template's column names, no model details.
const exportColumns: [string, string][] = [...parameterDisplayKeys.map(key => [key, rawParameterColumns[key]] as [string, string]), ['temp', 'Temp'], ['bod5', 'BOD5'], ['tss', 'TSS']];
const vietnamTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timeText = (date: Date) => { const part = Object.fromEntries(vietnamTime.formatToParts(date).map(item => [item.type, item.value])); return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`; };
predictionRouter.get('/export', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const rows = await Prediction.find({ userId: res.locals.user!._id }).select('parameters wqi qualityClass createdAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean<{ parameters: Record<string, number>; wqi: number; qualityClass: string; createdAt: Date }[]>();
  // Six current parameters always; Temp/BOD5/TSS only when an older calculation on this page has them.
  const columns = exportColumns.filter(([key], index) => index < 6 || rows.some(row => row.parameters[key] !== undefined));
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Lịch sử tính WQI');
  sheet.columns = [{ header: 'Thời gian tính', width: 18 }, ...columns.map(([, name]) => ({ header: name, width: 12 })), { header: 'WQI', width: 8 }, { header: 'Phân loại', width: 18 }];
  for (const row of rows) sheet.addRow([timeText(row.createdAt), ...columns.map(([key]) => row.parameters[key] ?? null), row.wqi, row.qualityClass]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`lich-su-tinh-wqi-trang-${page}.xlsx`);
  await book.xlsx.write(res); res.end();
});
predictionRouter.get('/:id', async (req, res) => {
  const data = await Prediction.findOne({ _id: idParam(req.params.id), userId: res.locals.user!._id }).select(hiddenFields).lean();
  if (!data) throw new AppError(404, 'NOT_FOUND', M.NOT_FOUND);
  res.json({ data });
});
