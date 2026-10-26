import { messageText, errorText } from '@/i18n/messages';
import { msg, useLocale, displayText } from '@/i18n';
import { Component, Suspense, createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type MouseEvent } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { pageIdentity, type PageReadiness, type TransitionStore } from './transitionStore';
import { captureNavigationScroll, navigationPositions } from './navigationScroll';

type TransitionContext = { store: TransitionStore; snapshot: ReturnType<TransitionStore['getSnapshot']> };
const Context = createContext<TransitionContext | null>(null);

export function NavigationTransitionProvider({ store, children }: { store: TransitionStore; children: ReactNode }) {
  useLocale();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const location = useLocation();
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const change = () => store.setReducedMotion(media.matches);
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [store]);
  useLayoutEffect(() => {
    if (!snapshot.busy) return;
    const frame = requestAnimationFrame(() => store.markVisible(snapshot.generation));
    return () => cancelAnimationFrame(frame);
  }, [store, snapshot.generation, snapshot.busy]);

  function samePage(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && url.pathname === location.pathname && url.search === location.search && url.hash === location.hash) event.preventDefault();
  }
  return <Context.Provider value={{ store, snapshot }}>
    <div className="navigation-root" onClickCapture={samePage}>
      <a className="skip-link" href="#page-content">{msg('common.skipContent')}</a>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{snapshot.busy ? snapshot.longWait ? msg('common.stillLoading') : displayText(snapshot.meta.loadingLabel) : ''}</div>
      <NavigationEffects/>
      {children}
    </div>
  </Context.Provider>;
}

/** A page reports essential data, not secondary media/health requests. Safe outside the app provider in standalone tests. */
export function usePageReadiness(state: PageReadiness) {
  const context = useContext(Context);
  const location = useLocation();
  useLayoutEffect(() => {
    if (context && context.snapshot.identity === pageIdentity(location)) context.store.pageReady(context.snapshot.generation, state);
  }, [context?.store, context?.snapshot.generation, state, location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function usePageTransitionPending() { return useContext(Context)?.snapshot.busy ?? false; }

function ModuleCommit({ children }: { children: ReactNode }) {
  useLocale();
  const context = useContext(Context);
  const location = useLocation();
  useLayoutEffect(() => {
    if (context && context.snapshot.identity === pageIdentity(location)) context.store.moduleReady(context.snapshot.generation);
  }, [context?.store, context?.snapshot.generation, location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  return children;
}
function PageFailure({ error }: { error: Error }) {
  useLocale();
  usePageReadiness('error');
  return <main className="container page"><h1 className="h1">{messageText(M.PAGE_LOAD_TITLE)}</h1><p className="sub">{errorText(error, M.PAGE_LOAD_FAILED)}</p><div className="row row-wrap"><button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>{msg('common.reloadPage')}</button><a className="btn btn-secondary" href="/">{msg('common.backHome')}</a></div></main>;
}
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error : new Error(M.PAGE_LOAD_FAILED) }; }
  render() { return this.state.error ? <PageFailure error={this.state.error}/> : this.props.children; }
}
export function RoutePage({ children }: { children: ReactNode }) {
  useLocale();
  const location = useLocation();
  return <RouteErrorBoundary key={pageIdentity(location)}><Suspense fallback={null}><ModuleCommit>{children}</ModuleCommit></Suspense></RouteErrorBoundary>;
}

export function TransitionViewport({ children, scope = 'page' }: { children: ReactNode; scope?: 'page' | 'fullscreen' }) {
  useLocale();
  const context = useContext(Context);
  const content = useRef<HTMLDivElement>(null);
  const waiting = useRef<HTMLDivElement>(null);
  const owns = context && (scope === 'fullscreen' ? context.snapshot.fullscreen : !context.snapshot.fullscreen);
  const busy = Boolean(owns && context.snapshot.busy);
  useLayoutEffect(() => {
    if (busy && content.current?.contains(document.activeElement)) waiting.current?.focus({ preventScroll: true });
  }, [busy]);
  return <div className={`transition-viewport transition-viewport--${scope}`} data-busy={busy} data-generation={owns ? context?.snapshot.generation : undefined}>
    <div ref={content} className="transition-content" data-transition-content inert={busy || undefined} aria-hidden={busy || undefined} aria-busy={busy || undefined}>
      {children}
    </div>
    <div ref={waiting} className="transition-loader" tabIndex={-1} aria-hidden={!busy} aria-label={busy ? displayText(context?.snapshot.meta.loadingLabel ?? '') : undefined}>
      {owns && <div aria-hidden="true"><LoadingIndicator key={context.snapshot.generation} label={context.snapshot.longWait ? msg('common.stillLoading') : displayText(context.snapshot.meta.loadingLabel)} scope={scope} announce={false}/></div>}
    </div>
  </div>;
}

/** Restore history positions only after essential content can provide its final scroll height. */
function NavigationEffects() {
  useLocale();
  const context = useContext(Context)!;
  const { snapshot } = context;
  const location = useLocation();
  const action = useNavigationType();
  const current = useRef({ key: location.key, identity: pageIdentity(location), generation: 0 });
  const restoredEntry = useRef('');
  const busyRef = useRef(snapshot.busy);
  busyRef.current = snapshot.busy;
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const save = () => { if (!busyRef.current) captureNavigationScroll(current.current.key); };
    window.addEventListener('scroll', save, { passive: true });
    return () => { window.history.scrollRestoration = previous; window.removeEventListener('scroll', save); };
  }, []);
  useLayoutEffect(() => {
    const sameIdentity = current.current.identity === pageIdentity(location);
    if (current.current.key !== location.key && sameIdentity && action !== 'POP') captureNavigationScroll(location.key);
    current.current.key = location.key;
    current.current.identity = pageIdentity(location);
    if (snapshot.busy || snapshot.identity !== pageIdentity(location)) return;
    const newPage = current.current.generation !== snapshot.generation;
    const newEntry = restoredEntry.current !== location.key;
    current.current.generation = snapshot.generation;
    restoredEntry.current = location.key;
    const frame = requestAnimationFrame(() => {
      if (location.hash) {
        try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); } catch { /* Invalid encoded anchors are ignored. */ }
      } else if (action === 'POP' && newEntry) {
        const position = navigationPositions.get(location.key) ?? { x: 0, y: 0 };
        window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
      } else if (newPage) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (!newPage) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('header, nav, aside.sidebar, dialog[open]')) return;
      const target = document.querySelector<HTMLElement>('#page-content h1, #page-content [data-page-heading], #page-content [role="alert"]');
      if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [location, action, snapshot.busy, snapshot.generation, snapshot.identity]);
  return null;
}
