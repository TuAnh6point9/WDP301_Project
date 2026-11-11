import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useState } from 'react';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import type { TranslationKey } from '@/i18n';
import type { ComponentName, DateRange, Health } from '../types';
import { defaultRange } from '../api';

// Plain names first; the technical check stays on the System Health page.
export const COMPONENT_LABEL: Record<ComponentName, TranslationKey> = { 'Backend API': 'admin.webServer', Database: 'admin.database', 'AI Service': 'admin.aiService' };
export const HEALTH_LABEL: Record<Health, TranslationKey> = { ok: 'admin.working', starting: 'admin.starting', down: 'admin.notRespondingShort' };
export const HEALTH_TONE: Record<Health, string> = { ok: 'ok', starting: 'wait', down: 'warn' };

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Sign in', 'user.create': 'Create user', 'user.update': 'Update user', 'user.lock': 'Lock user', 'user.unlock': 'Unlock user',
  'import.preview': 'Validate Excel', 'import.commit': 'Import Excel', 'import.normalize': 'Normalize row',
  'station.create': 'Create station', 'station.update': 'Update station', 'station.deactivate': 'Deactivate station',
  'record.review': 'Review record', 'settings.update': 'Change QCVN column', 'system.error': 'Server error',
};

/** Creation-day filter; both days are inclusive (Asia/Saigon on the server). Empty days mean all time. */
export function DateRangeFields({ value, onChange, label = msg('common.created') }: { value: DateRange; onChange: (next: DateRange) => void; label?: string }) {
  useLocale();
  const all = !value.from && !value.to;
  const recent = defaultRange();
  const lastMonth = value.from === recent.from && value.to === recent.to;
  return <div className="date-range" role="group" aria-label={displayText(label)}>
    <span className="date-range-title">{displayText(label)}</span>
    <label className="date-field">{msg('common.from')}<input type="date" className="input sm" value={value.from} max={value.to || undefined} onChange={event => onChange({ ...value, from: event.target.value })}/></label>
    <label className="date-field">{msg('common.to')}<input type="date" className="input sm" value={value.to} min={value.from || undefined} onChange={event => onChange({ ...value, to: event.target.value })}/></label>
    <div className="chips">
      <button type="button" className={all ? 'chip on' : 'chip'} aria-pressed={all} onClick={() => onChange({ from: '', to: '' })}>{msg('admin.allTime')}</button>
      <button type="button" className={lastMonth ? 'chip on' : 'chip'} aria-pressed={lastMonth} onClick={() => onChange(recent)}>{msg('admin.last30days')}</button>
    </div>
  </div>;
}

/** The page is ready after its first load; later filter changes show feedback in place. */
export function useFirstLoadReadiness(loading: boolean, error: Error | null) {
  const [loaded, setLoaded] = useState(false);
  if (!loaded && !loading && !error) setLoaded(true);
  usePageReadiness(loaded ? 'ready' : error ? 'error' : 'pending');
}
