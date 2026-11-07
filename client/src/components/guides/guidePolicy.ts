// Which guides have been seen: per account (after a finish or skip) and per device for guests. Shared with the Android app.
export type GuideId = 'calculate' | 'chart' | 'excel-user' | 'excel-admin';
export type GuideStage = 'overview' | 'prepare' | 'preview' | 'progress' | 'results' | 'fill' | 'overwrite' | 'history';
export type Preference = { dismissed: boolean; completed: string[] };
const memory = new Map<string, Preference>();
export const flowGuide = (id: GuideId) => id === 'excel-user' || id === 'excel-admin';
const preferenceKey = (id: GuideId, accountId: string, version = flowGuide(id) ? 'v2' : 'v1') => `wqi.guide.account.${accountId}.${id}.${version}`;
export function preferences(id: GuideId, accountId: string): Preference {
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
// A guest has no account: a guide that has opened once counts as seen on this browser (user, 06/11). Kept apart from
// account keys, so a guest's choice never decides an account's.
const guestKey = (id: GuideId) => `wqi.guide.guest.${id}.${flowGuide(id) ? 'v2' : 'v1'}`;
export function guestPreference(id: GuideId): Preference {
  const key = guestKey(id);
  try { return { dismissed: memory.has(key) || localStorage.getItem(key) === 'seen', completed: [] }; }
  catch { return { dismissed: memory.has(key), completed: [] }; }
}
export function markGuestSeen(id: GuideId) {
  try { localStorage.setItem(guestKey(id), 'seen'); } catch { memory.set(guestKey(id), { dismissed: true, completed: [] }); } // storage blocked: this session only
}
export function remember(id: GuideId, accountId: string, stage: GuideStage, skipped: boolean) {
  const key = preferenceKey(id, accountId);
  const previous = preferences(id, accountId);
  const next = { dismissed: previous.dismissed || skipped, completed: [...new Set([...previous.completed, flowGuide(id) ? 'flow' : stage])] };
  try { localStorage.setItem(key, id === 'calculate' ? 'done' : JSON.stringify(next)); memory.delete(key); }
  catch { memory.set(key, next); }
}
