import { Schema, model } from 'mongoose';
import { batchCodePattern } from '@wqi/contracts';
// One batch per batch code (Mã đợt). Legacy file batches have no code, keep contentHash and stay hidden (decision 24).
const batchSchema = new Schema({
  code: { type: String, uppercase: true, trim: true, match: batchCodePattern },
  fileName: { type: String, required: true }, contentHash: String,
  rowCount: { type: Number, required: true }, issueCount: { type: Number, required: true },
  status: { type: String, enum: ['importing', 'ready', 'failed'], required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });
batchSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
// A raw row keeps the source file; several files can add rows to one batch, so the row number alone is not unique.
const rowSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', required: true }, fileName: String, rowNumber: { type: Number, required: true },
  values: { type: Schema.Types.Mixed, required: true }, issues: { type: [String], default: [] },
  waterRecordId: { type: Schema.Types.ObjectId, ref: 'WaterRecord', default: null },
}, { timestamps: true, strict: 'throw' });
rowSchema.index({ batchId: 1, rowNumber: 1 });
rowSchema.index({ waterRecordId: 1 }, { unique: true, partialFilterExpression: { waterRecordId: { $type: 'objectId' } } });
export const ImportBatch = model('ImportBatch', batchSchema);
export const ImportedRow = model('ImportedRow', rowSchema);
