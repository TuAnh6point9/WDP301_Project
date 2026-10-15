import { describe, expect, it } from 'vitest';
import { predictionInputSchema, aiResultSchema, rawColumns } from './index.js';

const parameters = { coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 };
const unitBasis = 'training-source-unverified';
const result = { wqi: 51, rawWqi: 50.5, qualityClass: 'Trung bình', modelVersion: 'callisto 2.0',
  predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64),
  classificationVersion: 'VN_WQI_1460_2019', referenceBasis: 'lecturer-provided', unitStatus: 'unverified' };

describe('lecturer CatBoost contract', () => {
  it('accepts the actual six artifact inputs without claiming verified units', () => {
    expect(predictionInputSchema.parse({ parameters, unitBasis })).toEqual({ parameters, unitBasis });
  });
  it('rejects substituting BOD5 or Temp for COD or Amoni', () => {
    const withoutCod = { coliform: 5000, nh4: 0.2, ph: 7.2, po4: 0.3, do: 5.7 };
    const withoutAmoni = { coliform: 5000, ph: 7.2, po4: 0.3, do: 5.7, cod: 25 };
    expect(predictionInputSchema.safeParse({ parameters: { ...withoutCod, bod5: 5 }, unitBasis }).success).toBe(false);
    expect(predictionInputSchema.safeParse({ parameters: { ...withoutAmoni, temp: 28 }, unitBasis }).success).toBe(false);
  });
  it('checks raw rounding, classification and native model provenance', () => {
    expect(aiResultSchema.safeParse(result).success).toBe(true);
    expect(aiResultSchema.safeParse({ ...result, rawWqi: 49.5 }).success).toBe(false);
    expect(aiResultSchema.safeParse({ ...result, rawWqi: -0.0000001 }).success).toBe(false);
    expect(aiResultSchema.safeParse({ ...result, algorithm: 'HistGradientBoosting' }).success).toBe(false);
    expect(aiResultSchema.safeParse({ ...result, predictionSchemaVersion: 'old' }).success).toBe(false);
  });
  it('retains all eight raw observation names independently', () => {
    expect(rawColumns).toEqual(['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms']);
  });
});
