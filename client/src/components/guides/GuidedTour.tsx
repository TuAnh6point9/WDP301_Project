import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { usePageTransitionPending } from '@/app/navigation/NavigationTransition';

export type GuideId = 'calculate' | 'chart' | 'excel-user' | 'excel-admin';
export type GuideStage = 'overview' | 'prepare' | 'preview' | 'progress' | 'results' | 'fill' | 'overwrite' | 'history';
export type GuideStep = { id: string; title: TranslationKey; body: TranslationKey; target?: string; icon?: IconName; Content?: ComponentType };
type Preference = { dismissed: boolean; completed: string[] };
type Run = { stage: GuideStage; steps: readonly GuideStep[] };
const memory = new Map<GuideId, Preference>();
const listeners = new Set<() => void>();
let owner: symbol | null = null;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => owner;
function release(token: symbol) { if (owner === token) { owner = null; listeners.forEach(listener => listener()); } }
function preferences(id: GuideId): Preference {
  // A quota error can block writes while reads still work. Keep the newer session value.
  const fallback = memory.get(id);
  if (fallback) return fallback;
  try {
    const raw = localStorage.getItem(`wqi.guide.${id}.v1`);
    if (raw === 'done') return { dismissed: true, completed: [] }; // Original WQI guide.
    const value = JSON.parse(raw || 'null');
    return { dismissed: value?.dismissed === true, completed: Array.isArray(value?.completed) ? value.completed.filter((item: unknown) => typeof item === 'string') : [] };
  } catch { return memory.get(id) ?? { dismissed: false, completed: [] }; }
}
function remember(id: GuideId, stage: GuideStage, skipped: boolean) {
  const previous = preferences(id);
  const next = { dismissed: previous.dismissed || skipped, completed: [...new Set([...previous.completed, stage])] };
  try { localStorage.setItem(`wqi.guide.${id}.v1`, id === 'calculate' ? 'done' : JSON.stringify(next)); memory.delete(id); }
  catch { memory.set(id, next); }
}

/** Coordinates all entry points, including buttons inside existing native dialogs. */
export function GuideButton({ id, stage, title, steps, autoStart = true, ready = true, busy = false, onStepChange, onExit }: {
  id: GuideId; stage: GuideStage; title: TranslationKey; steps: readonly GuideStep[];
  autoStart?: boolean; ready?: boolean; busy?: boolean; onStepChange?: (index: number) => void; onExit?: () => void;
}) {
  useLocale();
  const transitioning = usePageTransitionPending();
  const active = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [token] = useState(() => Symbol(id));
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const help = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onStepChange, onExit });
  callbacks.current = { onStepChange, onExit };
  const start = useCallback(() => {
    if (!ready || busy || transitioning || owner || !steps.length) return;
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
    if (dialogs.length && !dialogs.at(-1)?.contains(help.current)) return;
    owner = token; listeners.forEach(listener => listener());
    const next = { stage, steps };
    runRef.current = next; setRun(next);
  }, [ready, busy, transitioning, steps, stage, token]);
  const end = useCallback((reason: 'skip' | 'finish' | 'suspend') => {
    if (!runRef.current) return;
    if (reason !== 'suspend') remember(id, runRef.current.stage, reason === 'skip');
    runRef.current = null; setRun(null);
    callbacks.current.onExit?.();
    release(token);
  }, [id, token]);
  useEffect(() => {
    if (!autoStart || !ready || busy || transitioning || active) return;
    const saved = preferences(id);
    if (saved.dismissed || saved.completed.includes(stage)) return;
    // Defer until parent dialogs have opened and route focus effects have settled.
    const timer = setTimeout(start, 0);
    return () => clearTimeout(timer);
  }, [autoStart, ready, busy, transitioning, active, id, stage, start]);
  useEffect(() => { if (run && (!ready || busy || transitioning)) end('suspend'); }, [run, ready, busy, transitioning, end]);
  useEffect(() => () => {
    if (owner === token) { callbacks.current.onExit?.(); release(token); }
  }, [token]);
  return <>
    <button ref={help} type="button" className="btn btn-secondary wqi-guide-trigger" aria-haspopup="dialog"
      disabled={busy || !ready || Boolean(active && active !== token)} onClick={start}>
      <Icon name="file"/>{msg(title)}
    </button>
    {run && <Walkthrough title={title} id={id} run={run} returnFocus={help} onEnd={end} onStepChange={index => callbacks.current.onStepChange?.(index)}/>}
  </>;
}

type Rect = { left: number; top: number; width: number; height: number };
type Placement = { left: number; top: number; highlight: Rect | null };
function Walkthrough({ title, id, run, returnFocus, onEnd, onStepChange }: {
  title: TranslationKey; id: GuideId; run: Run; returnFocus: RefObject<HTMLButtonElement | null>;
  onEnd: (reason: 'skip' | 'finish') => void; onStepChange: (index: number) => void;
}) {
  const locale = useLocale();
  const descriptionId = useId();
  const [index, setIndex] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), panel = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const step = run.steps[index];
  const stepCallback = useRef(onStepChange); stepCallback.current = onStepChange;
  useLayoutEffect(() => {
    const element = dialog.current!, focusTarget = returnFocus.current;
    const overflow = document.body.style.overflow, scroll = { left: window.scrollX, top: window.scrollY };
    element.showModal(); document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = overflow;
      window.scrollTo({ ...scroll, behavior: 'instant' });
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  useLayoutEffect(() => {
    stepCallback.current(index);
    heading.current?.focus({ preventScroll: true });
    panel.current?.querySelector('.wqi-guide-content')?.scrollTo?.({ top: 0 });
  }, [index, step.target]);
  useLayoutEffect(() => {
    let frame: number | undefined;
    let scrolledTarget: Element | null = null;
    function position() {
      if (!panel.current) return;
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      panel.current.style.maxWidth = `${Math.max(0, width - 32)}px`;
      panel.current.style.maxHeight = `${Math.max(0, height - 32)}px`;
      const box = panel.current.getBoundingClientRect(), gap = 18;
      const bounds = { left: x + 16, top: y + 16, right: x + width - 16, bottom: y + height - 16 };
      const clampX = (v: number) => Math.max(bounds.left, Math.min(v, bounds.right - box.width));
      const clampY = (v: number) => Math.max(bounds.top, Math.min(v, bounds.bottom - box.height));
      let left = clampX(x + (width - box.width) / 2), top = clampY(y + (height - box.height) / 2);
      let highlight: Rect | null = null;
      const candidate = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const visible = candidate && (candidate.checkVisibility
        ? candidate.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : getComputedStyle(candidate).visibility === 'visible');
      const target = visible ? candidate : null;
      let rect = target?.getBoundingClientRect();
      // A step can reveal a panel in its parent. Scroll only after that target exists and is visible.
      if (target && rect && rect.width > 0 && rect.height > 0 && target !== scrolledTarget) {
        scrolledTarget = target;
        target.scrollIntoView({ block: rect.height > height - 120 ? 'start' : 'center', behavior: 'instant' });
        rect = target.getBoundingClientRect();
      }
      if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right) {
        const l = Math.max(bounds.left, rect.left - 7), t = Math.max(bounds.top, rect.top - 7);
        const r = Math.min(bounds.right, rect.right + 7), b = Math.min(bounds.bottom, rect.bottom + 7);
        highlight = { left: l, top: t, width: r - l, height: b - t };
        if (r + gap + box.width <= bounds.right) { left = r + gap; top = clampY(t); }
        else if (l - gap - box.width >= bounds.left) { left = l - gap - box.width; top = clampY(t); }
        else if (b + gap + box.height <= bounds.bottom) { top = b + gap; left = clampX(l); }
        else if (t - gap - box.height >= bounds.top) { top = t - gap - box.height; left = clampX(l); }
      }
      setPlacement(previous => JSON.stringify(previous) === JSON.stringify({ left, top, highlight }) ? previous : { left, top, highlight });
    }
    function schedule() { if (frame !== undefined) cancelAnimationFrame(frame); frame = requestAnimationFrame(position); }
    position(); schedule();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (panel.current) resize?.observe(panel.current);
    const target = step.target ? document.querySelector(step.target) : null;
    if (target) resize?.observe(target);
    const mutations = new MutationObserver(records => {
      // Ignore our own position styles so observing visibility changes cannot create a frame loop.
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.wqi-guide'))) schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'style', 'class'] });
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [index, locale, step.target]);
  return createPortal(<dialog ref={dialog} className="wqi-guide" aria-label={msg(title)} aria-describedby={descriptionId}
    data-guide-id={id} data-guide-stage={run.stage} onClick={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onEnd('skip'); }}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (event.shiftKey && (document.activeElement === buttons[0] || !buttons.includes(document.activeElement as HTMLButtonElement))) {
        event.preventDefault(); buttons.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }}>
    {placement?.highlight ? <div className="wqi-guide-spotlight" data-guide-target={step.id} aria-hidden="true" style={placement.highlight}/> : <div className="wqi-guide-shade" aria-hidden="true"/>}
    <div ref={panel} className="wqi-guide-panel" style={placement ? { left: placement.left, top: placement.top } : { visibility: 'hidden' }}>
      <div className="wqi-guide-top"><span className="wqi-guide-step">{msg('guide.step', { current: index + 1, total: run.steps.length })}</span><LanguageSwitcher/></div>
      <div className="wqi-guide-content"><span className="wqi-guide-icon"><Icon name={step.icon ?? 'file'}/></span>
        <h2 ref={heading} tabIndex={-1} className="h3">{msg(step.title)}</h2>
        <div id={descriptionId}><p>{msg(step.body)}</p>{step.Content && <step.Content/>}</div>
      </div>
      <div className="wqi-guide-footer"><button type="button" className="btn btn-ghost" onClick={() => onEnd('skip')}>{msg('guide.skip')}</button>
        <div className="wqi-guide-navigation">
          {index > 0 && <button type="button" className="btn btn-secondary" onClick={() => setIndex(value => value - 1)}>{msg('guide.back')}</button>}
          <button type="button" className="btn btn-primary" onClick={() => index === run.steps.length - 1 ? onEnd('finish') : setIndex(value => value + 1)}>
            {msg(index === run.steps.length - 1 ? 'guide.finish' : 'guide.next')}<Icon name={index === run.steps.length - 1 ? 'check' : 'arrowRight'}/>
          </button>
        </div>
      </div>
    </div>
  </dialog>, document.body);
}
