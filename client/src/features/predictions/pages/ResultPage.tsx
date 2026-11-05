import { errorText, messageText } from '@/i18n/messages';
import { qualityLabel, displayText } from '@/i18n';
import { msg, useLocale, formatNumber } from '@/i18n';
import { USER_MESSAGES as M, inputFlag } from '@wqi/contracts';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '@/components/Icon';
import { PageStatus } from '@/components/PageStatus';
import { useAuth } from '@/features/auth/AuthContext';
import { calculateWqi, forgetPreview, getCalculation, readPreview } from '../api';
import { fieldsForSnapshot } from '../snapshotFields';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { CLASSIFICATION_COLORS, WQI_DISPLAY_BANDS } from '../classificationDisplay';
import { INPUT_FIELDS } from '../inputFields';
import { flagHint, flagLabel } from '../flags';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { displayModelVersion } from '../modelIdentity';
import type { Inputs, PreviewCalculation } from '../types';

function ResultView({ calc, id, actions, notice }: { calc: PreviewCalculation; id?: string; actions: ReactNode; notice?: ReactNode }) {
  const currentFields = INPUT_FIELDS.filter(field => Object.hasOwn(calc.inputs, field.key))
    .map(field => ({ key: field.key, label: field.key === 'do' ? 'DO' : field.label }));
  const historicalFields = fieldsForSnapshot(calc).filter(field => !INPUT_FIELDS.some(current => current.key === field.key));
  const fields = [...currentFields, ...historicalFields];
  const flagged = currentFields.flatMap(field => { const flag = inputFlag(field.key, calc.inputs[field.key]); return flag ? [{ ...field, flag }] : []; });

  return <main className="container page result-page">
    <h1 className="h1">{msg('predictions.resultTitle')}</h1>
    <section className="card card-pad-lg result-card" aria-label={msg(id ? 'predictions.savedResult' : 'predictions.unsavedResult')}>
      <time className="small text-2" dateTime={calc.at}>{msg('predictions.calculated')}{' '}{formatDateTime(calc.at)}</time>
      <div className="result-score-row">
        <div className="result-score"><span className="num">{calc.wqi}</span><span className="text-2"> / 100</span></div>
        <ClassificationBadge value={calc.qualityClass} large/>
      </div>
      <div className="result-scale-section">
        <div className="result-scale" role="meter" aria-label={msg('predictions.wqiScore')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={calc.wqi} aria-valuetext={`${calc.wqi} / 100 · ${qualityLabel(calc.qualityClass)}`}>
          <div className="result-scale-track" aria-hidden="true">{WQI_DISPLAY_BANDS.map((band, index) =>
            <span key={band.label} className="result-scale-segment" style={{ backgroundColor: CLASSIFICATION_COLORS[band.label].background, flex: (WQI_DISPLAY_BANDS[index + 1]?.min ?? 100) - band.min }}/>
          )}</div>
          <span className="result-scale-marker" style={{ left: `${calc.wqi}%` }} aria-hidden="true"/>
        </div>
        <ul className="result-band-legend" aria-label={msg('predictions.displayBands')}>{WQI_DISPLAY_BANDS.map(band =>
          <li key={band.label} aria-current={calc.qualityClass === band.label ? 'true' : undefined}>
            <span className="result-band-swatch" style={{ backgroundColor: CLASSIFICATION_COLORS[band.label].background }} aria-hidden="true"/>
            <span className="result-band-label">{`${qualityLabel(band.label)} · ${band.min}–${band.max}`}</span>
            {calc.qualityClass === band.label && <span className="result-band-current">{msg('predictions.current')}</span>}
          </li>
        )}</ul>
      </div>
      <div className="stack-12">
        <h2 className="h3">{msg('predictions.inputValues')}</h2>
        <dl className="tiles result-inputs">{fields.map(field =>
          <div key={field.key} className="tile"><dt className="tile-label">{displayText(field.label)}</dt><dd className="tile-value">{calc.inputs[field.key]}</dd></div>
        )}</dl>
        {flagged.length > 0 && <div className="callout callout-warn"><Icon name="warn"/><div>
          <span>{msg('flags.checkResult')}</span>
          <ul className="callout-list">{flagged.map(field => <li key={field.key}><b>{displayText(field.label)} {calc.inputs[field.key]}</b> — {flagLabel(field.flag)}: {flagHint(field.flag)}</li>)}</ul>
        </div></div>}
      </div>
      <p className="small text-2 result-note">{msg('predictions.researchNote')}</p>
      {notice}
      <div className="result-actions">{actions}</div>
      <details className="result-technical" key={id ?? calc.at}>
        <summary>{msg('predictions.technical')}</summary>
        <dl>
          <div><dt>{msg('predictions.modelVersion')}</dt><dd>{calc.modelVersion ? displayModelVersion(calc.modelVersion) : msg('common.notRecorded')}</dd></div>
          <div><dt>{msg('predictions.modelAlgorithm')}</dt><dd>{calc.algorithm ?? msg('common.notRecorded')}</dd></div>
          <div><dt>{msg('predictions.score')}</dt><dd>{calc.rawWqi === undefined ? msg('common.notRecorded') : formatNumber(calc.rawWqi, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
          {id && <div><dt>{msg('predictions.recordId')}</dt><dd>{id}</dd></div>}
        </dl>
      </details>
    </section>
  </main>;
}

/** A saved calculation, read back from the signed-in user's history. */
export function ResultPage() {
  useLocale();
  const id = useSearchParams()[0].get('id');
  const { user, sessionEpoch } = useAuth();
  const { data: calc, error, loading, reload } = useAsync(() => getCalculation(id), [id, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : calc ? 'ready' : 'empty');
  if (loading || error) return <PageStatus error={error} onRetry={reload}/>;
  if (!calc) return <PageStatus empty={messageText(M.RESULT_NOT_FOUND)}/>;
  return <ResultView calc={calc} id={calc.id} actions={<>
    <Link to="/calculate" className="btn btn-primary">{msg('predictions.again')}</Link>
    <Link to="/history" className="btn btn-secondary">{msg('predictions.viewHistory')}</Link>
  </>}/>;
}

/** A visitor's unsaved result. Saving needs an account; after signing in the save happens by itself. */
export function PreviewResultPage() {
  useLocale();
  const { user, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [calc] = useState(() => (location.state as { preview?: PreviewCalculation } | null)?.preview ?? readPreview());
  const wantsSave = new URLSearchParams(location.search).has('save');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const started = useRef(false);
  usePageReadiness(calc ? 'ready' : 'empty');

  const save = useCallback(async () => {
    if (!calc || started.current) return;
    started.current = true; setSaving(true); setFailure(null);
    try {
      // The server recalculates from the six inputs; a result is never stored from the browser's numbers.
      const saved = await calculateWqi(calc.inputs as Inputs);
      forgetPreview();
      navigate(`/result?id=${encodeURIComponent(saved.id)}`, { replace: true });
    } catch (error) {
      started.current = false; setSaving(false);
      setFailure(error);
    }
  }, [calc, navigate]);
  useEffect(() => { if (wantsSave && user && calc) void save(); }, [wantsSave, user, calc, save]);

  if (!calc) return <PageStatus empty={msg('predictions.noUnsaved')}/>;
  const saveButton = user
    ? <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}><Icon name="save"/>{saving ? msg('common.saving') : msg('predictions.saveResult')}</button>
    : <button type="button" className="btn btn-primary" onClick={() => navigate('/login', { state: { from: '/result/preview?save=1' } })} disabled={status === 'loading'}><Icon name="save"/>{msg('predictions.signInToSave')}</button>;
  return <ResultView calc={calc} actions={<>{saveButton}<Link to="/calculate" className="btn btn-secondary">{msg('predictions.again')}</Link></>} notice={<>
    <div className="callout callout-neutral"><Icon name="info"/><span>{msg(user ? 'predictions.notSavedYet' : 'predictions.notSavedGuest')}</span></div>
    {failure !== null && <div className="callout callout-warn" role="alert"><Icon name="warn"/><span>{errorText(failure, M.CALCULATE_FAILED)}</span></div>}
  </>}/>;
}
