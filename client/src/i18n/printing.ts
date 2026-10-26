import { flushSync } from 'react-dom';
import { currentLocale, i18n, type Locale } from './index';

let original: Locale | null = null;
/** Printing is an English document operation, not a change to the user's saved UI preference. */
function beforePrint() {
  if (original !== null) return;
  original = currentLocale();
  flushSync(() => { void i18n.changeLanguage('en'); });
}
function afterPrint() {
  if (original === null) return;
  const locale = original;
  original = null;
  flushSync(() => { void i18n.changeLanguage(locale); });
}
export function printInEnglish() {
  beforePrint();
  try { window.print(); } finally { afterPrint(); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
}
