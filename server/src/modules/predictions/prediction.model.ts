import { Schema, model } from 'mongoose';
import { parametersDefinition } from '../water-records/water-record.model.js';

const inputSnapshotFieldSchema = new Schema({
  key: { type: String, required: true, trim: true },
  value: { type: Number, required: true, validate: Number.isFinite },
  label: { type: String, required: true, trim: true },
  unit: { type: String, default: null },
  chemicalBasis: { type: String, default: null },
  order: { type: Number, required: true, min: 1, max: 6, validate: Number.isInteger },
}, { _id: false, strict: 'throw' });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  // Legacy fields remain readable while the current fixed AI contract is in use.
  parameters: { type: new Schema(parametersDefinition, { _id: false }), required: true },
  unitBasis: { type: String, required: true },
  inputSchemaId: { type: Schema.Types.ObjectId, ref: 'AiInputSchema', default: null },
  inputSchemaVersion: { type: String, trim: true, default: null },
  inputSnapshot: { type: [inputSnapshotFieldSchema], default: undefined },
  wqi: { type: Number, min: 0, max: 100, required: true }, qualityClass: { type: String, required: true },
  modelVersion: { type: String, required: true }, classificationVersion: { type: String, required: true },
  preprocessingVersion: { type: String, trim: true, default: null },
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ inputSchemaId: 1, createdAt: -1 }, { sparse: true });
export const Prediction = model('Prediction', schema);
