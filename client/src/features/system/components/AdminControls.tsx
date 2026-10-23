import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useState } from 'react';
import type { PageMeta } from '@wqi/contracts';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import type { DateRange } from '../types';
import { defaultRange } from '../api';

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Sign in', 'user.create': 'Create user', 'user.update': 'Update user', 'user.lock': 'Lock user', 'user.unlock': 'Unlock user',
  'import.preview': 'Validate Excel', 'import.commit': 'Import Excel', 'import.normalize': 'Normalize row',
  'station.create': 'Create station', 'station.update': 'Update station', 'station.deactivate': 'Deactivate station',
  'record.review': 'Review record', 'system.error': 'Server error',
};

/** Creation-day filter; both days are inclusive (Asia/Saigon on the server). Empty days mean all time. */
export function DateRangeFields({ value, onChange, label = msg('common.created') }: { value: DateRange; onChange: (next: DateRange) => void; label?: string }) {
  useLocale();
  const all = !value.from && !value.to;
  return <>
    <input type="date" className="input sm" style={{ width: 150 }} aria-label={msg('common.fromLabel', { label: displayText(label) })} value={value.from} max={value.to || undefined} onChange={event => onChange({ ...value, from: event.target.value })}/>
    <input type="date" className="input sm" style={{ width: 150 }} aria-label={msg('common.toLabel', { label: displayText(label) })} value={value.to} min={value.from || undefined} onChange={event => onChange({ ...value, to: event.target.value })}/>
    <button type="button" className="btn btn-secondary btn-sm" aria-pressed={all} onClick={() => onChange(all ? defaultRange() : { from: '', to: '' })}>{all ? msg('admin.last30days') : msg('admin.allTime')}</button>
  </>;
}

export function Pager({ meta, onPage, noun }: { meta?: PageMeta; onPage: (page: number) => void; noun: string }) {
  useLocale();
  if (!meta) return null;
  return <div className="table-foot">
    <span className="small muted">{msg('common.pager', { total: meta.total, noun: displayText(noun), page: meta.page, pages: Math.max(meta.pages, 1) })}</span>
    <div className="pager">
      <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('common.previous')} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>‹</button>
      <button type="button" className="btn btn-secondary btn-sm is-current" aria-current="page">{meta.page}</button>
      <button type="button" className="btn btn-secondary btn-sm" aria-label={msg('common.next')} disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>›</button>
    </div>
  </div>;
}

/** The page is ready after its first load; later filter changes show feedback in place. */
export function useFirstLoadReadiness(loading: boolean, error: Error | null) {
  const [loaded, setLoaded] = useState(false);
  if (!loaded && !loading && !error) setLoaded(true);
  usePageReadiness(loaded ? 'ready' : error ? 'error' : 'pending');
}
