import { describe, expect, it } from 'vitest';
import { tone } from './wqi';

describe('WQI classification', () => {
  it('maps scores to the six official classes at their boundaries, grey without a WQI', () => {
    expect([100, 91, 90, 76, 75, 51, 50, 26, 25, 10, 9, 0].map(score => tone(score)))
      .toEqual(['exc', 'exc', 'good', 'good', 'fair', 'fair', 'poor', 'poor', 'vpoor', 'vpoor', 'heavy', 'heavy']);
    expect(tone(null)).toBe('none');
    expect(tone(undefined)).toBe('none');
  });
});
