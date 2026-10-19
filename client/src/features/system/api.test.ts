import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { http } from '@/lib/http';
import { getDashboardSummary, getSystemHealth, listAuditLogs } from './api';
import { listUsers } from '@/features/users/api';
import { listImportBatches } from '@/features/imports/api';
import { listAdminRecords } from '@/features/water-records/api';

const originalAdapter = http.defaults.adapter;
afterEach(() => { http.defaults.adapter = originalAdapter; });

describe('"All time" range', () => {
  it('sends no day bounds so older pending records and accounts stay reachable', async () => {
    const sent: Record<string, unknown>[] = [];
    http.defaults.adapter = async config => { sent.push(config.params); return { data: { data: [], meta: { page: 1, limit: 20, total: 0, pages: 0 } }, status: 200, statusText: 'OK', headers: {}, config }; };
    const all = { from: '', to: '' };
    await getDashboardSummary(all);
    await listAuditLogs({ ...all, page: 1, limit: 5 });
    await listUsers({ ...all, page: 1 });
    await listImportBatches({ ...all, page: 1 });
    await listAdminRecords({ status: 'pending', createdFrom: '', createdTo: '', page: 1 });
    for (const params of sent) for (const key of ['from', 'to', 'createdFrom', 'createdTo']) expect(params[key]).toBeUndefined();
  });
});

describe('system health adapter', () => {
  it('reports each component from its own endpoint and marks an unreachable one down', async () => {
    http.defaults.adapter = async config => {
      if (config.url === '/predictions/status') throw new AxiosError('down', 'ERR_NETWORK', config);
      const data = config.url === '/health/live' ? { status: 'ok' } : { database: 'connected' };
      return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
    };
    const health = await getSystemHealth();
    expect(health.components).toEqual({ 'Backend API': 'ok', Database: 'ok', 'AI Service': 'down' });
    expect(Number.isNaN(Date.parse(health.checkedAt))).toBe(false);
  });
});
