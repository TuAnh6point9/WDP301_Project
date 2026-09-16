import { Schema, model } from 'mongoose';
const batchSchema = new Schema({
  fileName: { type: String, required: true }, contentHash: { type: String, unique: true, required: true },
  rowCount: { type: Number, required: true }, issueCount: { type: Number, required: true },
  status: { type: String, enum: ['importing', 'ready', 'failed'], required: true },
  leaseToken: { type: String, select: false }, leaseExpiresAt: { type: Date, select: false },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });
const rowSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }, rowNumber: { type: Number, required: true },
  values: { type: Schema.Types.Mixed, required: true }, issues: { type: [String], default: [] },
  waterRecordId: { type: Schema.Types.ObjectId, ref: 'WaterRecord', default: null },
}, { timestamps: true, strict: 'throw' });
rowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true });
export const ImportBatch = model('ImportBatch', batchSchema);
export const ImportedRow = model('ImportedRow', rowSchema);
