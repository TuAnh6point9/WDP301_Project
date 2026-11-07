import { describe, expect, it } from 'vitest';
import { installStorage } from './boot';

function fakeAsyncStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getAllKeys: async () => [...data.keys()],
    multiGet: async (keys: readonly string[]) => keys.map(key => [key, data.get(key) ?? null] as [string, string | null]),
    setItem: async (key: string, value: string) => { data.set(key, value); },
    removeItem: async (key: string) => { data.delete(key); },
  };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('installStorage', () => {
  it('preloads saved keys so web code can read localStorage synchronously', async () => {
    const target: Record<string, unknown> = {};
    await installStorage(fakeAsyncStorage({ 'wqi.language': 'en', 'wqi.guide.guest.calculate.v2': 'seen' }), target);
    const local = target.localStorage as Storage;
    expect(local.getItem('wqi.language')).toBe('en');
    expect(local.getItem('missing')).toBeNull();
    expect(local.length).toBe(2);
    expect(local.key(5)).toBeNull();
  });
  it('writes localStorage changes through to the device store', async () => {
    const store = fakeAsyncStorage({ old: '1' });
    const target: Record<string, unknown> = {};
    await installStorage(store, target);
    const local = target.localStorage as Storage;
    local.setItem('wqi.language', 'vi');
    local.removeItem('old');
    await settle();
    expect(Object.fromEntries(store.data)).toEqual({ 'wqi.language': 'vi' });
    local.setItem('n', 5 as unknown as string);
    expect(local.getItem('n')).toBe('5');
  });
  it('keeps sessionStorage in memory only, like a browser tab', async () => {
    const store = fakeAsyncStorage();
    const target: Record<string, unknown> = {};
    await installStorage(store, target);
    (target.sessionStorage as Storage).setItem('wqi.preview', '{}');
    await settle();
    expect((target.sessionStorage as Storage).getItem('wqi.preview')).toBe('{}');
    expect(store.data.size).toBe(0);
  });
  it('still starts when the device store cannot be read', async () => {
    const target: Record<string, unknown> = {};
    const broken = { ...fakeAsyncStorage(), getAllKeys: async () => { throw new Error('locked'); } };
    await installStorage(broken, target);
    expect((target.localStorage as Storage).getItem('wqi.language')).toBeNull();
  });
});
