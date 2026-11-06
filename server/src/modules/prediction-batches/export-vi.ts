import { USER_MESSAGES as M } from '@wqi/contracts';

/** Rows store English issue text; the result file is Vietnamese only. Each pair matches client/src/i18n/catalog.ts (checked by a test). */
export const VI_MESSAGES: Record<string, string> = {
  [M.REQUIRED_NUMBER]: 'Vui lòng nhập số.',
  [M.INVALID_NUMBER]: 'Giá trị không hợp lệ. Vui lòng nhập số.',
  [M.NOT_DETECTED]: 'Hãy ghi ngưỡng phát hiện thay cho chữ này, ví dụ <0,05.',
  [M.NONNEGATIVE]: 'Giá trị không được âm.',
  [M.PH_RANGE]: 'pH phải nằm trong khoảng 0 đến 14.',
  [M.REQUIRED]: 'Vui lòng điền trường này.',
  [M.INVALID_VALUE]: 'Giá trị không hợp lệ. Vui lòng kiểm tra và thử lại.',
  'Value is outside the model input domain.': 'Giá trị ngoài miền đầu vào của mô hình.',
  'The model returned a WQI outside 0–100; the result was discarded.': 'Mô hình trả WQI ngoài 0–100; kết quả đã bị loại.',
  'The model did not return a valid WQI.': 'Mô hình không trả về WQI hợp lệ.',
  'Only numeric cells are accepted.': 'Chỉ chấp nhận ô chứa số.',
};
const UNKNOWN = 'Một số dữ liệu không hợp lệ. Vui lòng kiểm tra và thử lại.';
const limits: [RegExp, (...values: string[]) => string][] = [
  [/^Value must be between ([-\d.e+]+) and ([-\d.e+]+)\.$/, (min, max) => `Giá trị phải từ ${min} đến ${max}.`],
  [/^Value must be at least ([-\d.e+]+)\.$/, min => `Giá trị tối thiểu là ${min}.`],
  [/^Value cannot exceed ([-\d.e+]+)\.$/, max => `Giá trị không được vượt quá ${max}.`],
];

export function vietnameseIssue(text: string): string {
  const column = text.match(/^(Coliforms|Amoni|PH|Phosphat|DO|COD|Temp|BOD5): (.+)$/);
  if (column) return `${column[1]}: ${vietnameseIssue(column[2])}`;
  if (VI_MESSAGES[text]) return VI_MESSAGES[text];
  for (const [pattern, write] of limits) { const match = text.match(pattern); if (match) return write(...match.slice(1)); }
  return UNKNOWN;
}

/** A plain number typed as text ("5000", "7,2") is written as a number; "<0,3", "KPH" and formulas stay as typed. */
export function cellValue(value: number | string | null | undefined) {
  if (typeof value !== 'string') return value ?? null;
  return /^\s*[+-]?\d+([.,]\d+)?\s*$/.test(value) ? Number(value.trim().replace(',', '.')) : value;
}
