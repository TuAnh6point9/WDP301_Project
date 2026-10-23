import { messageText } from '@/i18n/messages';
import { qualityLabel, displayText } from '@/i18n';
import { msg, useLocale, formatNumber } from '@/i18n';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { useAuth } from '@/features/auth/AuthContext';
import { getCalculation } from '../api';
import { fieldsForSnapshot } from '../snapshotFields';
import { ClassificationBadge } from '../components/ClassificationBadge';
import { CLASSIFICATION_COLORS, WQI_DISPLAY_BANDS } from '../classificationDisplay';
import { INPUT_FIELDS } from '../inputFields';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { displayModelVersion } from '../modelIdentity';

export function ResultPage() {
  useLocale();
  const id = useSearchParams()[0].get('id');
  const { user, sessionEpoch } = useAuth();
  const { data: calc, error, loading, reload } = useAsync(() => getCalculation(id), [id, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : calc ? 'ready' : 'empty');
  if (loading || error) return <PageStatus error={error} onRetry={reload}/>;
  if (!calc) return <PageStatus empty={messageText(M.RESULT_NOT_FOUND)}/>;

  const currentFields = INPUT_FIELDS.filter(field => Object.hasOwn(calc.inputs, field.key))
    .map(field => ({ key: field.key, label: field.key === 'do' ? 'DO' : field.label }));
  const historicalFields = fieldsForSnapshot(calc).filter(field => !INPUT_FIELDS.some(current => current.key === field.key));
  const fields = [...currentFields, ...historicalFields];

  return <main className="container page result-page">
    <h1 className="h1">{msg('predictions.resultTitle')}</h1>
    <section className="card card-pad-lg result-card" aria-label={msg('predictions.savedResult')}>
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
      </div>
      <p className="small text-2 result-note">{msg('predictions.researchNote')}</p>
      <div className="result-actions">
        <Link to="/calculate" className="btn btn-primary">{msg('predictions.again')}</Link>
        <Link to="/history" className="btn btn-secondary">{msg('predictions.viewHistory')}</Link>
      </div>
      <details className="result-technical" key={calc.id}>
        <summary>{msg('predictions.technical')}</summary>
        <dl>
          <div><dt>{msg('predictions.modelVersion')}</dt><dd>{calc.modelVersion ? displayModelVersion(calc.modelVersion) : msg('common.notRecorded')}</dd></div>
          <div><dt>{msg('predictions.modelAlgorithm')}</dt><dd>{calc.algorithm ?? msg('common.notRecorded')}</dd></div>
          <div><dt>{msg('predictions.score')}</dt><dd>{calc.rawWqi === undefined ? msg('common.notRecorded') : formatNumber(calc.rawWqi, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
          {calc.id && <div><dt>{msg('predictions.recordId')}</dt><dd>{calc.id}</dd></div>}
        </dl>
      </details>
    </section>
  </main>;
}
