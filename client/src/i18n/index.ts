import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { catalog, type Locale, type TranslationKey, type MessageDescriptor } from './catalog';

export type { Locale, TranslationKey, MessageDescriptor } from './catalog';
export const LANGUAGE_STORAGE_KEY = 'wqi.language';
export function storedLocale(): Locale {
  try { return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'vi'; }
  catch { return 'vi'; }
}
export const resources = {
  vi: { translation: Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, values[1]])) },
  en: { translation: Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, values[0]])) },
};
// Bundled resources initialize synchronously, before React's first render. No detection/network plugin.
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources, lng: storedLocale(), fallbackLng: 'vi', supportedLngs: ['vi', 'en'],
  keySeparator: false, initAsync: false, interpolation: { escapeValue: false },
  returnNull: false, returnEmptyString: false,
});
export function currentLocale(): Locale { return i18n.resolvedLanguage === 'en' ? 'en' : 'vi'; }
export function msg(key: TranslationKey, params?: Record<string, unknown>): string {
  return i18n.t(key, params);
}
export function message(value: MessageDescriptor): string { return msg(value.key, value.params); }
export function useLocale(): Locale {
  useTranslation(undefined, { i18n });
  return currentLocale();
}
export function changeLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, locale); } catch { /* Keep the in-memory choice. */ }
}
export function localeName(locale: Locale = currentLocale()): 'vi-VN' | 'en-US' { return locale === 'vi' ? 'vi-VN' : 'en-US'; }
export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale: Locale = currentLocale()) {
  return new Intl.NumberFormat(localeName(locale), options).format(value);
}
export function syncDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = currentLocale();
  document.title = currentLocale() === 'vi' ? 'WQI An Kim Hải' : 'WQI An Kim Hai';
  document.querySelector('meta[name="description"]')?.setAttribute('content', msg('metadata.description'));
}
i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage();
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) {
    void i18n.changeLanguage(event.newValue === 'en' ? 'en' : 'vi');
  }
});

const sourceKeys = new Map<string, TranslationKey>(Object.entries(catalog).map(([key, values]) => [values[0], key as TranslationKey]));
/** Compatibility for existing trusted label tables; user-entered data must never pass through this. */
export function displayText(source: string): string;
export function displayText(source: number): number;
export function displayText(source: string | number): string | number {
  if (typeof source !== 'string') return source;
  const key = sourceKeys.get(source);
  return key ? msg(key) : source;
}

const qualityKeys: Record<string, TranslationKey> = {
  'Rất tốt': 'quality.veryGood', 'Tốt': 'quality.good', 'Trung bình': 'quality.medium',
  'Xấu': 'quality.poor', 'Kém': 'quality.bad', 'Ô nhiễm rất nặng': 'quality.heavilyPolluted',
};
export function qualityLabel(value: string): string {
  return Object.hasOwn(qualityKeys, value) ? msg(qualityKeys[value]) : displayText(value);
}
