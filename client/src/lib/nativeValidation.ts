import type { FormEvent } from 'react';
import { USER_MESSAGES, rangeMessage, minLengthMessage, maxLengthMessage } from '@wqi/contracts';
import { i18n } from '@/i18n';
import { messageText } from '@/i18n/messages';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function control(target: EventTarget): Control | null {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target : null;
}
// Error line under the control, styled like the Calculate page (.hint.is-error). Placed after the icon/unit wrapper when there is one.
// shortcut: the line is added with DOM calls next to React-owned nodes; fine for sibling text, move to per-form state if a form re-renders that area.
let nextId = 0;
const errorLine = (input: Control) => input.dataset.wqiErrorId ? document.getElementById(input.dataset.wqiErrorId) : null;
function showError(input: Control, text: string) {
  let line = errorLine(input);
  if (!line) {
    line = document.createElement('span');
    line.className = 'hint is-error';
    line.id = `wqi-field-error-${++nextId}`;
    const wrapper = input.parentElement?.matches('.input-icon, .input-unit') ? input.parentElement : input;
    wrapper.after(line);
    input.dataset.wqiErrorId = line.id;
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), line.id].filter(Boolean).join(' '));
  }
  line.textContent = text;
  input.classList.add('is-error');
  input.setAttribute('aria-invalid', 'true');
}
function hideError(input: Control) {
  const id = input.dataset.wqiErrorId;
  if (!id) return;
  errorLine(input)?.remove();
  const rest = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(token => token && token !== id).join(' ');
  if (rest) input.setAttribute('aria-describedby', rest); else input.removeAttribute('aria-describedby');
  input.classList.remove('is-error');
  input.removeAttribute('aria-invalid');
  delete input.dataset.wqiErrorId;
}

export function localizeNativeValidation(event: FormEvent<HTMLFormElement>) {
  const input = control(event.target);
  if (!input) return;
  event.preventDefault(); // no browser bubble: the message is shown under the field instead
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
  showError(input, messageText(message));
  // Invalid events fire in field order, so the first one takes the cursor (the browser no longer does once the bubble is cancelled).
  const first = input.form && [...input.form.elements].find(element => element instanceof HTMLElement && 'validity' in element && !(element as Control).validity.valid);
  if (first === input) input.focus();
}
export function clearNativeValidation(event: FormEvent<HTMLFormElement>) {
  const input = control(event.target);
  if (input) { input.setCustomValidity(''); delete input.dataset.wqiValidationSource; hideError(input); }
}
export const nativeValidationHandlers = { onInvalidCapture: localizeNativeValidation, onInputCapture: clearNativeValidation };

i18n.on('languageChanged', () => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<Control>('[data-wqi-validation-source]').forEach(input => {
    if (!input.validity.customError) return;
    const text = messageText(input.dataset.wqiValidationSource!);
    input.setCustomValidity(text);
    const line = errorLine(input);
    if (line) line.textContent = text;
  });
});
