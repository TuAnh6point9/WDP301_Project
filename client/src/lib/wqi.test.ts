import { describe, expect, it } from 'vitest';
import { quality } from './wqi';

describe('WQI classification', () => {
  it('maps scores to the five design classes at their boundaries', () => {
    expect([100, 91, 90, 76, 75, 51, 50, 26, 25, 0].map(score => quality(score).key))
      .toEqual(['exc', 'exc', 'good', 'good', 'fair', 'fair', 'poor', 'poor', 'vpoor', 'vpoor']);
  });
});
