import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Native <dialog> styled with the design's .modal classes. */
export function Modal({ title, onClose, onSubmit, submitLabel, danger = false, width, children }: {
  title: string; onClose: () => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string; danger?: boolean; width?: number; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="modal" aria-label={title} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined} onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); onSubmit?.(event); }}>
      <div className="modal-head">
        <h2 className="h3">{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close"/></button>
      </div>
      {children}
      <div className="modal-foot">
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {submitLabel && <button type="submit" className={danger ? 'btn btn-danger' : 'btn btn-primary'}>{submitLabel}</button>}
      </div>
    </form>
  </dialog>;
}

/** Small status message at the bottom of the screen. */
export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function show(text: string) {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2000);
  }
  const element = <div className={message ? 'toast show' : 'toast'} role="status" aria-live="polite">{message}</div>;
  return { show, element };
}
