import type { ZodErrorMap, ZodIssue } from 'zod';

// Copy only: callers keep their existing validation, status codes and control flow.
export const USER_MESSAGES = {
  REQUIRED_NUMBER: 'Please enter a number.',
  INVALID_NUMBER: 'Invalid value. Please enter a number.',
  NONNEGATIVE: 'Value cannot be negative.',
  PH_RANGE: 'pH must be between 0 and 14.',
  REQUIRED: 'Please fill in this field.',
  INVALID_VALUE: 'Invalid value. Please check and try again.',
  INVALID_FORMAT: 'Invalid format. Please check and try again.',
  INVALID_DATA: 'Some data is invalid. Please check and try again.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  SIGN_IN: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  ACCESS_DENIED: 'You do not have permission to access this page.',
  ACCESS_DENIED_TITLE: 'Access denied',
  PAGE_NOT_FOUND: 'Page not found.',
  RESULT_NOT_FOUND: 'Result not found. Please calculate again or open it from history.',
  NOT_FOUND: 'The requested data was not found.',
  RECORD_CHANGED: 'The data has changed. Please reload before trying again.',
  DUPLICATE: 'This information already exists.',
  EMAIL_EXISTS: 'This email address is already in use.',
  STATION_EXISTS: 'This station code already exists.',
  RATE_LIMITED: 'Please wait a moment before trying again.',
  INTERNAL: 'The request could not be processed. Please try again later.',
  UPSTREAM: 'The request cannot be processed right now. Please try again later.',
  UNAVAILABLE: 'This feature is not available right now. Please try again later.',
  NETWORK: 'Could not connect. Please try again later.',
  TIMEOUT: 'No response was received. Please try again later.',
  WQI_RETRY: 'No result was received. Please check your history before calculating again.',
  CSRF: 'Your session has expired. Please reload the page.',
  AI_UNAVAILABLE: 'WQI cannot be calculated right now. Please try again later.',
  AI_INVALID: 'No valid result was received. Please try again later.',
  AI_DOMAIN: 'A value is outside the supported range. Please check and try again.',
  AI_OUT_OF_RANGE: 'The model returned a WQI outside 0–100, so the result was discarded and not saved.',
  STATUS_UNAVAILABLE: 'Status could not be checked.',
  STATUS_NOT_READY: 'Not ready.',
  STATUS_NOT_CONFIGURED: 'Not configured.',
  SESSION_PENDING: 'Please wait for the current action to finish.',
  SESSION_RESTORE: 'Could not restore your session. Please try again.',
  LOGIN_FAILED: 'Could not sign in. Please try again.',
  LOGOUT_FAILED: 'Could not sign out. Please try again.',
  LOAD_FAILED: 'Could not load data. Please try again.',
  PAGE_LOAD_TITLE: 'Page could not be loaded.',
  PAGE_LOAD_FAILED: 'Could not load the page. Please reload and try again.',
  HISTORY_FAILED: 'Could not load history. Please try again.',
  CALCULATE_FAILED: 'Could not calculate WQI. Please try again.',
  SAVE_RECORD: 'Could not save the record. Please try again.',
  ACTION_FAILED: 'Could not complete the action. Please try again.',
  RECALCULATE_FAILED: 'Could not recalculate WQI. Please try again.',
  DOWNLOAD_FAILED: 'Could not download the file. Please try again.',
  SAVE_STATION: 'Could not save the station. Please try again.',
  SAVE_ACCOUNT: 'Could not save the account. Please try again.',
  HEALTH_FAILED: 'Could not check system health. Please try again.',
  SAVE_BROWSER: 'Could not save in this browser. Please try again.',
  READ_FILE: 'Could not read the file. Please check it and try again.',
  IMPORT_FAILED: 'Could not import data. Please try again.',
  STATIONS_UNAVAILABLE: 'Saving stations is not available yet.',
  ACCOUNTS_UNAVAILABLE: 'Saving accounts is not available yet.',
  RECORDS_UNAVAILABLE: 'Saving records is not available yet.',
  DELETE_UNAVAILABLE: 'Deleting records is not available yet.',
  RECALCULATE_UNAVAILABLE: 'Recalculating WQI is not available yet.',
  IMPORT_UNAVAILABLE: 'Excel import is not available yet.',
  ROLLBACK_UNAVAILABLE: 'Undoing an import is not available yet.',
  FILE_REQUIRED: 'Please choose an .xlsx file.',
  UPLOAD_INVALID: 'The uploaded file is invalid. Please check it and try again.',
  INVALID_WORKBOOK: 'Please choose an .xlsx file with one worksheet containing all six columns PH, COD, DO, Amoni, Phosphat, Coliforms; column names must be unique. Temp and BOD5 are optional.',
  WORKBOOK_LIMIT: 'The file is too large or not supported. Please check it and try again.',
  EMPTY_WORKBOOK: 'The file has no data rows. Please check it and try again.',
  IMPORT_IN_PROGRESS: 'The file is still being imported. Please wait, then reload the list.',
  ROW_NORMALIZED: 'This row has already been turned into a record. Please edit it in the review section.',
  SELF_LOCKOUT: 'You cannot lock or demote the account you are signed in with.',
  ROW_INVALID: 'This row has invalid values, so it cannot be turned into a record.',
  INVALID_RANGE: 'The start time must be before the end time.',
  STEP_MISMATCH: 'Please enter a value that matches the allowed step.',
} as const;

export const rangeMessage = (min: number, max: number) => `Value must be between ${min} and ${max}.`;
export const minLengthMessage = (min: number | bigint) => `Please enter at least ${min} characters.`;
export const maxLengthMessage = (max: number | bigint) => `Please enter no more than ${max} characters.`;
export const fileSizeMessage = (mb: number) => `Please choose a file no larger than ${mb} MB.`;
export const rowLimitMessage = (count: number) => `Please choose a file with no more than ${count.toLocaleString('en-US')} data rows.`;
export const formulaCellMessage = (cell: string) => `Cell ${cell} contains a formula. Please use the original value.`;
export const invalidCellMessage = (cell: string) => `The value in cell ${cell} is invalid. Please check and try again.`;
export const exportLimitMessage = (count: number) => `Please narrow the filters to at most ${count.toLocaleString('en-US')} records.`;
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
      return issue.code === 'too_small' ? `Value must be at least ${issue.minimum}.` : `Value cannot exceed ${issue.maximum}.`;
    }
    if (issue.type === 'string') return issue.code === 'too_small'
      ? issue.minimum === 1 ? USER_MESSAGES.REQUIRED : minLengthMessage(issue.minimum)
      : maxLengthMessage(issue.maximum);
  }
  if (issue.code === 'invalid_string') return USER_MESSAGES.INVALID_FORMAT;
  return USER_MESSAGES.INVALID_VALUE;
}
export const userErrorMap: ZodErrorMap = issue => ({ message: validationIssueMessage(issue as ZodIssue) });

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
  AI_INVALID_RESPONSE: USER_MESSAGES.AI_INVALID, AI_INPUT_OUTSIDE_DOMAIN: USER_MESSAGES.AI_DOMAIN, AI_OUTPUT_OUT_OF_RANGE: USER_MESSAGES.AI_OUT_OF_RANGE,
  FILE_REQUIRED: USER_MESSAGES.FILE_REQUIRED, INVALID_WORKBOOK: USER_MESSAGES.INVALID_WORKBOOK,
  WORKBOOK_LIMIT: USER_MESSAGES.WORKBOOK_LIMIT, EMPTY_WORKBOOK: USER_MESSAGES.EMPTY_WORKBOOK,
  IMPORT_IN_PROGRESS: USER_MESSAGES.IMPORT_IN_PROGRESS, ROW_ALREADY_NORMALIZED: USER_MESSAGES.ROW_NORMALIZED, ROW_INVALID: USER_MESSAGES.ROW_INVALID,
  FILE_TOO_LARGE: fileSizeMessage(5), UPLOAD_ERROR: USER_MESSAGES.UPLOAD_INVALID, PAYLOAD_TOO_LARGE: USER_MESSAGES.WORKBOOK_LIMIT,
  ROW_LIMIT: rowLimitMessage(10000), EXPORT_LIMIT: exportLimitMessage(10000), INVALID_RANGE: USER_MESSAGES.INVALID_RANGE,
  FORMULA_NOT_ALLOWED: 'The file has cells with formulas. Please use the original values.', UNSUPPORTED_CELL: USER_MESSAGES.INVALID_VALUE,
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
  if (field.split('.').at(-1)?.toLowerCase() === 'ph' && /greater|less|range|between|min|max|negative/i.test(message)) return USER_MESSAGES.PH_RANGE;
  if (knownMessages.has(message)) return message;
  if (/non.?negative|cannot be negative|greater than or equal to 0/i.test(message)) return USER_MESSAGES.NONNEGATIVE;
  return USER_MESSAGES.INVALID_NUMBER;
}
