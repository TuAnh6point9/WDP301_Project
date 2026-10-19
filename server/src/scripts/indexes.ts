import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { User } from '../modules/users/user.model.js';
import { Station } from '../modules/stations/station.model.js';
import { WaterRecord } from '../modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../modules/imports/import.model.js';
import { Prediction } from '../modules/predictions/prediction.model.js';
import { AiInputSchema } from '../modules/predictions/ai-input-schema.model.js';
import { PredictionBatch, PredictionBatchRow } from '../modules/prediction-batches/batch.model.js';
import { AuditLog } from '../modules/audit/audit.model.js';
try {
  await connectDatabase();
  for (const model of [User, Station, WaterRecord, ImportBatch, ImportedRow, Prediction, AiInputSchema, PredictionBatch, PredictionBatchRow, AuditLog]) await model.createIndexes();
  console.log('Database indexes created. Existing data was preserved.');
} finally { await mongoose.disconnect(); }
