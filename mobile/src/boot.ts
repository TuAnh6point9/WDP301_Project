// The shared web code reads localStorage/sessionStorage synchronously. On Android we preload
// AsyncStorage once at startup into a synchronous Storage and write changes back in the background.
export type AsyncStore = {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function memoryStorage(data: Map<string, string>, persist?: AsyncStore): Storage {
  const write = (job: Promise<void> | undefined) => { void job?.catch(() => { /* The in-memory value still works this session. */ }); };
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); write(persist?.setItem(key, String(value))); },
    removeItem: key => { data.delete(key); write(persist?.removeItem(key)); },
    clear: () => { for (const key of [...data.keys()]) { data.delete(key); write(persist?.removeItem(key)); } },
  };
}

export async function installStorage(store: AsyncStore, target: object = globalThis): Promise<void> {
  const saved = new Map<string, string>();
  try {
    for (const [key, value] of await store.multiGet(await store.getAllKeys())) if (value !== null) saved.set(key, value);
  } catch { /* Start with defaults, like a browser with blocked storage. */ }
  Object.assign(target, { localStorage: memoryStorage(saved, store), sessionStorage: memoryStorage(new Map()) });
}
