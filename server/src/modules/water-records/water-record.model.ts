import { Schema, model } from 'mongoose';
import { PREDICTION_UNIT_BASIS } from '@wqi/contracts';
const nonnegative = { type: Number, required: true, min: 0, validate: Number.isFinite };
export const parametersDefinition = {
  coliform: nonnegative, nh4: nonnegative, ph: { ...nonnegative, max: 14 }, po4: nonnegative, do: nonnegative, cod: nonnegative,
};
const schema = new Schema({
  stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true },
  // Excel imports have no sampling date; their batch code places them in time (decision 24, changed 29/10).
  measuredAt: { type: Date, default: null }, batchCode: String,
  // The row of the source file: a batch holds many rows of one station, so this tells them apart.
  batchRow: Number,
  parameters: { type: new Schema(parametersDefinition, { _id: false, strict: 'throw' }), required: true },
  unitBasis: { type: String, required: true, enum: [PREDICTION_UNIT_BASIS] },
  wqi: { type: Number, min: 0, max: 100, default: null }, qualityClass: { type: String, default: null },
  wqiSource: { type: String, default: null },
  validationStatus: { type: String, enum: ['pending', 'verified', 'rejected', 'locked'], default: 'pending' },
  source: { kind: { type: String, enum: ['manual', 'excel'], required: true }, rowId: { type: Schema.Types.ObjectId, ref: 'ImportedRow' }, note: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, reviewedAt: { type: Date, default: null }, reviewNote: { type: String, default: null },
  version: { type: Number, default: 1 },
}, { timestamps: true, strict: 'throw' });
schema.index({ stationId: 1, measuredAt: 1 }, { unique: true, partialFilterExpression: { measuredAt: { $type: 'date' } } });
// Saving the same row of a batch twice at once cannot double it. Records saved before batchRow existed are left out.
schema.index({ batchCode: 1, batchRow: 1 }, { unique: true, partialFilterExpression: { batchCode: { $type: 'string' }, batchRow: { $type: 'number' } } });
schema.index({ validationStatus: 1, measuredAt: -1 });
schema.index({ 'source.rowId': 1 }, { unique: true, sparse: true });
export const WaterRecord = model('WaterRecord', schema);
