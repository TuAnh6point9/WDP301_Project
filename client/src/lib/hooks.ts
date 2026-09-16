import { useEffect, useState } from 'react';
import axios from 'axios';
import type { ApiResponse, Station } from '@wqi/contracts';
import { api, errorMessage } from './axios';
export function useApi<T>(path: string | null) {
  const [response, setResponse] = useState<ApiResponse<T> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setError(''); setLoading(Boolean(path));
    if (path) api.get<ApiResponse<T>>(path, { signal: controller.signal }).then(result => setResponse(result.data)).catch(error => {
      if (!axios.isCancel(error)) setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, revision]);
  return { data: response?.data, meta: response?.meta, error, loading, reload: () => setRevision(value => value + 1) };
}
export function useStations() {
  const [data, setData] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData([]);
    async function load() {
      const stations: Station[] = [];
      let page = 1;
      let pages = 1;
      do {
        const response = await api.get<ApiResponse<Station[]>>(`/stations?page=${page}&limit=100`, { signal: controller.signal });
        stations.push(...response.data.data);
        pages = response.data.meta?.pages || 1;
        page += 1;
      } while (page <= pages);
      if (!controller.signal.aborted) setData(stations);
    }
    void load().catch(error => { if (!axios.isCancel(error)) setError(errorMessage(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return { data, loading, error, reload: () => setRevision(value => value + 1) };
}
