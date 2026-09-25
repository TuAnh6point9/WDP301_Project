import { useCallback, useEffect, useState } from 'react';

export type AsyncState<T> = { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };

/** Runs an async loader when `deps` change and tracks its result; stale responses are ignored. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean }>({ error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState(previous => ({ ...previous, error: null, loading: true }));
    load().then(
      data => { if (active) setState({ data, error: null, loading: false }); },
      (error: unknown) => { if (active) setState(previous => ({ ...previous, error: error instanceof Error ? error : new Error(String(error)), loading: false })); },
    );
    return () => { active = false; };
    // `load` is usually an inline arrow; callers list what it reads in `deps`, so re-run only on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, data: state.data, reload };
}
