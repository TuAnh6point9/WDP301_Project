import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import { displayText, msg, useLocale, type TranslationKey } from '@/i18n';
import { usePageTransitionPending } from '@/app/navigation/NavigationTransition';
import { INPUT_FIELDS } from '../inputFields';

const STORAGE_KEY = 'wqi.guide.calculate.v1';
let dismissedInMemory = false;
function alreadyViewed() {
  try { return localStorage.getItem(STORAGE_KEY) === 'done'; }
  catch { return dismissedInMemory; }
}
const steps: { target?: string; title: TranslationKey; body: TranslationKey; icon: IconName }[] = [
  { target: 'intro', title: 'guide.welcomeTitle', body: 'guide.welcomeBody', icon: 'drop' },
  { target: 'inputs', title: 'guide.inputsTitle', body: 'guide.inputsBody', icon: 'sliders' },
  { target: 'validation', title: 'guide.checkTitle', body: 'guide.checkBody', icon: 'check' },
  { target: 'actions', title: 'guide.calculateTitle', body: 'guide.calculateBody', icon: 'sparkle' },
  { title: 'guide.resultsTitle', body: 'guide.resultsBody', icon: 'chart' },
];

/** Only the walkthrough's dismissal is persisted; it never reads or changes form values. */
export function CalculateGuide({ busy }: { busy: boolean }) {
  useLocale();
  const transitioning = usePageTransitionPending();
  const [open, setOpen] = useState(() => !alreadyViewed());
  const help = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'done'); }
    catch { dismissedInMemory = true; }
    setOpen(false);
  }, []);
  return <>
    <button ref={help} type="button" className="btn btn-secondary wqi-guide-trigger" disabled={busy}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Icon name="file"/>{msg('guide.title')}
    </button>
    {open && !busy && !transitioning && <Walkthrough onClose={close} returnFocus={help}/>}
  </>;
}

type Rect = { left: number; top: number; width: number; height: number; right: number; bottom: number };
type Placement = { left: number; top: number; highlight: Rect | null };

function Walkthrough({ onClose, returnFocus }: { onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null> }) {
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    const element = dialog.current!;
    const focusTarget = returnFocus.current;
    const previousOverflow = document.body.style.overflow;
    const scrollPosition = { left: window.scrollX, top: window.scrollY };
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      window.scrollTo({ ...scrollPosition, behavior: 'instant' });
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  useLayoutEffect(() => {
    const target = step.target ? document.querySelector<HTMLElement>(`[data-wqi-guide="${step.target}"]`) : null;
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [index, step.target]);

  useLayoutEffect(() => {
    function position() {
      if (!panel.current) return;
      const viewport = window.visualViewport;
      const offsetX = viewport?.offsetLeft ?? 0, offsetY = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const margin = 16, gap = 18;
      const box = panel.current.getBoundingClientRect();
      const bounds = { left: offsetX + margin, top: offsetY + margin, right: offsetX + width - margin, bottom: offsetY + height - margin };
      const clampX = (value: number) => Math.max(bounds.left, Math.min(value, bounds.right - box.width));
      const clampY = (value: number) => Math.max(bounds.top, Math.min(value, bounds.bottom - box.height));
      let left = clampX(offsetX + (width - box.width) / 2);
      let top = clampY(offsetY + (height - box.height) / 2);
      let highlight: Rect | null = null;
      const target = step.target ? document.querySelector<HTMLElement>(`[data-wqi-guide="${step.target}"]`) : null;
      const rect = target?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right) {
        const l = Math.max(bounds.left, rect.left - 7), t = Math.max(bounds.top, rect.top - 7);
        const r = Math.min(bounds.right, rect.right + 7), b = Math.min(bounds.bottom, rect.bottom + 7);
        highlight = { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
        if (r + gap + box.width <= bounds.right) { left = r + gap; top = clampY(t); }
        else if (l - gap - box.width >= bounds.left) { left = l - gap - box.width; top = clampY(t); }
        else if (b + gap + box.height <= bounds.bottom) { top = b + gap; left = clampX(l); }
        else if (t - gap - box.height >= bounds.top) { top = t - gap - box.height; left = clampX(l); }
        // In compact viewports the centered card stays readable above the highlighted area.
      }
      setPlacement(previous => previous && previous.left === left && previous.top === top
        && JSON.stringify(previous.highlight) === JSON.stringify(highlight) ? previous : { left, top, highlight });
    }
    position();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(position);
    if (panel.current) observer?.observe(panel.current);
    const target = step.target ? document.querySelector<HTMLElement>(`[data-wqi-guide="${step.target}"]`) : null;
    if (target) observer?.observe(target);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [index, locale, step.target]);

  const highlight = placement?.highlight;
  return createPortal(<dialog ref={dialog} className="wqi-guide" aria-label={msg('guide.title')}
    aria-describedby="wqi-guide-description" onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const active = document.activeElement;
      if (event.shiftKey && (active === controls[0] || !controls.includes(active as HTMLButtonElement))) {
        event.preventDefault(); controls.at(-1)?.focus();
      } else if (!event.shiftKey && active === controls.at(-1)) {
        event.preventDefault(); controls[0]?.focus();
      }
    }}>
    {highlight
      ? <div className="wqi-guide-spotlight" data-guide-target={step.target} aria-hidden="true" style={highlight as CSSProperties}/>
      : <div className="wqi-guide-shade" aria-hidden="true"/>}
    <div ref={panel} className="wqi-guide-panel" style={placement ? { left: placement.left, top: placement.top } : { visibility: 'hidden' }}>
      <div className="wqi-guide-top"><span className="wqi-guide-step">{msg('guide.step', { current: index + 1, total: steps.length })}</span><LanguageSwitcher/></div>
      <div className="wqi-guide-content">
        <span className="wqi-guide-icon"><Icon name={step.icon}/></span>
        <h2 ref={heading} tabIndex={-1} className="h3">{msg(step.title)}</h2>
        <div id="wqi-guide-description">
          <p>{msg(step.body)}</p>
          {index === 1 && <dl className="wqi-guide-fields">{INPUT_FIELDS.map(field => <div key={field.key}>
            <dt>{displayText(field.label)}</dt><dd>{msg(`guide.field${field.key}`)}</dd>
          </div>)}</dl>}
          {index === 2 && <p className="wqi-guide-note">{msg('guide.sourceNote')}</p>}
          {index === 3 && <p className="wqi-guide-note">{msg('guide.resetNote')}</p>}
          {index === 4 && <ul className="wqi-guide-summary">
            <li>{msg('guide.resultScore')}</li><li>{msg('guide.resultInputs')}</li><li>{msg('guide.resultHistory')}</li>
          </ul>}
        </div>
      </div>
      <div className="wqi-guide-footer">
        <button type="button" className="btn btn-ghost" onClick={onClose}>{msg('guide.skip')}</button>
        <div className="wqi-guide-navigation">
          {index > 0 && <button type="button" className="btn btn-secondary" onClick={() => setIndex(value => value - 1)}>{msg('guide.back')}</button>}
          <button type="button" className="btn btn-primary" onClick={() => index === steps.length - 1 ? onClose() : setIndex(value => value + 1)}>
            {msg(index === steps.length - 1 ? 'guide.finish' : 'guide.next')}<Icon name={index === steps.length - 1 ? 'check' : 'arrowRight'}/>
          </button>
        </div>
      </div>
    </div>
  </dialog>, document.body);
}
