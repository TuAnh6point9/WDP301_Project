import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };

/** Runs an async loader when `deps` change and tracks its result; stale responses are ignored. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean; deps: unknown[]; attempt: number }>({ error: null, loading: true, deps: [...deps], attempt: 0 });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const identity = { deps: [...deps], attempt };
    setState({ ...identity, error: null, loading: true });
    load().then(
      data => { if (active) setState({ ...identity, data, error: null, loading: false }); },
      (error: unknown) => { if (active) setState({ ...identity, error: error instanceof Error ? error : new Error(String(error)), loading: false }); },
    );
    return () => { active = false; };
    // `load` is usually an inline arrow; callers list what it reads in `deps`, so re-run only on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  const current = state.attempt === attempt && state.deps.length === deps.length && state.deps.every((value, index) => Object.is(value, deps[index]));
  return current ? { data: state.data, error: state.error, loading: state.loading, reload } : { data: undefined, error: null, loading: true, reload };
}
