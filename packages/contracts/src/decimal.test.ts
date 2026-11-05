import { describe, expect, it } from 'vitest';
import { isNotDetected, parseDecimal } from './index.js';

// Decision 24 (29/10/2026): the decimal mark is "."; a "," is read as "." with no thousands guess.
describe('parseDecimal', () => {
  it.each([
    [5.2, 5.2], ['5,2', 5.2], ['6.6', 6.6], [' 7,2 ', 7.2], ['1,234', 1.234], [0, 0], ['-1', -1],
  ])('reads %j as %d', (value, expected) => expect(parseDecimal(value)).toBe(expected));
  // Preprocessing v1 (05/11/2026): a value below the detection limit counts at the limit, as the CCME WQI manual (2017) does.
  it.each([['<0,1', 0.1], ['< 0.05', 0.05], ['<2', 2]])('reads %j at its detection limit %d', (value, expected) => expect(parseDecimal(value)).toBe(expected));
  it.each(['1.234,5', '5,2 mg/L', '<', '<-1', 'KPH', '0x10', 'abc', '=2+3'])('marks %j as invalid', value => expect(parseDecimal(value)).toBeNaN());
  it('tells "not detected" with no number apart from other text', () => {
    for (const value of ['KPH', ' kph ', 'Không phát hiện']) expect(isNotDetected(value)).toBe(true);
    for (const value of ['abc', '<0,1', '', null, 0]) expect(isNotDetected(value)).toBe(false);
  });
  it.each(['', '   ', null, undefined])('treats %j as empty', value => expect(parseDecimal(value)).toBeUndefined());
});
