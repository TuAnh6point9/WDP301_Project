import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type Ref, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/Icon';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
import { msg, useLocale, type TranslationKey } from '@/i18n';
import { usePageTransitionPending } from '@/app/navigation/NavigationTransition';

export type GuideId = 'calculate' | 'chart' | 'excel-user' | 'excel-admin';
export type GuideStage = 'overview' | 'prepare' | 'preview' | 'progress' | 'results' | 'fill' | 'overwrite' | 'history';
export type GuideStep = { id: string; stage?: GuideStage; title: TranslationKey; body: TranslationKey; target?: string; icon?: IconName; Content?: ComponentType; Example?: ComponentType };
type Preference = { dismissed: boolean; completed: string[] };
type Run = { stage: GuideStage; steps: readonly GuideStep[]; accountId?: string; startIndex: number };
export type GuideControl = { openIntro: () => boolean };
const memory = new Map<string, Preference>();
const flowGuide = (id: GuideId) => id === 'excel-user' || id === 'excel-admin';
const preferenceKey = (id: GuideId, accountId: string, version = flowGuide(id) ? 'v2' : 'v1') => `wqi.guide.account.${accountId}.${id}.${version}`;
const listeners = new Set<() => void>();
let owner: symbol | null = null;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => owner;
function release(token: symbol) { if (owner === token) { owner = null; listeners.forEach(listener => listener()); } }
function preferences(id: GuideId, accountId: string): Preference {
  const key = preferenceKey(id, accountId);
  // A quota error can block writes while reads still work. Keep the newer session value.
  const fallback = memory.get(key);
  if (fallback) return fallback;
  try {
    const raw = localStorage.getItem(key);
    // A completed or skipped stage in v1 means this account has seen the old
    // walkthrough. Do not force the new flow on them after upgrading.
    if (!raw && flowGuide(id)) {
      const old = localStorage.getItem(preferenceKey(id, accountId, 'v1'));
      if (old === 'done') return { dismissed: true, completed: ['flow'] };
      const legacy = JSON.parse(old || 'null');
      if (legacy?.dismissed || (Array.isArray(legacy?.completed) && legacy.completed.length)) return { dismissed: true, completed: ['flow'] };
    }
    if (raw === 'done') return { dismissed: true, completed: [] }; // Original WQI guide.
    const value = JSON.parse(raw || 'null');
    return { dismissed: value?.dismissed === true, completed: Array.isArray(value?.completed) ? value.completed.filter((item: unknown) => typeof item === 'string') : [] };
  } catch { return memory.get(key) ?? { dismissed: false, completed: [] }; }
}
function remember(id: GuideId, accountId: string, stage: GuideStage, skipped: boolean) {
  const key = preferenceKey(id, accountId);
  const previous = preferences(id, accountId);
  const next = { dismissed: previous.dismissed || skipped, completed: [...new Set([...previous.completed, flowGuide(id) ? 'flow' : stage])] };
  try { localStorage.setItem(key, id === 'calculate' ? 'done' : JSON.stringify(next)); memory.delete(key); }
  catch { memory.set(key, next); }
}

/** Coordinates all entry points, including buttons inside existing native dialogs. */
export function GuideButton({ id, stage, title, steps, accountId, autoStart = true, introAllowed = false, ready = true, stageReady = true, busy = false, controlRef, onStepChange, onExit }: {
  id: GuideId; stage: GuideStage; title: TranslationKey; steps: readonly GuideStep[];
  accountId?: string; autoStart?: boolean; introAllowed?: boolean; ready?: boolean; stageReady?: boolean; busy?: boolean;
  controlRef?: Ref<GuideControl>; onStepChange?: (index: number) => void; onExit?: () => void;
}) {
  useLocale();
  const transitioning = usePageTransitionPending();
  const active = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [token] = useState(() => Symbol(id));
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  // Guests dismiss only this visit. Never reuse a guest decision for an account.
  const guest = useRef({ accountId, preference: { dismissed: false, completed: [] } as Preference });
  if (guest.current.accountId !== accountId) guest.current = { accountId, preference: { dismissed: false, completed: [] } };
  const help = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onStepChange, onExit });
  callbacks.current = { onStepChange, onExit };
  const start = useCallback((mode: 'manual' | 'intro' = 'manual') => {
    if (!ready || busy || transitioning || owner || !steps.length) return false;
    const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
    if (dialogs.length && !dialogs.at(-1)?.contains(help.current)) return false;
    owner = token; listeners.forEach(listener => listener());
    const startIndex = mode === 'intro' ? 0 : Math.max(0, steps.findIndex(step => step.stage === stage));
    const next = { stage, steps, accountId, startIndex };
    runRef.current = next; setRun(next);
    return true;
  }, [ready, busy, transitioning, steps, stage, token, accountId]);
  useImperativeHandle(controlRef, () => ({ openIntro: () => {
    if (!introAllowed || !flowGuide(id)) return false;
    const saved = accountId ? preferences(id, accountId) : guest.current.preference;
    if (saved.dismissed || saved.completed.includes('flow')) return false;
    // Consume this click even if another guide is still closing, so its file
    // picker never opens behind a modal.
    start('intro');
    return true;
  } }), [introAllowed, accountId, id, start]);
  const end = useCallback((reason: 'skip' | 'finish' | 'suspend') => {
    if (!runRef.current) return;
    if (reason !== 'suspend') {
      const previousRun = runRef.current;
      if (previousRun.accountId) remember(id, previousRun.accountId, previousRun.stage, reason === 'skip');
      else guest.current.preference = { dismissed: reason === 'skip', completed: [...guest.current.preference.completed, flowGuide(id) ? 'flow' : previousRun.stage] };
    }
    runRef.current = null; setRun(null);
    callbacks.current.onExit?.();
    release(token);
  }, [id, token]);
  useEffect(() => {
    if (!autoStart || !ready || busy || transitioning || active) return;
    const saved = accountId ? preferences(id, accountId) : guest.current.preference;
    if (saved.dismissed || saved.completed.includes(flowGuide(id) ? 'flow' : stage)) return;
    // Defer until parent dialogs have opened and route focus effects have settled.
    const timer = setTimeout(() => { start(flowGuide(id) ? 'intro' : 'manual'); }, 0);
    return () => clearTimeout(timer);
  }, [autoStart, ready, busy, transitioning, active, id, stage, start, accountId]);
  useEffect(() => { if (run && (!ready || busy || transitioning || run.accountId !== accountId)) end('suspend'); }, [run, ready, busy, transitioning, end, accountId]);
  useEffect(() => () => {
    if (owner === token) { callbacks.current.onExit?.(); release(token); }
  }, [token]);
  return <>
    <button ref={help} type="button" className="btn btn-secondary wqi-guide-trigger" aria-haspopup="dialog"
      disabled={busy || !ready || Boolean(active && active !== token)} onClick={() => { start('manual'); }}>
      <Icon name="file"/>{msg(title)}
    </button>
    {run && <Walkthrough title={title} id={id} run={run} stage={stage} stageReady={stageReady} returnFocus={help} onEnd={end} onStepChange={index => callbacks.current.onStepChange?.(index)}/>}
  </>;
}

type Rect = { left: number; top: number; width: number; height: number };
type Placement = { left: number; top: number; highlight: Rect | null; illustrated: boolean };
function Walkthrough({ title, id, run, stage, stageReady, returnFocus, onEnd, onStepChange }: {
  title: TranslationKey; id: GuideId; run: Run; stage: GuideStage; stageReady: boolean; returnFocus: RefObject<HTMLButtonElement | null>;
  onEnd: (reason: 'skip' | 'finish') => void; onStepChange: (index: number) => void;
}) {
  const locale = useLocale();
  const descriptionId = useId();
  const [index, setIndex] = useState(run.startIndex);
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
    let stackedViewport = '';
    function position() {
      if (!panel.current) return;
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const card = panel.current, gap = 18;
      const content = card.querySelector<HTMLElement>('.wqi-guide-content');
      const contentScrollTop = content?.scrollTop ?? 0;
      function limitHeight(value: number) {
        card.style.maxHeight = `${Math.max(0, value)}px`;
        card.dataset.compact = String(value < 360);
      }
      const bounds = { left: x + 16, top: y + 16, right: x + width - 16, bottom: y + height - 16 };
      card.style.width = `${Math.min(440, Math.max(0, width - 32))}px`;
      card.style.maxWidth = `${Math.max(0, width - 32)}px`;
      limitHeight(height - 32);
      let box = card.getBoundingClientRect();
      const clampX = (v: number) => Math.max(bounds.left, Math.min(v, bounds.right - box.width));
      const clampY = (v: number) => Math.max(bounds.top, Math.min(v, bounds.bottom - box.height));
      let left = clampX(x + (width - box.width) / 2), top = clampY(y + (height - box.height) / 2);
      let highlight: Rect | null = null;
      // A selector may mark related controls in different existing containers.
      // Measure their union without inserting wrappers or changing page layout.
      const targetAvailable = !step.Example || (step.stage === stage && stageReady);
      const targets = targetAvailable && step.target ? [...document.querySelectorAll<HTMLElement>(step.target)].filter(element => {
        const visible = element.checkVisibility
          ? element.checkVisibility({ opacityProperty: true, visibilityProperty: true })
          : getComputedStyle(element).visibility === 'visible';
        const box = element.getBoundingClientRect();
        return visible && box.width > 0 && box.height > 0;
      }) : [];
      const illustrated = Boolean(step.Example && targets.length === 0);
      function targetRect() {
        if (!targets.length) return undefined;
        if (targets.length === 1) return targets[0].getBoundingClientRect();
        const boxes = targets.map(element => element.getBoundingClientRect());
        const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top));
        const right = Math.max(...boxes.map(box => box.right)), bottom = Math.max(...boxes.map(box => box.bottom));
        return new DOMRect(left, top, right - left, bottom - top);
      }
      let rect = targetRect();
      // On short screens bring the final controls into view; clip the preceding
      // part of a tall group as with other tall targets, keeping the card separate.
      const tallGroup = targets.length > 1 && rect && rect.height > height * .5;
      const target = (tallGroup ? targets.at(-1) : targets[0]) ?? null;
      // A step can reveal a panel in its parent. Scroll only after that target exists and is visible.
      if (target && rect && rect.width > 0 && rect.height > 0 && target !== scrolledTarget) {
        scrolledTarget = target;
        target.scrollIntoView({ block: tallGroup || rect.height > height - 120 ? 'start' : 'center', behavior: 'instant' });
        rect = targetRect();
      }
      // If the group cannot fit, spotlight its final controls rather than the
      // clipped gap above them (which can include the fixed navigation header).
      if (tallGroup && target) rect = target.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right) {
        let l = Math.max(bounds.left, rect.left - 7), t = Math.max(bounds.top, rect.top - 7);
        let r = Math.min(bounds.right, rect.right + 7), b = Math.min(bounds.bottom, rect.bottom + 7);
        if (r + gap + box.width <= bounds.right) { left = r + gap; top = clampY(t); }
        else if (l - gap - box.width >= bounds.left) { left = l - gap - box.width; top = clampY(t); }
        else if (b + gap + box.height <= bounds.bottom) { top = b + gap; left = clampX(l); }
        else if (t - gap - box.height >= bounds.top) { top = t - gap - box.height; left = clampX(l); }
        else {
          const rightSpace = bounds.right - r - gap, leftSpace = l - bounds.left - gap;
          if (Math.max(rightSpace, leftSpace) >= 280) {
            // Keep a wide form visible by fitting the explanation into its side margin.
            const onRight = rightSpace >= leftSpace;
            card.style.width = `${Math.min(440, onRight ? rightSpace : leftSpace)}px`;
            box = card.getBoundingClientRect();
            left = onRight ? r + gap : l - gap - box.width; top = clampY(t);
          } else {
            // A centered fallback hides the thing being explained. Reserve a separate
            // vertical band for the card, and scroll long explanatory content inside it.
            const viewportKey = `${width}:${height}`;
            if (target && stackedViewport !== viewportKey) {
              stackedViewport = viewportKey;
              target.scrollIntoView({ block: 'start', behavior: 'instant' });
              rect = tallGroup ? target.getBoundingClientRect() : targetRect()!;
              l = Math.max(bounds.left, rect.left - 7); t = Math.max(bounds.top, rect.top - 7);
              r = Math.min(bounds.right, rect.right + 7); b = Math.min(bounds.bottom, rect.bottom + 7);
            }
            const above = t - bounds.top - gap, below = bounds.bottom - b - gap;
            const minCardHeight = Math.min(240, height * .5);
            if (Math.max(above, below) >= minCardHeight) {
              const onBottom = below >= above;
              limitHeight(onBottom ? below : above);
              box = card.getBoundingClientRect();
              top = onBottom ? b + gap : t - gap - box.height;
            } else {
              // On a small screen a tall target cannot fit in one viewport. Highlight
              // its visible portion ABOVE the bottom sheet, never underneath the card.
              limitHeight(Math.min(height - 114, height * .45));
              box = card.getBoundingClientRect();
              top = bounds.bottom - box.height;
              b = Math.min(b, top - gap);
            }
            left = clampX(l);
          }
        }
        if (r > l && b > t) highlight = { left: l, top: t, width: r - l, height: b - t };
      }
      if (content) content.scrollTop = contentScrollTop;
      const next = { left, top, highlight, illustrated };
      setPlacement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    function schedule() { if (frame !== undefined) cancelAnimationFrame(frame); frame = requestAnimationFrame(position); }
    function onScroll(event: Event) {
      if (event.target instanceof Element && event.target.closest('.wqi-guide')) return;
      schedule();
    }
    position(); schedule();
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    if (panel.current) resize?.observe(panel.current);
    if (step.target) document.querySelectorAll(step.target).forEach(target => resize?.observe(target));
    const mutations = new MutationObserver(records => {
      // Ignore our own position styles so observing visibility changes cannot create a frame loop.
      if (records.some(record => !(record.target instanceof Element) || !record.target.closest('.wqi-guide'))) schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'style', 'class'] });
    window.addEventListener('resize', schedule); window.addEventListener('scroll', onScroll, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', onScroll, true);
      window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [index, locale, step.target, step.Example, step.stage, stage, stageReady]);
  return createPortal(<dialog ref={dialog} className="wqi-guide" aria-label={msg(title)} aria-describedby={descriptionId}
    data-guide-id={id} data-guide-stage={step.stage ?? run.stage} onClick={event => event.stopPropagation()}
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
        <div id={descriptionId}><p>{msg(step.body)}</p>{step.Content && <step.Content/>}{placement?.illustrated && step.Example && <step.Example/>}</div>
      </div>
      <div className="wqi-guide-footer"><button type="button" className="btn btn-ghost" onClick={() => onEnd('skip')}>{msg('guide.skip')}</button>
        <div className="wqi-guide-navigation">
          {index > run.startIndex && <button type="button" className="btn btn-secondary" onClick={() => setIndex(value => value - 1)}>{msg('guide.back')}</button>}
          <button type="button" className="btn btn-primary" onClick={() => index === run.steps.length - 1 ? onEnd('finish') : setIndex(value => value + 1)}>
            {msg(index === run.steps.length - 1 ? 'guide.finish' : 'guide.next')}<Icon name={index === run.steps.length - 1 ? 'check' : 'arrowRight'}/>
          </button>
        </div>
      </div>
    </div>
  </dialog>, document.body);
}
