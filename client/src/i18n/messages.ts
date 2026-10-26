import { apiErrorMessage, userErrorMessage } from '@wqi/contracts';
import { catalog, type TranslationKey } from './catalog';
import { currentLocale, displayText, msg } from './index';

const known = new Set<string>(Object.values(catalog).flatMap(pair => [...pair]));
// Stored legacy rows contain English issues, not codes. Recognize only application-owned templates.
const patterns: [RegExp, TranslationKey, string[]][] = [
  [/^Value must be between ([-\d.e+]+) and ([-\d.e+]+)\.$/, 'messages.range', ['min', 'max']],
  [/^Value must be at least ([-\d.e+]+)\.$/, 'messages.minimum', ['min']],
  [/^Value cannot exceed ([-\d.e+]+)\.$/, 'messages.maximum', ['max']],
  [/^Please enter at least (\d+) characters\.$/, 'messages.minLength', ['min']],
  [/^Please enter no more than (\d+) characters\.$/, 'messages.maxLength', ['max']],
  [/^Please choose a file no larger than (\d+) MB\.$/, 'messages.fileSize', ['mb']],
  [/^Please choose a file with no more than ([\d,]+) data rows\.$/, 'messages.rowLimit', ['count']],
  [/^Please narrow the filters to at most ([\d,]+) records\.$/, 'messages.exportLimit', ['count']],
  [/^Cell ([A-Z]+\d+) contains a formula\. Please use the original value\.$/, 'messages.formulaCell', ['cell']],
  [/^The value in cell ([A-Z]+\d+) is invalid\. Please check and try again\.$/, 'messages.invalidCell', ['cell']],
];
export function messageText(source: string): string {
  if (!source) return '';
  if (known.has(source)) return displayText(source);
  const station = source.match(/^([A-Z0-9_-]{2,40}) (updated|added)$/);
  if (station) return msg(station[2] === 'updated' ? 'stations.updated' : 'stations.added', { code: station[1] });
  for (const [pattern, key, names] of patterns) {
    const match = source.match(pattern);
    if (match) return msg(key, Object.fromEntries(names.map((name, index) => [name,
      name === 'count' && currentLocale() === 'vi' ? match[index + 1].replaceAll(',', '.') : match[index + 1]])));
  }
  const column = source.match(/^(PH|COD|DO|Amoni|Phosphat|Coliforms|Temp|BOD5): (.+)$/);
  if (column) return `${column[1]}: ${messageText(column[2])}`;
  // Only recursively split exact known sentences, never echo arbitrary server error text.
  const sentences = source.match(/[^.!?]+[.!?](?:\s|$)/g);
  if (sentences && sentences.map(s => s.trim()).join(' ') === source.trim() && sentences.every(s => known.has(s.trim()))) {
    return sentences.map(s => displayText(s.trim())).join(' ');
  }
  return msg('messages.invalidData');
}
/** API code takes precedence over text. Keep raw errors in state and translate when rendering. */
export function errorSource(error: unknown, fallback?: string): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return apiErrorMessage('status' in error && typeof error.status === 'number' ? error.status : 0, error.code);
  }
  return userErrorMessage(error, fallback);
}
export function errorText(error: unknown, fallback?: string): string { return messageText(errorSource(error, fallback)); }
