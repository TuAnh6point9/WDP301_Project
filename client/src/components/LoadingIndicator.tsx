import { Icon } from './Icon';

export function LoadingIndicator({ label = 'Loading page…', scope = 'page', announce = true }: { label?: string; scope?: 'page' | 'fullscreen' | 'inline'; announce?: boolean }) {
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
      ? <span className="loading-copy"><span className="loading-label">{label}</span></span>
      : announce && <span className="sr-only">{label}</span>}
  </div>;
}
