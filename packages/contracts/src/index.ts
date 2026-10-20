import { z } from 'zod';
import { USER_MESSAGES } from './userMessages.js';
export * from './userMessages.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, USER_MESSAGES.INVALID_VALUE);
const concentration = z.number({ invalid_type_error: USER_MESSAGES.INVALID_NUMBER, required_error: USER_MESSAGES.REQUIRED_NUMBER }).finite(USER_MESSAGES.INVALID_NUMBER).min(0, USER_MESSAGES.NONNEGATIVE);
export const LEGACY_PREDICTION_UNIT_BASIS = 'mg/L; NH4 as N; PO4 as P; Coliform MPN/100mL' as const;
export const PREDICTION_UNIT_BASIS = 'training-source-unverified' as const;
export const PREDICTION_SCHEMA_VERSION = 'catboost-top6-amoni-v1' as const;
export const CATBOOST_FEATURE_ORDER = ['Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD'] as const;
export const CATBOOST_PARAMETER_ORDER = ['coliform', 'nh4', 'ph', 'po4', 'do', 'cod'] as const;
export const unitStatuses = ['confirmed', 'assumed-for-research', 'unverified'] as const;
export type UnitStatus = typeof unitStatuses[number];
export const predictionParametersSchema = z.object({
  ph: z.number({ invalid_type_error: USER_MESSAGES.INVALID_NUMBER, required_error: USER_MESSAGES.REQUIRED_NUMBER }).finite(USER_MESSAGES.INVALID_NUMBER).min(0, USER_MESSAGES.PH_RANGE).max(14, USER_MESSAGES.PH_RANGE), do: concentration,
  cod: concentration, nh4: concentration, po4: concentration, coliform: concentration,
}).strict();
export type PredictionParameters = z.infer<typeof predictionParametersSchema>;
// Historical records hold the same six measurements as predictions (decision 17/10/2026).
export const parametersSchema = predictionParametersSchema;
export type Parameters = PredictionParameters;
export const parameterLabels: Record<keyof Parameters, string> = { coliform: 'Coliform', nh4: 'Amoni', ph: 'pH', po4: 'Phosphat', do: 'DO', cod: 'COD' };
export const parameterKeys: (keyof Parameters)[] = [...CATBOOST_PARAMETER_ORDER];
export const predictionParameterSpec: Record<keyof PredictionParameters, { label: string; unit: string; min: number; max?: number }> = {
  ph: { label: 'pH', unit: '', min: 0, max: 14 },
  do: { label: 'DO', unit: 'source unit', min: 0 },
  cod: { label: 'COD', unit: 'source unit', min: 0 },
  nh4: { label: 'Amoni', unit: 'source unit', min: 0 },
  po4: { label: 'Phosphat', unit: 'source unit', min: 0 },
  coliform: { label: 'Coliform', unit: 'source unit', min: 0 },
};
export const predictionInputSchema = z.object({ parameters: predictionParametersSchema, unitBasis: z.literal(PREDICTION_UNIT_BASIS) }).strict();
export type PredictionInput = z.infer<typeof predictionInputSchema>;
export const vnWqiQualityClasses = ['Rất tốt', 'Tốt', 'Trung bình', 'Xấu', 'Kém', 'Ô nhiễm rất nặng'] as const;
export type VnWqiQualityClass = typeof vnWqiQualityClasses[number];
// Decision 1460/QĐ-TCMT (2019), section 1.4: round WQI before applying bands.
export function getVnWqiQualityClass(wqi: number): VnWqiQualityClass {
  if (!Number.isFinite(wqi) || wqi < 0 || wqi > 100) throw new RangeError('WQI must be between 0 and 100');
  const rounded = Math.round(wqi);
  if (rounded >= 91) return 'Rất tốt';
  if (rounded >= 76) return 'Tốt';
  if (rounded >= 51) return 'Trung bình';
  if (rounded >= 26) return 'Xấu';
  if (rounded >= 10) return 'Kém';
  return 'Ô nhiễm rất nặng';
}
// Stored classes stay Vietnamese (Mongo enum and saved data); screens and exports show these English names.
export const vnWqiQualityLabels: Record<VnWqiQualityClass, string> = {
  'Rất tốt': 'Very good', 'Tốt': 'Good', 'Trung bình': 'Medium', 'Xấu': 'Poor', 'Kém': 'Bad', 'Ô nhiễm rất nặng': 'Heavily polluted',
};
export const qualityClassLabel = (value: string) => Object.hasOwn(vnWqiQualityLabels, value) ? vnWqiQualityLabels[value as VnWqiQualityClass] : value;
export const predictionInputDomainSchema = z.object({
  ph: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  do: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  cod: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  nh4: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  po4: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
  coliform: z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
}).strict().refine(domain => Object.values(domain).every(range => range.min <= range.max), 'Invalid input domain');
export type PredictionInputDomain = z.infer<typeof predictionInputDomainSchema>;
export type PredictionStatus = {
  available: boolean; configured: boolean; reason?: string; modelVersion?: string;
  unitStatus?: UnitStatus; inputDomain?: PredictionInputDomain;
  predictionSchemaVersion?: typeof PREDICTION_SCHEMA_VERSION; algorithm?: 'CatBoost';
  artifactSha256?: string; referenceBasis?: 'lecturer-provided';
};

export const stationSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  administrativeArea: z.enum(['Hải Dương', 'Hải Phòng']),
  location: z.object({ type: z.literal('Point'), coordinates: z.tuple([
    z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90),
  ]) }).strict(),
}).strict();
export const stationUpdateSchema = stationSchema.omit({ code: true }).partial().extend({ isActive: z.boolean().optional() }).strict();
export type StationInput = z.infer<typeof stationSchema>;
export type Station = StationInput & { _id: string; isActive: boolean };

export const recordSchema = z.object({
  measuredAt: z.string().datetime({ offset: true }),
  parameters: parametersSchema,
  unitBasis: z.literal(PREDICTION_UNIT_BASIS),
}).strict();
// The six numbers are copied from the immutable raw row on the server; the admin supplies only metadata.
export const normalizeSchema = recordSchema.omit({ parameters: true, unitBasis: true }).extend({ stationId: objectId, sourceNote: z.string().trim().min(10).max(2000) }).strict();
export const reviewSchema = z.object({ status: z.enum(['verified', 'rejected']), note: z.string().trim().min(3).max(1000) }).strict();
export type WaterRecord = {
  _id: string; stationId: Station | string; measuredAt: string; parameters: Parameters;
  unitBasis: string; validationStatus: 'pending' | 'verified' | 'rejected';
  wqi: number | null; qualityClass: string | null; version: number;
  source: { kind: 'manual' | 'excel'; rowId?: string; note?: string };
  createdAt: string; reviewNote?: string | null;
};
export const rawColumns = ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms'] as const;
export type RawColumn = typeof rawColumns[number];
export const rawParameterColumns: Record<keyof Parameters, RawColumn> = { coliform: 'Coliforms', nh4: 'Amoni', ph: 'PH', po4: 'Phosphat', do: 'DO', cod: 'COD' };
export type RawValues = Record<RawColumn, number | string | null>;
export type ImportedRow = {
  _id: string; batchId: string; rowNumber: number; values: RawValues;
  issues: string[]; waterRecordId?: string | null;
};
export type ImportBatch = { _id: string; fileName: string; rowCount: number; issueCount: number; createdAt: string; status: string };
export const aiResultSchema = z.object({
  wqi: z.number().finite().int().min(0).max(100), qualityClass: z.enum(vnWqiQualityClasses),
  rawWqi: z.number().finite().min(0).max(100),
  modelVersion: z.string().trim().min(1).max(100),
  predictionSchemaVersion: z.literal(PREDICTION_SCHEMA_VERSION), algorithm: z.literal('CatBoost'),
  artifactSha256: z.string().regex(/^[a-f\d]{64}$/),
  referenceBasis: z.literal('lecturer-provided'), unitStatus: z.literal('unverified'),
}).strict().refine(result => result.wqi === Math.round(result.rawWqi) && result.qualityClass === getVnWqiQualityClass(result.wqi), { message: 'Raw WQI, rounding and quality class must agree', path: ['qualityClass'] });
// Read snapshots independently from the current write contract; never relabel legacy measurements.
export type Prediction = {
  _id: string; parameters: Record<string, number>; unitBasis: string; createdAt: string;
  wqi: number; qualityClass: string; modelVersion: string;
  referenceBasis?: string; unitStatus?: UnitStatus; predictionSchemaVersion?: string;
  rawWqi?: number; algorithm?: string; artifactSha256?: string;
};
export type User = { _id: string; name: string; email: string; role: 'user' | 'admin'; isActive: boolean };
export type PageMeta = { page: number; limit: number; total: number; pages: number };
export type ApiResponse<T> = { data: T; meta?: PageMeta };
export const userSchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().email().toLowerCase().max(254),
  password: z.string().min(12).max(128), role: z.enum(['user', 'admin']).default('user'),
}).strict();

export type AiResult = z.infer<typeof aiResultSchema>;
export const batchAiRowSchema = z.union([
  z.object({ rowNumber: z.number().int().min(2).max(1048576), result: aiResultSchema }).strict(),
  z.object({ rowNumber: z.number().int().min(2).max(1048576), error: z.object({ code: z.enum(['AI_INFERENCE_ERROR', 'AI_INPUT_OUTSIDE_DOMAIN', 'AI_OUTPUT_OUT_OF_RANGE']) }).strict() }).strict(),
]);
export type BatchAiRow = z.infer<typeof batchAiRowSchema>;
export const batchStatuses = ['preview', 'queued', 'running', 'paused', 'completed', 'completed_with_errors'] as const;
export type PredictionBatchStatus = typeof batchStatuses[number];
export type PredictionBatch = {
  _id: string; fileName: string; createdAt: string; status: PredictionBatchStatus;
  rowCount: number; validCount: number; invalidCount: number; successCount: number; errorCount: number;
  pauseCode?: string; modelSnapshot?: PredictionStatus;
};
export type PredictionBatchRow = {
  _id: string; rowNumber: number; values: RawValues; issues: string[];
  status: 'pending' | 'invalid' | 'success' | 'error'; result?: AiResult;
};
