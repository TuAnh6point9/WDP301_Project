import { USER_MESSAGES as M } from '@wqi/contracts';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApiResponse, User } from '@wqi/contracts';
import { ApiError, ensureCsrfToken, http, onSessionExpired, setCsrfToken } from '@/lib/http';

export type Role = User['role'];
type Status = 'loading' | 'authenticated' | 'anonymous' | 'error';
type Auth = {
  user: User | null; status: Status; error: Error | null; pending: boolean; sessionEpoch: number;
  signIn: (credentials: { email: string; password: string }) => Promise<User>;
  signOut: () => Promise<void>; refreshSession: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; status: Status; error: Error | null; sessionEpoch: number }>({ user: null, status: 'loading', error: null, sessionEpoch: 0 });
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const lifecycle = useRef({ mounted: true });
  const actionPending = useRef(false);
  const refreshSession = useCallback(async () => {
    const ticket = ++generation.current;
    setState(previous => ({ user: null, status: 'loading', error: null, sessionEpoch: previous.sessionEpoch + 1 }));
    try {
      await ensureCsrfToken();
      const response = await http.get<ApiResponse<User>>('/auth/me');
      if (ticket === generation.current) setState(previous => ({ ...previous, user: response.data.data, status: 'authenticated', error: null }));
    } catch (error) {
      if (ticket !== generation.current) return;
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') { setCsrfToken(null); setState(previous => ({ ...previous, user: null, status: 'anonymous', error: null })); }
      else setState(previous => ({ ...previous, user: null, status: 'error', error: error instanceof Error ? error : new Error(M.SESSION_RESTORE) }));
    }
  }, []);
  useEffect(() => {
    const lifetime = lifecycle.current;
    const restoreGeneration = generation;
    lifetime.mounted = true;
    const unsubscribe = onSessionExpired(() => {
      generation.current++;
      setState(previous => ({ user: null, status: 'anonymous', error: null, sessionEpoch: previous.sessionEpoch + 1 }));
    });
    void refreshSession();
    return () => { lifetime.mounted = false; restoreGeneration.current++; unsubscribe(); };
  }, [refreshSession]);

  async function signIn(credentials: { email: string; password: string }) {
    if (actionPending.current) throw new Error(M.SESSION_PENDING);
    actionPending.current = true; setPending(true); generation.current++;
    try {
      const response = await http.post<ApiResponse<{ user: User; csrfToken: string }>>('/auth/login', credentials);
      setCsrfToken(response.data.data.csrfToken);
      if (lifecycle.current.mounted) setState(previous => ({ user: response.data.data.user, status: 'authenticated', error: null, sessionEpoch: previous.sessionEpoch + 1 }));
      return response.data.data.user;
    } finally { actionPending.current = false; if (lifecycle.current.mounted) setPending(false); }
  }
  async function signOut() {
    if (actionPending.current) throw new Error(M.SESSION_PENDING);
    actionPending.current = true; setPending(true); generation.current++;
    try {
      await http.post('/auth/logout');
      setCsrfToken(null);
      if (lifecycle.current.mounted) setState(previous => ({ user: null, status: 'anonymous', error: null, sessionEpoch: previous.sessionEpoch + 1 }));
    } finally { actionPending.current = false; if (lifecycle.current.mounted) setPending(false); }
  }
  return <Context.Provider value={{ ...state, pending, signIn, signOut, refreshSession }}>{children}</Context.Provider>;
}

export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
