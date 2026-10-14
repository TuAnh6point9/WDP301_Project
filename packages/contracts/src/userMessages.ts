import type { ZodErrorMap, ZodIssue } from 'zod';

// Copy only: callers keep their existing validation, status codes and control flow.
export const USER_MESSAGES = {
  REQUIRED_NUMBER: 'Vui lòng nhập một số.',
  INVALID_NUMBER: 'Giá trị không hợp lệ. Vui lòng nhập một số.',
  NONNEGATIVE: 'Giá trị không được âm.',
  PH_RANGE: 'pH phải nằm trong khoảng 0–14.',
  REQUIRED: 'Vui lòng nhập thông tin.',
  INVALID_VALUE: 'Giá trị không hợp lệ, vui lòng kiểm tra lại.',
  INVALID_FORMAT: 'Giá trị không đúng định dạng, vui lòng kiểm tra lại.',
  INVALID_DATA: 'Dữ liệu chưa hợp lệ, vui lòng kiểm tra lại.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  SIGN_IN: 'Vui lòng đăng nhập để tiếp tục.',
  FORBIDDEN: 'Bạn chưa được phép thực hiện thao tác này.',
  ACCESS_DENIED: 'Bạn chưa được phép truy cập trang này.',
  ACCESS_DENIED_TITLE: 'Không thể truy cập',
  PAGE_NOT_FOUND: 'Không tìm thấy trang.',
  RESULT_NOT_FOUND: 'Không tìm thấy kết quả, vui lòng tính lại hoặc mở từ lịch sử.',
  NOT_FOUND: 'Không tìm thấy dữ liệu được yêu cầu.',
  RECORD_CHANGED: 'Dữ liệu đã thay đổi, vui lòng tải lại trước khi thử lại.',
  DUPLICATE: 'Thông tin này đã tồn tại.',
  EMAIL_EXISTS: 'Địa chỉ email này đã được sử dụng.',
  STATION_EXISTS: 'Mã trạm này đã tồn tại.',
  RATE_LIMITED: 'Vui lòng đợi một chút trước khi thử lại.',
  INTERNAL: 'Không thể xử lý yêu cầu, vui lòng thử lại sau.',
  UPSTREAM: 'Hiện chưa thể xử lý yêu cầu, vui lòng thử lại sau.',
  UNAVAILABLE: 'Chức năng này hiện chưa sẵn sàng, vui lòng thử lại sau.',
  NETWORK: 'Không thể kết nối, vui lòng thử lại sau.',
  TIMEOUT: 'Chưa nhận được phản hồi, vui lòng thử lại sau.',
  WQI_RETRY: 'Chưa nhận được kết quả, vui lòng kiểm tra lịch sử trước khi tính lại.',
  CSRF: 'Phiên thao tác đã hết hạn, vui lòng tải lại trang.',
  AI_UNAVAILABLE: 'Hiện chưa thể tính WQI, vui lòng thử lại sau.',
  AI_INVALID: 'Chưa nhận được kết quả hợp lệ, vui lòng thử lại sau.',
  AI_DOMAIN: 'Giá trị nằm ngoài khoảng được hỗ trợ, vui lòng kiểm tra lại.',
  STATUS_UNAVAILABLE: 'Chưa thể kiểm tra trạng thái.',
  STATUS_NOT_READY: 'Chưa sẵn sàng.',
  STATUS_NOT_CONFIGURED: 'Chưa được thiết lập.',
  SESSION_PENDING: 'Vui lòng đợi thao tác hiện tại hoàn tất.',
  SESSION_RESTORE: 'Chưa thể khôi phục phiên đăng nhập, vui lòng thử lại.',
  LOGIN_FAILED: 'Chưa thể đăng nhập, vui lòng thử lại.',
  LOGOUT_FAILED: 'Chưa thể đăng xuất, vui lòng thử lại.',
  LOAD_FAILED: 'Chưa thể tải dữ liệu, vui lòng thử lại.',
  PAGE_LOAD_TITLE: 'Không thể tải trang.',
  PAGE_LOAD_FAILED: 'Chưa thể tải trang, vui lòng tải lại và thử lại.',
  HISTORY_FAILED: 'Chưa thể tải lịch sử, vui lòng thử lại.',
  CALCULATE_FAILED: 'Chưa thể tính WQI, vui lòng thử lại.',
  SAVE_RECORD: 'Chưa thể lưu bản ghi, vui lòng thử lại.',
  ACTION_FAILED: 'Chưa thể hoàn tất thao tác, vui lòng thử lại.',
  RECALCULATE_FAILED: 'Chưa thể tính lại WQI, vui lòng thử lại.',
  DOWNLOAD_FAILED: 'Chưa thể tải tệp, vui lòng thử lại.',
  SAVE_STATION: 'Chưa thể lưu trạm, vui lòng thử lại.',
  SAVE_ACCOUNT: 'Chưa thể lưu tài khoản, vui lòng thử lại.',
  HEALTH_FAILED: 'Chưa thể kiểm tra hoạt động, vui lòng thử lại.',
  SAVE_BROWSER: 'Chưa thể lưu trên trình duyệt này, vui lòng thử lại.',
  READ_FILE: 'Chưa thể đọc tệp, vui lòng kiểm tra lại.',
  IMPORT_FAILED: 'Chưa thể nhập dữ liệu, vui lòng thử lại.',
  STATIONS_UNAVAILABLE: 'Chức năng lưu trạm hiện chưa sẵn sàng.',
  ACCOUNTS_UNAVAILABLE: 'Chức năng lưu tài khoản hiện chưa sẵn sàng.',
  RECORDS_UNAVAILABLE: 'Chức năng lưu bản ghi hiện chưa sẵn sàng.',
  DELETE_UNAVAILABLE: 'Chức năng xóa bản ghi hiện chưa sẵn sàng.',
  RECALCULATE_UNAVAILABLE: 'Chức năng tính lại WQI hiện chưa sẵn sàng.',
  IMPORT_UNAVAILABLE: 'Chức năng nhập Excel hiện chưa sẵn sàng.',
  ROLLBACK_UNAVAILABLE: 'Chức năng hoàn tác nhập dữ liệu hiện chưa sẵn sàng.',
  FILE_REQUIRED: 'Vui lòng chọn một tệp .xlsx.',
  UPLOAD_INVALID: 'Tệp tải lên chưa hợp lệ, vui lòng kiểm tra lại.',
  INVALID_WORKBOOK: 'Vui lòng chọn tệp .xlsx có một trang tính và đúng tám cột dữ liệu gốc.',
  WORKBOOK_LIMIT: 'Tệp có nội dung quá lớn hoặc không được hỗ trợ, vui lòng kiểm tra lại.',
  EMPTY_WORKBOOK: 'Tệp không có dòng dữ liệu, vui lòng kiểm tra lại.',
  IMPORT_IN_PROGRESS: 'Tệp đang được nhập, vui lòng đợi rồi tải lại danh sách.',
  ROW_NORMALIZED: 'Dòng dữ liệu đã được chuyển thành bản ghi, vui lòng sửa trong mục kiểm định.',
  SELF_LOCKOUT: 'Bạn không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập.',
  INVALID_RANGE: 'Thời gian bắt đầu phải trước thời gian kết thúc.',
  STEP_MISMATCH: 'Vui lòng nhập giá trị đúng khoảng cho phép.',
} as const;

export const rangeMessage = (min: number, max: number) => `Giá trị phải nằm trong khoảng ${min}–${max}.`;
export const minLengthMessage = (min: number | bigint) => `Vui lòng nhập ít nhất ${min} ký tự.`;
export const maxLengthMessage = (max: number | bigint) => `Vui lòng nhập không quá ${max} ký tự.`;
export const fileSizeMessage = (mb: number) => `Vui lòng chọn tệp không vượt quá ${mb} MB.`;
export const rowLimitMessage = (count: number) => `Vui lòng chọn tệp không vượt quá ${count.toLocaleString('vi-VN')} dòng dữ liệu.`;
export const formulaCellMessage = (cell: string) => `Ô ${cell} chứa công thức, vui lòng dùng giá trị gốc.`;
export const invalidCellMessage = (cell: string) => `Giá trị tại ô ${cell} không hợp lệ, vui lòng kiểm tra lại.`;
export const exportLimitMessage = (count: number) => `Vui lòng thu hẹp bộ lọc xuống tối đa ${count.toLocaleString('vi-VN')} bản ghi.`;
export const importNumberIssue = (field: string) => `${field}: ${USER_MESSAGES.INVALID_NUMBER}`;
export const importRangeIssue = (field: string) => `${field}: ${USER_MESSAGES.INVALID_VALUE}`;

export function validationIssueMessage(issue: ZodIssue): string {
  const field = String(issue.path.at(-1) ?? '').toLowerCase();
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'number') return issue.received === 'undefined' ? USER_MESSAGES.REQUIRED_NUMBER : USER_MESSAGES.INVALID_NUMBER;
    return issue.received === 'undefined' ? USER_MESSAGES.REQUIRED : USER_MESSAGES.INVALID_VALUE;
  }
  if (issue.code === 'not_finite') return USER_MESSAGES.INVALID_NUMBER;
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    if (issue.type === 'number') {
      if (field === 'ph') return USER_MESSAGES.PH_RANGE;
      if (issue.code === 'too_small' && issue.minimum === 0) return USER_MESSAGES.NONNEGATIVE;
      return issue.code === 'too_small' ? `Giá trị phải từ ${issue.minimum} trở lên.` : `Giá trị không được vượt quá ${issue.maximum}.`;
    }
    if (issue.type === 'string') return issue.code === 'too_small'
      ? issue.minimum === 1 ? USER_MESSAGES.REQUIRED : minLengthMessage(issue.minimum)
      : maxLengthMessage(issue.maximum);
  }
  if (issue.code === 'invalid_string') return USER_MESSAGES.INVALID_FORMAT;
  return USER_MESSAGES.INVALID_VALUE;
}
export const vietnameseErrorMap: ZodErrorMap = issue => ({ message: validationIssueMessage(issue as ZodIssue) });

const API_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: USER_MESSAGES.INVALID_CREDENTIALS, UNAUTHENTICATED: USER_MESSAGES.SIGN_IN,
  FORBIDDEN: USER_MESSAGES.FORBIDDEN, ORIGIN_REJECTED: USER_MESSAGES.FORBIDDEN, CSRF_REJECTED: USER_MESSAGES.CSRF,
  VALIDATION_ERROR: USER_MESSAGES.INVALID_DATA, INVALID_JSON: USER_MESSAGES.INVALID_DATA,
  NOT_FOUND: USER_MESSAGES.NOT_FOUND, RECORD_NOT_FOUND: USER_MESSAGES.NOT_FOUND, STATION_NOT_FOUND: USER_MESSAGES.NOT_FOUND, ROW_NOT_FOUND: USER_MESSAGES.NOT_FOUND,
  DUPLICATE: USER_MESSAGES.DUPLICATE, RECORD_CHANGED: USER_MESSAGES.RECORD_CHANGED, SELF_LOCKOUT: USER_MESSAGES.SELF_LOCKOUT,
  RATE_LIMITED: USER_MESSAGES.RATE_LIMITED, INTERNAL_ERROR: USER_MESSAGES.INTERNAL,
  NETWORK_ERROR: USER_MESSAGES.NETWORK, REQUEST_TIMEOUT: USER_MESSAGES.TIMEOUT,
  AI_TIMEOUT: USER_MESSAGES.TIMEOUT, AI_UNAVAILABLE: USER_MESSAGES.AI_UNAVAILABLE, AI_UPSTREAM_ERROR: USER_MESSAGES.AI_UNAVAILABLE,
  AI_MODEL_NOT_READY: USER_MESSAGES.AI_UNAVAILABLE, AI_NOT_CONFIGURED: USER_MESSAGES.AI_UNAVAILABLE,
  AI_INVALID_RESPONSE: USER_MESSAGES.AI_INVALID, AI_INPUT_OUTSIDE_DOMAIN: USER_MESSAGES.AI_DOMAIN,
  FILE_REQUIRED: USER_MESSAGES.FILE_REQUIRED, INVALID_WORKBOOK: USER_MESSAGES.INVALID_WORKBOOK,
  WORKBOOK_LIMIT: USER_MESSAGES.WORKBOOK_LIMIT, EMPTY_WORKBOOK: USER_MESSAGES.EMPTY_WORKBOOK,
  IMPORT_IN_PROGRESS: USER_MESSAGES.IMPORT_IN_PROGRESS, ROW_ALREADY_NORMALIZED: USER_MESSAGES.ROW_NORMALIZED,
  FILE_TOO_LARGE: fileSizeMessage(5), UPLOAD_ERROR: USER_MESSAGES.UPLOAD_INVALID, PAYLOAD_TOO_LARGE: USER_MESSAGES.WORKBOOK_LIMIT,
  ROW_LIMIT: rowLimitMessage(10000), EXPORT_LIMIT: exportLimitMessage(10000), INVALID_RANGE: USER_MESSAGES.INVALID_RANGE,
  FORMULA_NOT_ALLOWED: 'Tệp có ô chứa công thức, vui lòng dùng giá trị gốc.', UNSUPPORTED_CELL: USER_MESSAGES.INVALID_VALUE,
};
const STATUS_MESSAGES: Record<number, string> = {
  400: USER_MESSAGES.INVALID_DATA, 401: USER_MESSAGES.SIGN_IN, 403: USER_MESSAGES.FORBIDDEN, 404: USER_MESSAGES.NOT_FOUND,
  409: USER_MESSAGES.RECORD_CHANGED, 413: USER_MESSAGES.WORKBOOK_LIMIT, 422: USER_MESSAGES.INVALID_DATA,
  429: USER_MESSAGES.RATE_LIMITED, 500: USER_MESSAGES.INTERNAL, 502: USER_MESSAGES.UPSTREAM, 503: USER_MESSAGES.UNAVAILABLE, 504: USER_MESSAGES.TIMEOUT,
};
export function apiErrorMessage(status: number, code?: string): string {
  return (code && Object.hasOwn(API_MESSAGES, code) && API_MESSAGES[code]) || STATUS_MESSAGES[status] || USER_MESSAGES.INTERNAL;
}

const knownMessages = new Set<string>(Object.values(USER_MESSAGES));
Object.values(API_MESSAGES).forEach(message => knownMessages.add(message));
export function userErrorMessage(error: unknown, fallback: string = USER_MESSAGES.INTERNAL): string {
  if (error instanceof Error && knownMessages.has(error.message)) return error.message;
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return apiErrorMessage('status' in error && typeof error.status === 'number' ? error.status : 0, error.code);
  }
  return fallback;
}

/** Older servers/tests may send plain field messages; never echo arbitrary text. */
export function fieldErrorMessage(field: string, message: string): string {
  if (field.split('.').at(-1)?.toLowerCase() === 'ph' && /greater|less|range|khoảng|min|max|không âm/i.test(message)) return USER_MESSAGES.PH_RANGE;
  if (knownMessages.has(message)) return message;
  if (/không âm|non.?negative|greater than or equal to 0/i.test(message)) return USER_MESSAGES.NONNEGATIVE;
  return USER_MESSAGES.INVALID_NUMBER;
}
