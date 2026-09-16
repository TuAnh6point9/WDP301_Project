import { Schema, model } from 'mongoose';
import { parametersDefinition } from '../water-records/water-record.model.js';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parameters: { type: new Schema(parametersDefinition, { _id: false }), required: true },
  unitBasis: { type: String, required: true },
  wqi: { type: Number, min: 0, max: 100, required: true }, qualityClass: { type: String, required: true },
  modelVersion: { type: String, required: true }, classificationVersion: { type: String, required: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ userId: 1, createdAt: -1 });
export const Prediction = model('Prediction', schema);
