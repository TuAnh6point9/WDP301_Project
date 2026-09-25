import { Icon } from './Icon';

/** Placeholder shown instead of a page while its data is loading, failed to load, or is empty. */
export function PageStatus({ error = null, onRetry, empty, admin = false }: { error?: Error | null; onRetry?: () => void; empty?: string; admin?: boolean }) {
  return <main className={admin ? 'admin-body' : 'container page'}>
    {error
      ? <div className="callout callout-warn" role="alert">
        <Icon name="warn"/>
        <span className="grow">{error.message || 'Could not load data.'}</span>
        {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><Icon name="refresh"/>Retry</button>}
      </div>
      : empty
        ? <div className="callout callout-neutral"><Icon name="database"/><span>{empty}</span></div>
        : <p className="muted" aria-live="polite">Loading…</p>}
  </main>;
}
