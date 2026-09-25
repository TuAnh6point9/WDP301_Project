import { createContext, useContext, useState, type ReactNode } from 'react';

// Demo sign-in for the static prototype. There is no backend yet, so no password is checked
// or stored here; the visitor only picks a role. Real authentication belongs to the server.
export type Role = 'admin' | 'user';
export type DemoSession = { name: string; email: string; role: Role; initials: string };

const PROFILES: Record<Role, DemoSession> = {
  admin: { name: 'Demo Admin', email: 'admin@ankimhai.gov.vn', role: 'admin', initials: 'AD' },
  user: { name: 'Demo User', email: 'user@ankimhai.gov.vn', role: 'user', initials: 'DU' },
};
const KEY = 'wqi-demo-role';

type Auth = { user: DemoSession | null; signIn: (role: Role) => void; signOut: () => void };
const Context = createContext<Auth | null>(null);

function storedRole(): Role | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value === 'admin' || value === 'user' ? value : null;
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(storedRole);
  function signIn(next: Role) {
    try { sessionStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
    setRole(next);
  }
  function signOut() {
    try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    setRole(null);
  }
  return <Context.Provider value={{ user: role ? PROFILES[role] : null, signIn, signOut }}>{children}</Context.Provider>;
}

export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
