import type { FormEvent } from 'react';
import { USER_MESSAGES, rangeMessage, minLengthMessage, maxLengthMessage } from '@wqi/contracts';
import { i18n } from '@/i18n';
import { messageText } from '@/i18n/messages';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function control(target: EventTarget): Control | null {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target : null;
}
export function localizeNativeValidation(event: FormEvent<HTMLFormElement>) {
  const input = control(event.target);
  if (!input) return;
  const validity = input.validity;
  const numeric = input instanceof HTMLInputElement && input.type === 'number';
  let message: string = USER_MESSAGES.INVALID_VALUE;
  if (validity.badInput) message = numeric ? USER_MESSAGES.INVALID_NUMBER : USER_MESSAGES.INVALID_VALUE;
  else if (validity.valueMissing) message = numeric ? USER_MESSAGES.REQUIRED_NUMBER : USER_MESSAGES.REQUIRED;
  else if (validity.typeMismatch || validity.patternMismatch) message = USER_MESSAGES.INVALID_FORMAT;
  else if (input instanceof HTMLInputElement && (validity.rangeUnderflow || validity.rangeOverflow)) {
    if (input.min && input.max && numeric) message = rangeMessage(Number(input.min), Number(input.max));
    else message = USER_MESSAGES.INVALID_VALUE;
  } else if (validity.stepMismatch) message = USER_MESSAGES.STEP_MISMATCH;
  else if (validity.tooShort && !(input instanceof HTMLSelectElement)) message = minLengthMessage(input.minLength);
  else if (validity.tooLong && !(input instanceof HTMLSelectElement)) message = maxLengthMessage(input.maxLength);
  input.dataset.wqiValidationSource = message;
  input.setCustomValidity(messageText(message));
}
export function clearNativeValidation(event: FormEvent<HTMLFormElement>) {
  const input = control(event.target);
  if (input) { input.setCustomValidity(''); delete input.dataset.wqiValidationSource; }
}
export const nativeValidationHandlers = { onInvalidCapture: localizeNativeValidation, onInputCapture: clearNativeValidation };

i18n.on('languageChanged', () => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<Control>('[data-wqi-validation-source]').forEach(input => {
    if (input.validity.customError) input.setCustomValidity(messageText(input.dataset.wqiValidationSource!));
  });
});
