import { USER_MESSAGES as M, userErrorMessage } from '@wqi/contracts';
import { Icon } from './Icon';
import { LoadingIndicator } from './LoadingIndicator';
import { usePageReadiness, usePageTransitionPending } from '@/app/navigation/NavigationTransition';

/** Placeholder shown instead of a page while its data is loading, failed to load, or is empty. */
export function PageStatus({ error = null, onRetry, empty, admin = false, inline = false, label = 'Loading page…' }: { error?: Error | null; onRetry?: () => void; empty?: string; admin?: boolean; inline?: boolean; label?: string }) {
  usePageReadiness(error ? 'error' : empty ? 'empty' : 'pending');
  const transitionPending = usePageTransitionPending();
  const Container = inline ? 'div' : 'main';
  return <Container className={inline ? 'page-status-inline' : admin ? 'admin-body' : 'container page'}>
    {error
      ? <div className="callout callout-warn" role="alert">
        <Icon name="warn"/>
        <span className="grow">{userErrorMessage(error, M.LOAD_FAILED)}</span>
        {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}><Icon name="refresh"/>Retry</button>}
      </div>
      : empty
        ? <div className="callout callout-neutral"><Icon name="database"/><span>{empty}</span></div>
        : !transitionPending && <LoadingIndicator label={label} scope={inline ? 'inline' : 'page'}/>}
  </Container>;
}
