import { msg, useLocale } from '@/i18n';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const AREA_STORAGE_KEY = 'wqi.map.show-an-kim-hai-area';
const AreaContext = createContext<{ visible: boolean; setVisible: (visible: boolean) => void } | null>(null);

function readPreference() {
  try { return localStorage.getItem(AREA_STORAGE_KEY) !== 'false'; }
  catch { return true; }
}

export function AreaPreferenceProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [visible, setVisible] = useState(readPreference);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === AREA_STORAGE_KEY || event.key === null) setVisible(readPreference());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function update(next: boolean) {
    setVisible(next);
    try { localStorage.setItem(AREA_STORAGE_KEY, String(next)); } catch { /* Keep the in-session choice. */ }
  }
  return <AreaContext.Provider value={{ visible, setVisible: update }}>{children}</AreaContext.Provider>;
}

export function useAreaVisibility() {
  const context = useContext(AreaContext);
  if (!context) throw new Error('Map components require AreaPreferenceProvider.');
  return context;
}

export function AreaToggle() {
  useLocale();
  const { visible, setVisible } = useAreaVisibility();
  return <label className="map-area-toggle">
    <input type="checkbox" role="switch" checked={visible} onChange={event => setVisible(event.target.checked)}/>
    <span className="map-area-switch" aria-hidden="true"/>
    <span>{msg('map.area')}</span>
  </label>;
}
