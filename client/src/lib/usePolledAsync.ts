import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads once, then loads again every `everyMs` while `keepWaiting` says the answer is "not yet",
 * for at most `forMs` per round. The last answer stays visible during automatic re-checks, so nothing flickers.
 * `reload` starts a new round (for a "Check again" button).
 */
export function usePolledAsync<T>(load: () => Promise<T>, keepWaiting: (data: T | undefined, error: Error | null) => boolean, everyMs = 10_000, forMs = 180_000) {
  const [state, setState] = useState<{ data?: T; error: Error | null; loading: boolean; waiting: boolean }>({ error: null, loading: true, waiting: false });
  const [round, setRound] = useState(0);
  const latest = useRef({ load, keepWaiting });
  latest.current = { load, keepWaiting };
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    setState(previous => previous.waiting ? previous : { ...previous, loading: true });
    async function run() {
      let data: T | undefined, error: Error | null = null;
      try { data = await latest.current.load(); } catch (failure) { error = failure instanceof Error ? failure : new Error(String(failure)); }
      if (!active) return;
      const waiting = latest.current.keepWaiting(data, error) && Date.now() - started < forMs;
      setState({ data, error, loading: false, waiting });
      if (waiting) timer = setTimeout(() => void run(), everyMs);
    }
    void run();
    return () => { active = false; clearTimeout(timer); };
  }, [round, everyMs, forMs]);
  const reload = useCallback(() => setRound(n => n + 1), []);
  return { ...state, reload };
}
