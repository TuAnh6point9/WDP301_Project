import { messageText, errorText } from '@/i18n/messages';
import { displayText } from '@/i18n';
import { msg, useLocale } from '@/i18n';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseDecimal, predictionParametersSchema, USER_MESSAGES, validationIssueMessage, userErrorMessage, fieldErrorMessage, rangeMessage } from '@wqi/contracts';
import { usePolledAsync } from '@/lib/usePolledAsync';
import { ApiError } from '@/lib/http';
import { Icon } from '@/components/Icon';
import { aiWaking, calculateWqi, getAiStatus, previewWqi, rememberPreview } from '../api';
import { INPUT_FIELDS } from '../inputFields';
import { ResearchNote } from '../components/ResearchNote';
import type { Inputs } from '../types';
import { useAuth } from '@/features/auth/AuthContext';
import { ExcelFileButton } from '../components/ExcelFileButton';
import { CalculateGuide } from '../components/CalculateGuide';
import { FeatureGuide } from '@/features/guides/FeatureGuide';

const EMPTY = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, ''])) as Record<keyof Inputs, string>;
type FieldErrors = Partial<Record<keyof Inputs, string>>;

export function CalculatePage() {
  useLocale();
  const navigate = useNavigate();
  const { user, status: authStatus, sessionEpoch } = useAuth();
  const currentSession = useRef(sessionEpoch);
  currentSession.current = sessionEpoch;
  const aiStatus = usePolledAsync(getAiStatus, aiWaking);
  const { data: ai, loading: checking, waiting: waking, reload } = aiStatus;
  const statusError = waking ? null : aiStatus.error;
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Inputs, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState('');
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Text inputs: a number input would turn "7,2" into 72 or empty in some browsers (decision 24 reads it as 7.2).
  const candidate = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, parseDecimal(values[field.key])])) as Inputs;
  const parsed = predictionParametersSchema.safeParse(candidate);
  const errors: FieldErrors = {};
  if (!parsed.success) for (const issue of parsed.error.issues) errors[issue.path[0] as keyof Inputs] = validationIssueMessage(issue);
  for (const field of INPUT_FIELDS) {
    const domain = ai?.inputDomain?.[field.key];
    if (!errors[field.key] && domain && (candidate[field.key] < domain.min || candidate[field.key] > domain.max)) errors[field.key] = rangeMessage(domain.min, domain.max);
  }
  // Decision 28: fields are typed in model order, so every field after the first invalid one stays locked (values are kept).
  const firstInvalid = INPUT_FIELDS.findIndex(field => errors[field.key]);
  // A visitor's result is not saved, so wait until we know whether someone is signed in.
  const blocked = uploading || checking || waking || Boolean(statusError) || !ai?.available || authStatus === 'loading';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || blocked) return;
    setSubmitted(true); setServerErrors({}); setFailure('');
    if (!parsed.success || Object.keys(errors).length) {
      document.getElementById(INPUT_FIELDS.find(field => errors[field.key])?.key ?? '')?.focus();
      return;
    }
    inFlight.current = true; setSending(true);
    const submittedSession = sessionEpoch;
    try {
      if (user) {
        const saved = await calculateWqi(parsed.data);
        if (mounted.current && submittedSession === currentSession.current) navigate(`/result?id=${encodeURIComponent(saved.id)}`);
      } else {
        const preview = await previewWqi(parsed.data);
        if (mounted.current && submittedSession === currentSession.current) { rememberPreview(preview); navigate('/result/preview', { state: { preview } }); }
      }
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
      if (error instanceof ApiError && ((error.code === 'NETWORK_ERROR' && error.status === 0) || ['REQUEST_TIMEOUT', 'AI_TIMEOUT'].includes(error.code))) setFailure(user ? USER_MESSAGES.WQI_RETRY : USER_MESSAGES.TIMEOUT);
    } finally {
      inFlight.current = false;
      if (mounted.current) setSending(false);
    }
  }
  function reset(event: FormEvent<HTMLFormElement>) {
    if (inFlight.current) { event.preventDefault(); return; }
    setValues(EMPTY); setTouched({}); setSubmitted(false); setServerErrors({}); setFailure('');
  }

  return <main className="container page">
    <div className="page-narrow">
      <div className="stack-24">
        <div className="wqi-page-heading">
          <div className="stack-4" data-wqi-guide="intro"><h1 className="h1">{msg('predictions.calculateTitle')}</h1><p className="sub">{msg('predictions.calculateHint')}</p></div>
          <CalculateGuide busy={sending || uploading}/>
        </div>
        <form className="card card-pad-lg stack-24 wqi-input-form" onSubmit={submit} onReset={reset} noValidate aria-busy={sending}>
          <div className="grid wqi-input-grid" data-wqi-guide="inputs" style={{ gap: 20 }}>
            {INPUT_FIELDS.map((field, index) => {
              // The user asked for a plain lock: no red message under a locked field (03/11).
              const lockedBy = firstInvalid >= 0 && index > firstInvalid;
              const issue = lockedBy ? undefined : serverErrors[field.key] || (touched[field.key] || submitted ? errors[field.key] : undefined);
              const input = <input id={field.key} className={lockedBy ? 'input is-locked' : issue ? 'input is-error' : 'input'} type="text" inputMode="decimal" autoComplete="off" value={values[field.key]} disabled={sending || Boolean(lockedBy)} aria-invalid={Boolean(issue)} aria-describedby={`${field.key}-hint`} onChange={event => { setValues(previous => ({ ...previous, [field.key]: event.target.value })); setServerErrors(previous => ({ ...previous, [field.key]: undefined })); }} onBlur={() => setTouched(previous => ({ ...previous, [field.key]: true }))}/>;
              return <div className="field" key={field.key}>
                <label className="label" htmlFor={field.key}>{displayText(field.label)}</label>
                {field.referenceUnit ? <div className="input-unit">{input}<em>{field.referenceUnit}</em></div> : input}
                <span className={issue ? 'hint is-error' : 'hint'} id={`${field.key}-hint`}>{issue ? messageText(issue) : displayText(field.referenceHint)}</span>
              </div>;
            })}
          </div>
          <div data-wqi-guide="validation"><ResearchNote unitStatus={ai?.unitStatus} referenceBasis={ai?.referenceBasis}/></div>
          {failure && <div className="callout callout-warn" role="alert"><Icon name="warn"/><span>{messageText(failure)}</span></div>}
          {(checking || waking || statusError || !ai?.available) && <div className={checking || waking ? 'callout callout-neutral' : 'callout callout-warn'} role={checking || waking ? 'status' : 'alert'}>
            {!checking && !waking && <Icon name="warn"/>}
            <span className="grow">{msg('predictions.aiService')}{' '}{waking ? msg('predictions.aiStarting') : checking ? msg('predictions.checking') : statusError ? `${messageText(USER_MESSAGES.STATUS_UNAVAILABLE)} ${errorText(statusError, USER_MESSAGES.AI_UNAVAILABLE)}` : `${messageText(ai?.configured ? USER_MESSAGES.STATUS_NOT_READY : USER_MESSAGES.STATUS_NOT_CONFIGURED)} ${messageText(USER_MESSAGES.AI_UNAVAILABLE)}`}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={checking || sending}>{msg('predictions.checkAgain')}</button>
          </div>}
          <div className="row row-wrap" data-wqi-guide="actions" style={{ gap: 12 }}>
            <button type="submit" className="btn btn-primary btn-lg grow" disabled={sending || blocked}><Icon name="sparkle"/>{sending ? msg('predictions.calculating') : msg('common.calculate')}</button>
            <button type="reset" className="btn btn-secondary btn-lg" disabled={sending}>{msg('common.reset')}</button>
          </div>
          {authStatus !== 'loading' && <div className="excel-form-footer stack-12" data-tour="excel-user-upload">{user
            ? <ExcelFileButton disabled={sending} onBusyChange={setUploading}/>
            : <div className="stack-8"><p className="small text-2 guest-excel"><Icon name="user"/><span>{msg('predictions.guestHint')}</span></p><p className="small text-2 guest-excel"><Icon name="spreadsheet"/><span>{msg('predictions.guestExcel')} <Link to="/login" state={{ from: '/calculate' }} className="link">{msg('auth.login')}</Link></span></p></div>}
            <div><FeatureGuide id="excel-user" stage="prepare" autoStart={false} busy={sending || uploading}/></div>
          </div>}
        </form>
      </div>
    </div>
  </main>;
}
