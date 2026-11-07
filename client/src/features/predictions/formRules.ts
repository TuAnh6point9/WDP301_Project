import { fieldErrorMessage, isNotDetected, parseDecimal, predictionParametersSchema, rangeMessage, USER_MESSAGES, userErrorMessage, validationIssueMessage, type PredictionStatus } from '@wqi/contracts';
import { ApiError } from '@/lib/http';
import { INPUT_FIELDS } from './inputFields';
import type { Inputs } from './types';

// The six-field prediction rules, shared by the web page and the Android app so both send the same numbers.
export type FieldErrors = Partial<Record<keyof Inputs, string>>;
export type InputValues = Record<keyof Inputs, string>;
export const EMPTY_INPUTS = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, ''])) as InputValues;

export function checkInputs(values: InputValues, inputDomain?: PredictionStatus['inputDomain']) {
  // Text inputs: a number input would turn "7,2" into 72 or empty in some browsers (decision 24 reads it as 7.2).
  const candidate = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, parseDecimal(values[field.key])])) as Inputs;
  const parsed = predictionParametersSchema.safeParse(candidate);
  const errors: FieldErrors = {};
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof Inputs;
    errors[key] = isNotDetected(values[key]) ? USER_MESSAGES.NOT_DETECTED : validationIssueMessage(issue);
  }
  for (const field of INPUT_FIELDS) {
    const domain = inputDomain?.[field.key];
    if (!errors[field.key] && domain && (candidate[field.key] < domain.min || candidate[field.key] > domain.max)) errors[field.key] = rangeMessage(domain.min, domain.max);
  }
  // Decision 28: fields are typed in model order, so every field after the first invalid one stays locked (values are kept).
  const firstInvalid = INPUT_FIELDS.findIndex(field => errors[field.key]);
  return { candidate, parsed, errors, firstInvalid };
}

/** Field messages and the banner text for a failed calculation. */
export function submitFailure(error: unknown, signedIn: boolean): { fieldErrors: FieldErrors; failure: string } {
  const fieldErrors: FieldErrors = {};
  if (error instanceof ApiError && Array.isArray(error.details)) {
    for (const issue of error.details) {
      if (typeof issue.field !== 'string' || typeof issue.message !== 'string') continue;
      const key = issue.field.replace(/^parameters\./, '') as keyof Inputs;
      if (INPUT_FIELDS.some(field => field.key === key)) fieldErrors[key] = fieldErrorMessage(key, issue.message);
    }
  } else if (error instanceof ApiError && error.code === 'AI_INPUT_OUTSIDE_DOMAIN' && error.details) {
    for (const [key, range] of Object.entries(error.details)) {
      const field = INPUT_FIELDS.find(item => item.key === key);
      if (field && range && Number.isFinite(range.min) && Number.isFinite(range.max)) fieldErrors[field.key] = rangeMessage(range.min, range.max);
    }
  }
  let failure = userErrorMessage(error, USER_MESSAGES.CALCULATE_FAILED);
  if (error instanceof ApiError && ((error.code === 'NETWORK_ERROR' && error.status === 0) || ['REQUEST_TIMEOUT', 'AI_TIMEOUT'].includes(error.code))) failure = signedIn ? USER_MESSAGES.WQI_RETRY : USER_MESSAGES.TIMEOUT;
  return { fieldErrors, failure };
}
