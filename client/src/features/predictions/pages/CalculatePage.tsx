import { messageText, errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { predictionParametersSchema, USER_MESSAGES, validationIssueMessage, userErrorMessage, fieldErrorMessage, rangeMessage } from '@wqi/contracts';
import { useAsync } from '@/lib/useAsync';
import { ApiError } from '@/lib/http';
import { Icon } from '@/components/Icon';
import { calculateWqi, getAiStatus } from '../api';
import { INPUT_FIELDS } from '../inputFields';
import { ResearchNote } from '../components/ResearchNote';
import type { Inputs } from '../types';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { useAuth } from '@/features/auth/AuthContext';
import { ExcelFileButton } from '../components/ExcelFileButton';

const EMPTY = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, ''])) as Record<keyof Inputs, string>;
type FieldErrors = Partial<Record<keyof Inputs, string>>;

export function CalculatePage() {
  useLocale();
  const navigate = useNavigate();
  const { sessionEpoch } = useAuth();
  const currentSession = useRef(sessionEpoch);
  currentSession.current = sessionEpoch;
  const { data: ai, error: statusError, loading: checking, reload } = useAsync(getAiStatus);
  const [values, setValues] = useState(EMPTY);
  const [badInputs, setBadInputs] = useState<Partial<Record<keyof Inputs, boolean>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Inputs, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState('');
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const candidate = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, Number(values[field.key])])) as Inputs;
  const parsed = predictionParametersSchema.safeParse(candidate);
  const errors: FieldErrors = {};
  if (!parsed.success) for (const issue of parsed.error.issues) errors[issue.path[0] as keyof Inputs] = validationIssueMessage(issue);
  for (const field of INPUT_FIELDS) {
    if (!values[field.key].trim()) errors[field.key] = badInputs[field.key] ? USER_MESSAGES.INVALID_NUMBER : USER_MESSAGES.REQUIRED_NUMBER;
    const domain = ai?.inputDomain?.[field.key];
    if (!errors[field.key] && domain && (candidate[field.key] < domain.min || candidate[field.key] > domain.max)) errors[field.key] = rangeMessage(domain.min, domain.max);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uploading || checking || statusError || !ai?.available) return;
    setSubmitted(true); setServerErrors({}); setFailure('');
    if (!parsed.success || Object.keys(errors).length) {
      document.getElementById(INPUT_FIELDS.find(field => errors[field.key])?.key ?? '')?.focus();
      return;
    }
    inFlight.current = true; setSending(true);
    const submittedSession = sessionEpoch;
    try {
      const result = await calculateWqi(parsed.data);
      if (mounted.current && submittedSession === currentSession.current) navigate(`/result?id=${encodeURIComponent(result.id)}`);
    } catch (error) {
      if (!mounted.current || submittedSession !== currentSession.current) return;
      const details: FieldErrors = {};
      if (error instanceof ApiError && Array.isArray(error.details)) {
        for (const issue of error.details) {
          if (typeof issue.field !== 'string' || typeof issue.message !== 'string') continue;
          const key = issue.field.replace(/^parameters\./, '') as keyof Inputs;
          if (INPUT_FIELDS.some(field => field.key === key)) details[key] = fieldErrorMessage(key, issue.message);
        }
      } else if (error instanceof ApiError && error.code === 'AI_INPUT_OUTSIDE_DOMAIN' && error.details) {
        for (const [key, range] of Object.entries(error.details)) {
          const field = INPUT_FIELDS.find(item => item.key === key);
          if (field && range && Number.isFinite(range.min) && Number.isFinite(range.max)) details[field.key] = rangeMessage(range.min, range.max);
        }
      }
      setServerErrors(details);
      setFailure(userErrorMessage(error, USER_MESSAGES.CALCULATE_FAILED));
      if (error instanceof ApiError && ((error.code === 'NETWORK_ERROR' && error.status === 0) || ['REQUEST_TIMEOUT', 'AI_TIMEOUT'].includes(error.code))) setFailure(USER_MESSAGES.WQI_RETRY);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSending(false);
    }
  }
  function reset(event: FormEvent<HTMLFormElement>) {
    if (inFlight.current) { event.preventDefault(); return; }
    setValues(EMPTY); setBadInputs({}); setTouched({}); setSubmitted(false); setServerErrors({}); setFailure('');
  }

  return <main className="container page">
    <div className="split" style={{ '--split': 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '32px' } as CSSProperties}>
      <div className="stack-24">
        <div className="stack-4"><h1 className="h1">{msg('predictions.calculateTitle')}</h1><p className="sub">{msg('predictions.calculateHint')}</p></div>
        <form className="card card-pad-lg stack-24 wqi-input-form" onSubmit={submit} onReset={reset} noValidate aria-busy={sending}>
          <div className="grid wqi-input-grid" style={{ gap: 20 }}>
            {INPUT_FIELDS.map(field => {
              const issue = serverErrors[field.key] || (touched[field.key] || submitted ? errors[field.key] : undefined);
              const input = <input id={field.key} className={issue ? 'input is-error' : 'input'} type="number" step={field.step} value={values[field.key]} disabled={sending} aria-invalid={Boolean(issue)} aria-describedby={`${field.key}-hint`} onChange={event => { setValues(previous => ({ ...previous, [field.key]: event.target.value })); setBadInputs(previous => ({ ...previous, [field.key]: event.target.validity.badInput })); setServerErrors(previous => ({ ...previous, [field.key]: undefined })); }} onBlur={() => setTouched(previous => ({ ...previous, [field.key]: true }))}/>;
              return <div className="field" key={field.key}>
                <label className="label" htmlFor={field.key}>{displayText(field.label)}</label>
                {field.referenceUnit ? <div className="input-unit">{input}<em>{field.referenceUnit}</em></div> : input}
                <span className={issue ? 'hint is-error' : 'hint'} id={`${field.key}-hint`}>{issue ? messageText(issue) : displayText(field.referenceHint)}</span>
              </div>;
            })}
          </div>
          <ResearchNote unitStatus={ai?.unitStatus} referenceBasis={ai?.referenceBasis}/>
          {failure && <div className="callout callout-warn" role="alert"><Icon name="warn"/><span>{messageText(failure)}</span></div>}
          {(checking || statusError || !ai?.available) && <div className={checking ? 'callout callout-neutral' : 'callout callout-warn'} role={checking ? 'status' : 'alert'}>
            {!checking && <Icon name="warn"/>}
            <span className="grow">{msg('predictions.aiService')}{' '}{checking ? msg('predictions.checking') : statusError ? `${messageText(USER_MESSAGES.STATUS_UNAVAILABLE)} ${errorText(statusError, USER_MESSAGES.AI_UNAVAILABLE)}` : `${messageText(ai?.configured ? USER_MESSAGES.STATUS_NOT_READY : USER_MESSAGES.STATUS_NOT_CONFIGURED)} ${messageText(USER_MESSAGES.AI_UNAVAILABLE)}`}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={checking || sending}>{msg('predictions.checkAgain')}</button>
          </div>}
          <div className="row row-wrap" style={{ gap: 12 }}>
            <button type="submit" className="btn btn-primary btn-lg grow" disabled={sending || uploading || checking || Boolean(statusError) || !ai?.available}><Icon name="sparkle"/>{sending ? msg('predictions.calculating') : msg('common.calculate')}</button>
            <button type="reset" className="btn btn-secondary btn-lg" disabled={sending}>{msg('common.reset')}</button>
          </div>
          <div className="excel-form-footer"><ExcelFileButton disabled={sending} onBusyChange={setUploading}/></div>
        </form>
      </div>
      <aside className="stack-20">
        <div className="card card-pad stack"><h2 className="h3">{msg('predictions.processing')}</h2>{sending ? <LoadingIndicator label={msg('predictions.calculating')} scope="inline"/> : <p className="small text-2">{msg('predictions.ready')}</p>}</div>
        <div className="callout callout-neutral"><Icon name="drop"/><span>{msg('predictions.reviewInputs')}</span></div>
      </aside>
    </div>
  </main>;
}
