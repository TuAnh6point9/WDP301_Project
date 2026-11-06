import { describe, expect, it } from 'vitest';
import { catalog } from '@/i18n/catalog';
import { VI_MESSAGES, vietnameseIssue } from '../src/modules/prediction-batches/export-vi.js';

describe('Vietnamese text in the batch result file', () => {
  it('uses the same Vietnamese sentences as the web page, so the two never drift apart', () => {
    const pairs = Object.values(catalog).map(([en, vi]) => [en, vi]);
    for (const pair of Object.entries(VI_MESSAGES)) expect(pairs).toContainEqual(pair);
  });
  it('translates column issues, numeric limits and model row errors, and hides unknown text', () => {
    expect(vietnameseIssue('PH: pH must be between 0 and 14.')).toBe('PH: pH phải nằm trong khoảng 0 đến 14.');
    expect(vietnameseIssue('Coliforms: Value must be at least 1.')).toBe('Coliforms: Giá trị tối thiểu là 1.');
    expect(vietnameseIssue('COD: Value cannot exceed 500.')).toBe('COD: Giá trị không được vượt quá 500.');
    expect(vietnameseIssue('DO: Value must be between 0 and 20.')).toBe('DO: Giá trị phải từ 0 đến 20.');
    expect(vietnameseIssue('The model did not return a valid WQI.')).toBe('Mô hình không trả về WQI hợp lệ.');
    expect(vietnameseIssue('Something went wrong in a stack trace')).toBe('Một số dữ liệu không hợp lệ. Vui lòng kiểm tra và thử lại.');
  });
});
