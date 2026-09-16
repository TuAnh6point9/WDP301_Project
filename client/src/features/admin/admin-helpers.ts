import { useEffect, useState } from 'react';
import axios from 'axios';
import type { ApiResponse, Station } from '@wqi/contracts';
import { api, errorMessage } from '../../lib/axios';

export function useStationOptions() {
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const result: Station[] = [];
      let page = 1;
      while (!controller.signal.aborted) {
        const response = await api.get<ApiResponse<Station[]>>(`/stations?limit=100&page=${page}`, { signal: controller.signal });
        result.push(...response.data.data);
        if (!response.data.meta || page >= response.data.meta.pages) break;
        page += 1;
      }
      if (!controller.signal.aborted) setStations(result);
    }
    void load().catch(error => { if (!axios.isCancel(error)) setError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return { stations, error, loading };
}

export function vietnamTimestamp(value: string) {
  return `${value.length === 16 ? `${value}:00` : value}+07:00`;
}

export function formNumber(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
}
