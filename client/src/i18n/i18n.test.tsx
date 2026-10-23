// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { USER_MESSAGES, getVnWqiQualityClass, qualityClassLabel } from '@wqi/contracts';
import { catalog } from './catalog';
import { changeLocale, currentLocale, displayText, formatNumber, i18n, LANGUAGE_STORAGE_KEY, msg, qualityLabel, resources, storedLocale, useLocale } from './index';
import { LanguageSwitcher } from './LanguageSwitcher';
import { errorSource, errorText, messageText } from './messages';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { nativeValidationHandlers } from '@/lib/nativeValidation';
import { calculationCsv } from '@/features/predictions/snapshotFields';
import { formatDateTime } from '@/lib/format';
import type { Calculation } from '@/features/predictions/types';
import { printInEnglish } from './printing';

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('vi');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('bundled Vietnamese–English resources', () => {
  it('defaults to Vietnamese and accepts only explicitly supported stored preferences', () => {
    expect(storedLocale()).toBe('vi');
    for (const value of ['en-US', 'fr', 'constructor', '', 'null']) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
      expect(storedLocale()).toBe('vi');
    }
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    expect(storedLocale()).toBe('en');
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    expect(currentLocale()).toBe('vi');
    expect(document.documentElement.lang).toBe('vi');
  });
  it('contains complete nonempty pairs with identical interpolation placeholders and semantic keys', () => {
    expect(Object.keys(resources.en.translation)).toEqual(Object.keys(resources.vi.translation));
    const params = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map(match => match[1]).sort();
    for (const [key, pair] of Object.entries(catalog)) {
      expect(key).toMatch(/^[a-z]+\.[a-zA-Z0-9]+(?:_one)?$/);
      expect(pair[0].trim(), key).not.toBe('');
      expect(pair[1].trim(), key).not.toBe('');
      expect(params(pair[0]), key).toEqual(params(pair[1]));
    }
  });
  it('provides Vietnamese fallback for a missing English translation without a network request', async () => {
    i18n.addResource('vi', 'translation', 'testing.fallback', 'Nội dung dự phòng');
    await i18n.changeLanguage('en');
    expect(i18n.t('testing.fallback')).toBe('Nội dung dự phòng');
    expect(msg('excel.calculateRows', { count: 1 })).toBe('Calculate 1 valid row');
    expect(msg('excel.calculateRows', { count: 2 })).toBe('Calculate 2 valid rows');
  });
  it('preserves scientific text and formats displayed numbers without converting measurements', async () => {
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(displayText('Coliforms')).toBe('Coliforms');
    expect(displayText('AH1')).toBe('AH1');
    expect(displayText('mg/L as N')).toBe('mg/L as N');
    const timestamp = '2026-10-20T03:00:00Z';
    const english = formatDateTime(timestamp, 'en');
    await i18n.changeLanguage('en');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    expect(formatDateTime(timestamp)).toBe(english);
  });
});

describe('language preference and live switching', () => {
  it('changes labels, pressed state, html lang and storage without replacing a draft input', () => {
    function Draft() {
      useLocale();
      return <><LanguageSwitcher/><label>{msg('users.name')}<input aria-label="draft" defaultValue=""/></label></>;
    }
    render(<Draft/>);
    const input = screen.getByLabelText('draft');
    fireEvent.change(input, { target: { value: 'Tên do người dùng nhập' } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByLabelText('draft')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('Tên do người dùng nhập');
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
  it('synchronizes another tab and resets to Vietnamese when storage is cleared or unsupported', () => {
    render(<LanguageSwitcher/>);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'en' })));
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Language');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'bad' })));
    expect(currentLocale()).toBe('vi');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'en' })));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })));
    expect(currentLocale()).toBe('vi');
  });
  it('works in memory when storage read/write are blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(storedLocale()).toBe('vi');
    render(<LanguageSwitcher/>);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(currentLocale()).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }));
    expect(currentLocale()).toBe('vi');
  });
});

describe('errors, WQI and export compatibility', () => {
  it('translates every shared user message and gives API codes priority over misleading text', async () => {
    for (const source of Object.values(USER_MESSAGES)) {
      expect(messageText(source), source).not.toBe(source);
    }
    const error = Object.assign(new Error(USER_MESSAGES.INVALID_NUMBER), { code: 'INVALID_CREDENTIALS', status: 401 });
    expect(errorText(error)).toBe('Email hoặc mật khẩu không đúng.');
    expect(errorSource(error)).toBe(USER_MESSAGES.INVALID_CREDENTIALS);
    expect(messageText('Internal stack CODE_123 mongodb://secret')).toBe(msg('messages.invalidData'));
    expect(messageText('PH: Only numeric cells are accepted.')).toBe('PH: Chỉ chấp nhận ô chứa số.');
    expect(messageText('Coliforms: Value must be at least 0.')).toBe('Coliforms: Giá trị tối thiểu là 0.');
    expect(messageText('Cell C12 contains a formula. Please use the original value.')).toContain('C12');
    await i18n.changeLanguage('en');
    expect(messageText('PH: Only numeric cells are accepted.')).toBe('PH: Only numeric cells are accepted.');
  });
  it('updates an existing native validation error without editing the field value', () => {
    render(<><LanguageSwitcher/><form {...nativeValidationHandlers}><input type="number" aria-label="number" required/></form></>);
    const input = screen.getByLabelText('number') as HTMLInputElement;
    fireEvent.invalid(input);
    expect(input.validationMessage).toBe('Vui lòng nhập số.');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(input.validationMessage).toBe('Please enter a number.');
    expect(input.value).toBe('');
    fireEvent.input(input, { target: { value: '7.2' } });
    expect(input.validity.customError).toBe(false);
  });
  it('preserves classification boundaries, enums and English export values', () => {
    for (const wqi of [0, 9, 10, 25, 26, 50, 51, 75, 76, 90, 91, 100]) {
      const stored = getVnWqiQualityClass(wqi);
      expect(qualityLabel(stored)).toBe(stored);
      expect(getVnWqiQualityClass(wqi)).toBe(stored);
    }
    render(<><LanguageSwitcher/><ClassificationBadge value="Rất tốt"/></>);
    const badge = document.querySelector('.badge')!;
    const style = badge.getAttribute('style');
    expect(badge.textContent).toBe('Rất tốt');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(badge.textContent).toBe(qualityClassLabel('Rất tốt'));
    expect(badge.getAttribute('style')).toBe(style);
    const row: Calculation = { id: 'id', at: '2026-10-20T03:00:00Z', inputs: { ph: 7.2, coliform: 5000, nh4: .2, po4: .3, do: 5.7, cod: 25 }, unitBasis: 'training-source-unverified', wqi: 91, qualityClass: 'Rất tốt', modelVersion: 'callisto 2.0', version: 0 } as Calculation;
    const english = calculationCsv([row]);
    act(() => changeLocale('vi'));
    expect(calculationCsv([row])).toEqual(english);
    expect(english[0]).toContain('Calculated At');
    expect(english[1]).toContain('Very good');
  });
  it('prints in English and restores the prior language and saved preference even on failure', () => {
    function Content() { useLocale(); return <p>{msg('common.home')}</p>; }
    render(<Content/>);
    changeLocale('vi');
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    vi.spyOn(window, 'print').mockImplementation(() => {
      expect(currentLocale()).toBe('en');
      expect(screen.getByText('Home')).toBeTruthy();
    });
    act(() => printInEnglish());
    expect(screen.getByText('Trang chủ')).toBeTruthy();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(saved);
    vi.mocked(window.print).mockImplementation(() => { throw new Error('printer'); });
    expect(() => act(() => printInEnglish())).toThrow('printer');
    expect(currentLocale()).toBe('vi');
  });
});
