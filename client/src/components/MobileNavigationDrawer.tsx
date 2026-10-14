import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { List } from '@phosphor-icons/react';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';
export function MobileNavigationDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  function close(restoreFocus = true) {
    if (closing) return;
    setClosing(true);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      dialog.current?.close?.();
      setOpen(false); setClosing(false);
      if (restoreFocus) trigger.current?.focus({ preventScroll: true });
      else document.getElementById('page-content')?.focus({ preventScroll: true });
    }, reduced ? 0 : 140);
  }
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    if (element.showModal) element.showModal(); else element.setAttribute('open', '');
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia?.('(min-width: 1025px)');
    const resize = () => { if (desktop?.matches) { clearTimeout(timer.current); element.close?.(); setOpen(false); setClosing(false); } };
    desktop?.addEventListener('change', resize);
    return () => { clearTimeout(timer.current); element.close?.(); document.body.style.overflow = previousOverflow; desktop?.removeEventListener('change', resize); };
  }, [open]);
  function keyboard(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const targets = Array.from(dialog.current!.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = targets[0], last = targets.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <>
    <button ref={trigger} type="button" className="mobile-menu-button btn btn-ghost" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => setOpen(true)}><List size={20} aria-hidden="true"/>Menu</button>
    {open && <dialog ref={dialog} id={id} className="navigation-drawer" data-closing={closing} aria-label="Navigation" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={keyboard} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="drawer-heading"><span className="h3">Navigation</span><button type="button" className="btn btn-ghost" onClick={() => close()}><Icon name="close"/>Close</button></div>
      <nav className="drawer-links" aria-label="Mobile" onClick={event => {
        const anchor = (event.target as Element).closest('a[href]');
        if (anchor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) close(false);
      }}>{children}</nav>
    </dialog>}
  </>;
}
