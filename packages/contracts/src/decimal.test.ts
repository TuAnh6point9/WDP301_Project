import { describe, expect, it } from 'vitest';
import { parseDecimal } from './index.js';

// Decision 24 (29/10/2026): the decimal mark is "."; a "," is read as "." with no thousands guess.
describe('parseDecimal', () => {
  it.each([
    [5.2, 5.2], ['5,2', 5.2], ['6.6', 6.6], [' 7,2 ', 7.2], ['1,234', 1.234], [0, 0], ['-1', -1],
  ])('reads %j as %d', (value, expected) => expect(parseDecimal(value)).toBe(expected));
  it.each(['1.234,5', '5,2 mg/L', '<0,1', '0x10', 'abc', '=2+3'])('marks %j as invalid', value => expect(parseDecimal(value)).toBeNaN());
  it.each(['', '   ', null, undefined])('treats %j as empty', value => expect(parseDecimal(value)).toBeUndefined());
});
