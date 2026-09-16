import { Schema, model } from 'mongoose';
const nonnegative = { type: Number, required: true, min: 0, validate: Number.isFinite };
export const parametersDefinition = {
  ph: { ...nonnegative, max: 14 }, do: nonnegative, bod5: nonnegative, cod: nonnegative, tss: nonnegative, nh4: nonnegative,
};
const schema = new Schema({
  stationId: { type: Schema.Types.ObjectId, ref: 'Station', required: true },
  measuredAt: { type: Date, required: true },
  parameters: { type: new Schema(parametersDefinition, { _id: false, strict: 'throw' }), required: true },
  unitBasis: { type: String, required: true, enum: ['mg/L; NH4+ as ion'] },
  wqi: { type: Number, min: 0, max: 100, default: null }, qualityClass: { type: String, default: null },
  wqiSource: { type: String, default: null },
  validationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  source: { kind: { type: String, enum: ['manual', 'excel'], required: true }, rowId: { type: Schema.Types.ObjectId, ref: 'ImportedRow' }, note: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, reviewedAt: { type: Date, default: null }, reviewNote: { type: String, default: null },
  version: { type: Number, default: 1 },
}, { timestamps: true, strict: 'throw' });
schema.index({ stationId: 1, measuredAt: 1 }, { unique: true });
schema.index({ validationStatus: 1, measuredAt: -1 });
schema.index({ 'source.rowId': 1 }, { unique: true, sparse: true });
export const WaterRecord = model('WaterRecord', schema);
