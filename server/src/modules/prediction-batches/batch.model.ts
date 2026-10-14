import { Schema, model } from 'mongoose';
import { batchStatuses, type PredictionParameters, type RawValues, type PredictionStatus, type AiResult } from '@wqi/contracts';

const batchSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  fileName: { type: String, required: true },
  status: { type: String, enum: [...batchStatuses, 'uploading'], required: true },
  rowCount: { type: Number, required: true }, validCount: { type: Number, required: true }, invalidCount: { type: Number, required: true },
  successCount: { type: Number, default: 0 }, errorCount: { type: Number, default: 0 },
  active: { type: Boolean, default: false }, pauseCode: String,
  modelSnapshot: { type: Schema.Types.Mixed, required: false },
  leaseToken: String, leaseExpiresAt: Date,
}, { timestamps: true });
batchSchema.index({ userId: 1, createdAt: -1 });
batchSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_batch_per_owner' });
batchSchema.index({ active: 1, leaseExpiresAt: 1 });
export const PredictionBatch = model('PredictionBatch', batchSchema);

const rowSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, required: true }, rowNumber: { type: Number, required: true },
  values: { type: Schema.Types.Mixed, required: true }, parameters: Schema.Types.Mixed,
  issues: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'invalid', 'success', 'error'], required: true },
  result: Schema.Types.Mixed,
});
rowSchema.index({ batchId: 1, rowNumber: 1 }, { unique: true });
rowSchema.index({ batchId: 1, status: 1, rowNumber: 1 });
export const PredictionBatchRow = model('PredictionBatchRow', rowSchema);
export type StoredBatchRow = { rowNumber: number; values: RawValues; parameters: PredictionParameters; issues: string[]; status: string; result?: AiResult };
export type ModelSnapshot = PredictionStatus & { artifactSha256: string; modelVersion: string };
