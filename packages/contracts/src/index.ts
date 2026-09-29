import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');
const concentration = z.number().finite().min(0, 'Giá trị phải không âm');
export const parametersSchema = z.object({
  ph: z.number().finite().min(0).max(14), do: concentration,
  bod5: concentration, cod: concentration, tss: concentration, nh4: concentration,
}).strict();
export type Parameters = z.infer<typeof parametersSchema>;
export const parameterLabels: Record<keyof Parameters, string> = {
  ph: 'pH', do: 'DO', bod5: 'BOD5', cod: 'COD', tss: 'TSS', nh4: 'NH4+',
};
export const parameterKeys = Object.keys(parameterLabels) as (keyof Parameters)[];

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
  unitBasis: z.literal('mg/L; NH4+ as ion'),
}).strict();
export const normalizeSchema = recordSchema.extend({ stationId: objectId, sourceNote: z.string().trim().min(10).max(2000) }).strict();
export const reviewSchema = z.object({ status: z.enum(['verified', 'rejected']), note: z.string().trim().min(3).max(1000) }).strict();
export type WaterRecord = {
  _id: string; stationId: Station | string; measuredAt: string; parameters: Parameters;
  unitBasis: string; validationStatus: 'pending' | 'verified' | 'rejected';
  wqi: number | null; qualityClass: string | null; version: number;
  source: { kind: 'manual' | 'excel'; rowId?: string; note?: string };
};
export const rawColumns = ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms'] as const;
export type RawColumn = typeof rawColumns[number];
export type RawValues = Record<RawColumn, number | string | null>;
export type ImportedRow = {
  _id: string; batchId: string; rowNumber: number; values: RawValues;
  issues: string[]; waterRecordId?: string | null;
};
export type ImportBatch = { _id: string; fileName: string; rowCount: number; issueCount: number; createdAt: string; status: string };
export const aiResultSchema = z.object({
  wqi: z.number().finite().min(0).max(100), qualityClass: z.string().trim().min(1).max(120),
  modelVersion: z.string().trim().min(1).max(100), classificationVersion: z.string().trim().min(1).max(100),
}).strict();
export type AiInputField = {
  key: string; label: string; order: number; sourceColumn: string | null;
  unit: string | null; chemicalBasis: string | null;
  unitStatus: 'confirmed' | 'provisional' | 'unknown'; min: number | null; max: number | null;
};
export type AiInputSchema = {
  _id: string; version: string; name: string; status: 'draft' | 'active' | 'retired';
  fields: AiInputField[]; preprocessingVersion: string | null; createdBy: string;
  createdAt: string; updatedAt: string;
};
export type PredictionInputSnapshot = Pick<AiInputField, 'key' | 'label' | 'unit' | 'chemicalBasis' | 'order'> & { value: number };
export type Prediction = z.infer<typeof aiResultSchema> & {
  _id: string; parameters: Parameters; createdAt: string;
  inputSchemaId?: string | null; inputSchemaVersion?: string | null;
  inputSnapshot?: PredictionInputSnapshot[]; preprocessingVersion?: string | null;
};
export type User = { _id: string; name: string; email: string; role: 'user' | 'admin'; isActive: boolean };
export type PageMeta = { page: number; limit: number; total: number; pages: number };
export type ApiResponse<T> = { data: T; meta?: PageMeta };
export const userSchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().trim().email().toLowerCase().max(254),
  password: z.string().min(12).max(128), role: z.enum(['user', 'admin']).default('user'),
}).strict();
