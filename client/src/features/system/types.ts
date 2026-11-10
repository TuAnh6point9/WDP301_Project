import type { PageMeta } from '@wqi/contracts';
export type Health = 'ok' | 'starting' | 'down';
export const COMPONENTS = ['Backend API', 'Database', 'AI Service'] as const;
export type ComponentName = typeof COMPONENTS[number];
export type SystemHealth = { checkedAt: string; components: Record<ComponentName, Health> };
/** Calendar days (YYYY-MM-DD) in Asia/Saigon, inclusive; filters by creation time. */
export type DateRange = { from: string; to: string };
export type DashboardSummary = {
  users: { total: number; active: number; admins: number }; stations: { active: number };
  imports: { batches: number; rows: number }; records: { pending: number; verified: number; rejected: number; locked?: number };
  predictions: number;
  /** All-time work waiting for an admin (not limited to the selected days). */
  queue?: { pendingRecords: number };
};
export type AuditLog = {
  _id: string; action: string; actorId: { _id: string; name: string; email: string } | null; target: string | null;
  outcome: 'success' | 'failure'; status: number; requestId: string; createdAt: string;
};
export type Page<T> = { data: T[]; meta: PageMeta };
