import { Schema, model } from 'mongoose';

const inputFieldSchema = new Schema({
  key: { type: String, required: true, trim: true, match: /^[a-z][a-z0-9_]{0,49}$/ },
  label: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  order: { type: Number, required: true, min: 1, max: 6, validate: Number.isInteger },
  sourceColumn: { type: String, trim: true, maxlength: 100, default: null },
  unit: { type: String, trim: true, maxlength: 100, default: null },
  chemicalBasis: { type: String, trim: true, maxlength: 200, default: null },
  unitStatus: { type: String, required: true, enum: ['confirmed', 'provisional', 'unknown'] },
  min: { type: Number, default: null, validate: (value: number | null) => value === null || Number.isFinite(value) },
  max: { type: Number, default: null, validate: (value: number | null) => value === null || Number.isFinite(value) },
}, { _id: false, strict: 'throw' });

const schema = new Schema({
  version: { type: String, required: true, unique: true, trim: true, match: /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/ },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
  status: { type: String, required: true, enum: ['draft', 'active', 'retired'], default: 'draft' },
  fields: {
    type: [inputFieldSchema],
    required: true,
    validate: [
      { validator: (fields: Array<{ key: string }>) => fields.length === 6, message: 'AI input schema must contain exactly six fields.' },
      { validator: (fields: Array<{ key: string }>) => new Set(fields.map(field => field.key)).size === fields.length, message: 'AI input field keys must be unique.' },
      { validator: (fields: Array<{ order: number }>) => new Set(fields.map(field => field.order)).size === fields.length, message: 'AI input field order values must be unique.' },
      { validator: (fields: Array<{ min: number | null; max: number | null }>) => fields.every(field => field.min === null || field.max === null || field.min <= field.max), message: 'AI input field min must not exceed max.' },
    ],
  },
  preprocessingVersion: { type: String, trim: true, maxlength: 100, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw', collection: 'ai_input_schemas' });

schema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_ai_input_schema' },
);

export const AiInputSchema = model('AiInputSchema', schema);
