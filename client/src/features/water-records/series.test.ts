import { describe, expect, it } from 'vitest';
import { importColumns } from '@wqi/contracts';
import { HISTORY_CSV_HEADER } from './series';

describe('monitoring data CSV', () => {
  it('uses the Vietnamese column names of the data-entry template, in its order', () => {
    expect(HISTORY_CSV_HEADER).toEqual(['Mã đợt', 'Mã trạm', 'Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD', 'WQI']);
    expect(HISTORY_CSV_HEADER.every(name => (importColumns as readonly string[]).includes(name))).toBe(true);
  });
});
