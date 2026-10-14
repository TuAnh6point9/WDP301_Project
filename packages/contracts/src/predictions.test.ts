import { describe, expect, it } from 'vitest';
import * as contracts from './index.js';

const parameters = { ph: 7, do: 6, cod: 3, nh4: 0.1, po4: 0.1, coliform: 100 };
const unitBasis = 'training-source-unverified';
const result = { wqi: 91, qualityClass: 'Rất tốt', modelVersion: 'research-1', classificationVersion: 'VN_WQI_1460_2019', referenceBasis: 'lecturer-provided', unitStatus: 'unverified', predictionSchemaVersion: 'catboost-top6-amoni-v1', algorithm: 'CatBoost', artifactSha256: 'a'.repeat(64), rawWqi: 91 };

describe('prediction contract', () => {
  it('accepts the six approved prediction measurements and explicit basis', () => {
    expect(contracts.predictionInputSchema.parse({ parameters, unitBasis })).toEqual({ parameters, unitBasis });
  });
  it.each(['bod5', 'tss', 'temp'])('rejects legacy or raw %s measurements in prediction inputs', key => {
    expect(contracts.predictionInputSchema.safeParse({ parameters: { ...parameters, [key]: 5 }, unitBasis }).success).toBe(false);
  });
  it.each([['ph', 15], ['do', -1], ['ph', NaN], ['po4', Infinity], ['coliform', '100']])('rejects invalid %s value %s', (key, value) => {
    expect(contracts.predictionParametersSchema.safeParse({ ...parameters, [key]: value }).success).toBe(false);
  });
  it('has no invented upper concentration limit or coercion of empty values', () => {
    expect(contracts.predictionParametersSchema.safeParse({ ...parameters, coliform: 1000000 }).success).toBe(true);
    expect(contracts.predictionParametersSchema.safeParse({ ...parameters, cod: '' }).success).toBe(false);
  });
  it('keeps the historical record contract independent', () => {
    expect(contracts.recordSchema.safeParse({ measuredAt: '2026-10-08T00:00:00Z', parameters: { ph: 7, do: 5, bod5: 2, cod: 3, tss: 4, nh4: 0.1 }, unitBasis: 'mg/L; NH4+ as ion' }).success).toBe(true);
  });
  it.each([[100, 'Rất tốt'], [91, 'Rất tốt'], [90.5, 'Rất tốt'], [90.49, 'Tốt'], [76, 'Tốt'], [75, 'Trung bình'], [51, 'Trung bình'], [50, 'Xấu'], [26, 'Xấu'], [25, 'Kém'], [10, 'Kém'], [9, 'Ô nhiễm rất nặng'], [0, 'Ô nhiễm rất nặng']] as const)('classifies %s after rounding as %s', (value, quality) => {
    expect(contracts.getVnWqiQualityClass(value)).toBe(quality);
  });
  it('requires trustworthy research provenance and consistent class', () => {
    expect(contracts.aiResultSchema.safeParse(result).success).toBe(true);
    expect(contracts.aiResultSchema.safeParse({ ...result, qualityClass: 'Tốt' }).success).toBe(false);
    expect(contracts.aiResultSchema.safeParse({ ...result, wqi: 91.2 }).success).toBe(false);
    expect(contracts.aiResultSchema.safeParse({ ...result, wqi: 101 }).success).toBe(false);
    expect(contracts.aiResultSchema.safeParse({ ...result, wqi: Infinity }).success).toBe(false);
    expect(contracts.aiResultSchema.safeParse({ ...result, classificationVersion: 'legacy' }).success).toBe(false);
    expect(contracts.aiResultSchema.safeParse({ ...result, referenceBasis: 'observed' }).success).toBe(false);
  });
});
