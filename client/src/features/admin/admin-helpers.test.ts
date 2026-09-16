import { describe, expect, it } from 'vitest';
import { formNumber, vietnamTimestamp } from './admin-helpers';

describe('Admin form values', () => {
  it('preserves genuine zero and leaves missing measurements invalid', () => {
    const form = new FormData();
    form.set('zero', '0');
    form.set('empty', '');
    form.set('spaces', '  ');
    expect(formNumber(form, 'zero')).toBe(0);
    expect(formNumber(form, 'empty')).toBeNaN();
    expect(formNumber(form, 'spaces')).toBeNaN();
    expect(formNumber(form, 'missing')).toBeNaN();
  });

  it('interprets explicitly labelled Vietnam time independently of the computer timezone', () => {
    expect(new Date(vietnamTimestamp('2026-05-01T00:00')).toISOString()).toBe('2026-04-30T17:00:00.000Z');
    expect(vietnamTimestamp('2026-05-01T08:15:30')).toBe('2026-05-01T08:15:30+07:00');
  });
});
