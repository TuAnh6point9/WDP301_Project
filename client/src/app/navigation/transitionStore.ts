export type PageReadiness = 'pending' | 'ready' | 'empty' | 'error';
export const NAVIGATION_MINIMUM_MS = 500;
export type PageLocation = { pathname: string; search: string; hash?: string };
export type TransitionRouteMeta = {
  layout: 'public' | 'admin' | 'auth';
  readiness: 'module' | 'page';
  loadingLabel: 'Loading page…' | 'Loading results…';
};

const DATA_PAGES = new Set(['/map', '/historical-data', '/result', '/history', '/report', '/admin', '/admin/data', '/admin/stations', '/admin/users', '/admin/status']);
export function routeMeta(location: PageLocation): TransitionRouteMeta {
  const path = location.pathname.replace(/\/$/, '') || '/';
  return {
    layout: path === '/login' ? 'auth' : path === '/admin' || path.startsWith('/admin/') ? 'admin' : 'public',
    readiness: DATA_PAGES.has(path) || path.startsWith('/excel/') || path === '/history/excel' ? 'page' : 'module',
    loadingLabel: ['/result', '/history', '/report', '/history/excel'].includes(path) || path.startsWith('/excel/') ? 'Loading results…' : 'Loading page…',
  };
}
export function pageIdentity(location: PageLocation) {
  const path = location.pathname.replace(/\/$/, '') || '/';
  return path + (path === '/result' ? `?id=${new URLSearchParams(location.search).get('id') ?? ''}` : '');
}
export function isProtectedPage(location: PageLocation) {
  return routeMeta(location).layout === 'admin' || ['/calculate', '/calculate/excel', '/result', '/history', '/history/excel', '/report'].includes(location.pathname) || location.pathname.startsWith('/excel/') || location.pathname.startsWith('/prediction-batches/');
}

type Snapshot = {
  generation: number; identity: string; meta: TransitionRouteMeta;
  busy: boolean; fullscreen: boolean; committed: boolean; longWait: boolean;
};

/** Visual waiting only: this store never schedules or delays an API request. */
export function createTransitionStore(initial: PageLocation) {
  let snapshot: Snapshot = { generation: 1, identity: pageIdentity(initial), meta: routeMeta(initial), busy: true, fullscreen: true, committed: true, longWait: false };
  let module = false;
  let readiness: PageReadiness = 'pending';
  let reduced = false;
  let minimumMs = NAVIGATION_MINIMUM_MS;
  let visibleAt: number | null = null;
  let minimumTimer: ReturnType<typeof setTimeout> | undefined;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function update(patch: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  }
  function clearTimers() { clearTimeout(minimumTimer); clearTimeout(longTimer); minimumTimer = longTimer = undefined; }
  function settle() {
    if (!snapshot.busy || !snapshot.committed) return;
    if (readiness === 'error') { clearTimers(); update({ busy: false, longWait: false }); return; }
    if (!module || (snapshot.meta.readiness === 'page' && readiness === 'pending')) return;
    if (reduced || minimumMs === 0 || (visibleAt !== null && Date.now() - visibleAt >= minimumMs)) { clearTimers(); update({ busy: false, longWait: false }); }
  }
  function schedule() {
    clearTimers();
    if (!snapshot.busy || visibleAt === null) return;
    const generation = snapshot.generation;
    const remaining = Math.max(0, minimumMs - (Date.now() - visibleAt));
    if (!reduced && remaining > 0) minimumTimer = setTimeout(() => { if (snapshot.generation === generation) settle(); }, remaining);
    longTimer = setTimeout(() => { if (snapshot.generation === generation && snapshot.busy) update({ longWait: true }); }, Math.max(0, 3000 - (Date.now() - visibleAt)));
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    navigate(location: PageLocation, { committed = true, continuation = false, force = false }: { committed?: boolean; continuation?: boolean; force?: boolean } = {}) {
      const identity = pageIdentity(location);
      if (snapshot.identity === identity && !force) {
        if (committed && !snapshot.committed) { update({ committed: true }); settle(); }
        return;
      }
      const meta = routeMeta(location);
      const keepClock = snapshot.busy && continuation;
      const fullscreen = (keepClock && snapshot.fullscreen) || snapshot.meta.layout !== meta.layout;
      clearTimers();
      if (!keepClock) { visibleAt = null; minimumMs = force ? 0 : NAVIGATION_MINIMUM_MS; }
      module = false; readiness = 'pending';
      update({ generation: snapshot.generation + 1, identity, meta, committed, busy: true, fullscreen, longWait: false });
      schedule();
    },
    markVisible(generation: number) {
      if (generation !== snapshot.generation || !snapshot.busy) return;
      visibleAt ??= Date.now();
      schedule(); settle();
    },
    moduleReady(generation: number) { if (generation !== snapshot.generation) return; module = true; settle(); },
    pageReady(generation: number, state: PageReadiness) {
      if (generation !== snapshot.generation || !snapshot.busy) return;
      readiness = state;
      settle();
    },
    setReducedMotion(value: boolean) { reduced = value; schedule(); settle(); },
    dispose() { clearTimers(); listeners.clear(); },
  };
}
export type TransitionStore = ReturnType<typeof createTransitionStore>;
