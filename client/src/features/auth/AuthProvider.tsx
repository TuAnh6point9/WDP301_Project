import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import type { User } from '@wqi/contracts';
import { api, errorMessage, setCsrfToken } from '../../lib/axios';
type Auth = { user: User | null; loading: boolean; error: string; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> };
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api.get('/auth/me', { signal: controller.signal }).then(result => setUser(result.data.data)).catch(error => {
      if (!axios.isCancel(error) && !(axios.isAxiosError(error) && error.response?.status === 401)) setError(errorMessage(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function login(email: string, password: string) {
    const result = await api.post('/auth/login', { email, password });
    setCsrfToken(result.data.data.csrfToken); setUser(result.data.data.user); setError('');
  }
  async function logout() { await api.post('/auth/logout'); setCsrfToken(null); setUser(null); }
  return <Context.Provider value={{ user, loading, error, login, logout }}>{children}</Context.Provider>;
}
export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
