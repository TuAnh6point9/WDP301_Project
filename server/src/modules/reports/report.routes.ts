import { USER_MESSAGES as M, exportLimitMessage } from '@wqi/contracts';
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { rawColumns, parameterKeys, parameterLabels, qualityClassLabel } from '@wqi/contracts';
import { adminOnly } from '../../middleware/authenticate.js';
import { idParam } from '../../middleware/validate.js';
import { recordFilter } from '../water-records/water-record.service.js';
import { WaterRecord } from '../water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../imports/import.model.js';
import { AppError } from '../../utils/app-error.js';
export const reportRouter = Router();
reportRouter.use(adminOnly);
reportRouter.get('/water-records', async (req, res) => {
  const filter = await recordFilter(req, true);
  const total = await WaterRecord.countDocuments(filter);
  if (total > 10000) throw new AppError(400, 'EXPORT_LIMIT', exportLimitMessage(10000));
  res.json({ data: await WaterRecord.find(filter).populate('stationId', 'name code').sort({ measuredAt: -1 }).lean() });
});
reportRouter.get('/water-records.xlsx', async (req, res) => {
  const filter = await recordFilter(req, true);
  if (await WaterRecord.countDocuments(filter) > 10000) throw new AppError(400, 'EXPORT_LIMIT', exportLimitMessage(10000));
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Water records');
  sheet.addRow(['Station code', 'Station name', 'Measured at (UTC)', ...parameterKeys.map(key => parameterLabels[key]), 'Unit basis', 'WQI', 'Classification', 'Validation', 'Source', 'Source row']);
  for await (const record of WaterRecord.find(filter).populate<{ stationId: { code: string; name: string } }>('stationId', 'code name').sort({ measuredAt: -1 }).cursor()) {
    sheet.addRow([record.stationId?.code, record.stationId?.name, record.measuredAt.toISOString(), ...parameterKeys.map(key => record.parameters[key]), record.unitBasis, record.wqi, record.qualityClass ? qualityClassLabel(record.qualityClass) : null, record.validationStatus, record.source?.kind, record.source?.rowId?.toString()]);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach(column => { column.width = 22; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('water-records.xlsx');
  await book.xlsx.write(res);
  res.end();
});
reportRouter.get('/imports/:id.xlsx', async (req, res) => {
  const batchId = idParam(req.params.id);
  const batch = await ImportBatch.findOne({ _id: batchId, status: 'ready' });
  if (!batch) throw new AppError(404, 'NOT_FOUND', M.NOT_FOUND);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  sheet.addRow([...rawColumns]);
  for await (const row of ImportedRow.find({ batchId }).sort({ rowNumber: 1 }).cursor()) {
    rawColumns.forEach((key, index) => { sheet.getRow(row.rowNumber).getCell(index + 1).value = row.values[key]; });
  }
  sheet.columns.forEach(column => { column.width = 16; });
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('original-values.xlsx');
  await book.xlsx.write(res);
  res.end();
});
