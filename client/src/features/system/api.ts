// System monitoring for admins (UC14) and dashboard counters.
// Backend endpoints (docs/openapi.yaml): GET /health/live, GET /health/ready, GET /predictions/status.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { DashboardSummary, SystemHealth } from './types';

/** Component keys match the names shown on the System Status page. */
export async function getSystemHealth(): Promise<SystemHealth> {
  return { checkedAt: null, components: {}, incidents: [], model: null };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return { stations: null, records: null, calculationsToday: null };
}
