import { describe, expect, it } from 'vitest';
import { excelFlow, excelStartIndex } from './excelGuideFlow';

describe('continuous Excel walkthroughs', () => {
  it('contains stable, unique steps in one continuous user flow', () => {
    const steps = excelFlow('excel-user');
    expect(steps).toHaveLength(13);
    expect(new Set(steps.map(step => step.id)).size).toBe(13);
    expect(steps.map(step => step.stage)).toEqual([
      'prepare', 'prepare', 'prepare', 'preview', 'preview', 'preview',
      'progress', 'progress', 'results', 'results', 'results', 'history', 'history',
    ]);
  });

  it('contains stable, unique steps in one continuous admin flow', () => {
    const steps = excelFlow('excel-admin');
    expect(steps).toHaveLength(14);
    expect(new Set(steps.map(step => step.id)).size).toBe(14);
    expect(steps.map(step => step.stage)).toEqual([
      'prepare', 'prepare', 'prepare', 'fill', 'fill', 'fill',
      'preview', 'preview', 'preview', 'overwrite', 'overwrite',
      'results', 'results', 'results',
    ]);
  });

  it.each([
    ['excel-user', 'prepare', 0], ['excel-user', 'preview', 3],
    ['excel-user', 'progress', 6], ['excel-user', 'results', 8],
    ['excel-user', 'history', 11], ['excel-admin', 'prepare', 0],
    ['excel-admin', 'fill', 3], ['excel-admin', 'preview', 6],
    ['excel-admin', 'overwrite', 9], ['excel-admin', 'results', 11],
  ] as const)('starts %s at %s from step %i', (id, stage, expected) => {
    expect(excelStartIndex(id, stage)).toBe(expected);
  });
});
