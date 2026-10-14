import { Schema, model } from 'mongoose';
import { PREDICTION_UNIT_BASIS, PREDICTION_SCHEMA_VERSION, LEGACY_PREDICTION_UNIT_BASIS, VN_WQI_CLASSIFICATION_VERSION, vnWqiQualityClasses, predictionParametersSchema } from '@wqi/contracts';
const concentration = { type: Number, min: 0, required: true, validate: Number.isFinite };
const parametersDefinition = {
  ph: { type: Number, min: 0, max: 14, required: true, validate: Number.isFinite },
  do: concentration, cod: { ...concentration, required: false }, bod5: { ...concentration, required: false },
  nh4: concentration, po4: { ...concentration, required: false }, coliform: { ...concentration, required: false },
  tss: { ...concentration, required: false },
};
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parameters: { type: new Schema(parametersDefinition, { _id: false, strict: 'throw' }), required: true },
  unitBasis: { type: String, enum: [PREDICTION_UNIT_BASIS, LEGACY_PREDICTION_UNIT_BASIS, 'mg/L; NH4+ as ion'], required: true },
  wqi: { type: Number, min: 0, max: 100, required: true, validate: Number.isInteger }, qualityClass: { type: String, enum: vnWqiQualityClasses, required: true },
  modelVersion: { type: String, required: true }, classificationVersion: { type: String, enum: [VN_WQI_CLASSIFICATION_VERSION], required: true },
  referenceBasis: { type: String, enum: ['formula-derived', 'lecturer-provided'], required: true },
  unitStatus: { type: String, enum: ['confirmed', 'assumed-for-research', 'unverified'], required: true },
  predictionSchemaVersion: { type: String, enum: [PREDICTION_SCHEMA_VERSION] },
  rawWqi: { type: Number, min: 0, max: 100, validate: Number.isFinite },
  algorithm: { type: String, enum: ['CatBoost'] }, artifactSha256: { type: String, match: /^[a-f\d]{64}$/ },
}, { timestamps: true, strict: 'throw' });
schema.pre('validate', function () {
  // New documents may only be created under the current contract; legacy reads remain untouched.
  if (!this.isNew) return;
  const parsed = predictionParametersSchema.safeParse(this.toObject().parameters);
  if (!parsed.success || this.predictionSchemaVersion !== PREDICTION_SCHEMA_VERSION || this.algorithm !== 'CatBoost'
      || this.unitBasis !== PREDICTION_UNIT_BASIS || this.unitStatus !== 'unverified'
      || this.referenceBasis !== 'lecturer-provided' || !this.artifactSha256 || this.rawWqi == null
      || Math.round(this.rawWqi) !== this.wqi) this.invalidate('parameters', 'New predictions require the current CatBoost contract');
});
schema.index({ userId: 1, createdAt: -1 });
export const Prediction = model('Prediction', schema);
