import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLAG_MODEL_SHA256, inputFlag } from './index.js';

// Preprocessing v1 (05/11/2026): a flag only warns; it never blocks a row or changes a value.
describe('inputFlag', () => {
  it.each([[5.55, null], [5.54, 'ai-unreliable'], [8.5, null], [8.51, 'ai-unreliable'], [7.1, null], [0, 'ai-unreliable'], [14, 'ai-unreliable']])(
    'pH %d gives %s', (value, flag) => expect(inputFlag('ph', value)).toBe(flag));
  it.each([['do', 15.45, null], ['do', 15.46, 'likely-typo'], ['nh4', 121, null], ['nh4', 121.01, 'likely-typo'], ['po4', 22.05, null], ['po4', 22.06, 'likely-typo'],
    ['cod', 948, null], ['cod', 948.5, 'likely-typo'], ['do', 0, null], ['cod', 500, null]] as const)('%s %d gives %s', (key, value, flag) => expect(inputFlag(key, value)).toBe(flag));
  it('never flags Coliform, which reaches millions in real pollution', () => expect(inputFlag('coliform', 5_400_000)).toBeNull());
  it('leaves values it cannot read to validation', () => {
    expect(inputFlag('ph', Number.NaN)).toBeNull();
    expect(inputFlag('do', undefined)).toBeNull();
  });
  it('was measured on the model the AI service ships', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../ai/catboost.manifest.json', import.meta.url), 'utf8'));
    expect(manifest.artifactSha256).toBe(FLAG_MODEL_SHA256);
  });
});
