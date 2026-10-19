// System monitoring for admins (UC14) and dashboard counters (FR-10).
import { http } from '@/lib/http';
import { isoDaysAgo } from '@/lib/format';
import type { AuditLog, DashboardSummary, DateRange, Health, Page, SystemHealth } from './types';

/** The last 30 days, today included. */
export const defaultRange = (): DateRange => ({ from: isoDaysAgo(29), to: isoDaysAgo(0) });
/** Empty days mean "all time": the bound is left out of the query. */
export const bounds = (from: string, to: string) => ({ from: from || undefined, to: to || undefined });

export async function getSystemHealth(): Promise<SystemHealth> {
  const check = (url: string, ok: (data: Record<string, unknown>) => boolean) =>
    http.get<{ data: Record<string, unknown> }>(url).then(response => (ok(response.data.data) ? 'ok' : 'down') as Health, () => 'down' as Health);
  const [api, database, ai] = await Promise.all([
    check('/health/live', data => data.status === 'ok'),
    check('/health/ready', data => data.database === 'connected'),
    check('/predictions/status', data => data.available === true),
  ]);
  return { checkedAt: new Date().toISOString(), components: { 'Backend API': api, Database: database, 'AI Service': ai } };
}

export async function getDashboardSummary(range: DateRange): Promise<DashboardSummary> {
  return (await http.get<{ data: DashboardSummary }>('/dashboard/summary', { params: bounds(range.from, range.to) })).data.data;
}

export async function listAuditLogs(params: DateRange & { action?: string; page: number; limit: number }): Promise<Page<AuditLog>> {
  return (await http.get<Page<AuditLog>>('/audit-logs', { params: { ...params, ...bounds(params.from, params.to), action: params.action || undefined } })).data;
}
