import { messageText } from '@/i18n/messages';
import { displayText, message as translateMessage, type MessageDescriptor } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { nativeValidationHandlers } from '@/lib/nativeValidation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Native <dialog> styled with the design's .modal classes. Without `submitLabel` it only shows information. */
export function Modal({ title, onClose, onSubmit, submitLabel, submitDisabled = false, cancelLabel, extraAction, footerTourTarget, danger = false, width, children }: {
  title: string; onClose: () => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string; submitDisabled?: boolean; cancelLabel?: string; extraAction?: ReactNode; footerTourTarget?: string; danger?: boolean; width?: number; children: ReactNode;
}) {
  useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body textarea')?.focus();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-label={displayText(title)} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined} onCancel={event => { event.preventDefault(); onClose(); }}>
    <form {...nativeValidationHandlers} onSubmit={event => { event.preventDefault(); onSubmit?.(event); }}>
      <div className="modal-head">
        <h2 className="h3">{displayText(title)}</h2>
        <button type="button" className="icon-btn" aria-label={msg('common.close')} onClick={onClose}><Icon name="close"/></button>
      </div>
      {children}
      <div className="modal-foot" data-tour={footerTourTarget}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{cancelLabel ?? msg(submitLabel ? 'common.cancel' : 'common.close')}</button>
        {extraAction}
        {submitLabel && <button type="submit" disabled={submitDisabled} className={danger ? 'btn btn-danger' : 'btn btn-primary'}>{displayText(submitLabel)}</button>}
      </div>
    </form>
  </dialog>;
}

/** Small status message at the bottom of the screen. */
export function useToast() {
  useLocale();
  const [message, setMessage] = useState<string | MessageDescriptor>('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function show(text: string | MessageDescriptor) {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 4000);
  }
  const element = <div className={message ? 'toast show' : 'toast'} role="status" aria-live="polite">{typeof message === 'string' ? messageText(message) : translateMessage(message)}</div>;
  return { show, element };
}
