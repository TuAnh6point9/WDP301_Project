import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { Icon } from './Icon';

export function LoadingIndicator({ label = msg('common.loadingPage'), scope = 'page', announce = true }: { label?: string; scope?: 'page' | 'fullscreen' | 'inline'; announce?: boolean }) {
  useLocale();
  return <div className={`loading-indicator loading-indicator--${scope}`} role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined} aria-atomic={announce ? true : undefined}>
    {scope === 'inline'
      ? <Icon name="drop" className="loading-drop"/>
      : <span className="loading-water" aria-hidden="true">
        <span className="loading-pool"/>
        <span className="loading-ripple"/>
        <span className="loading-ripple loading-ripple--echo"/>
        <Icon name="drop" className="loading-drop"/>
      </span>}
    {scope === 'inline'
      ? <span className="loading-copy"><span className="loading-label">{displayText(label)}</span></span>
      : announce && <span className="sr-only">{displayText(label)}</span>}
  </div>;
}
