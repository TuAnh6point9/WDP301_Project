import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '@/lib/useAsync';
import { calculateWqi, getAiStatus } from '../api';
import { INPUT_FIELDS } from '../inputFields';
import type { Inputs } from '../types';
import { Icon } from '@/components/Icon';

const EMPTY = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, ''])) as Record<keyof Inputs, string>;
type Step = 'idle' | 'validating' | 'sending';

export function CalculatePage() {
  const navigate = useNavigate();
  const { data: ai } = useAsync(getAiStatus);
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Inputs, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [failure, setFailure] = useState('');

  function problem(key: keyof Inputs) {
    const field = INPUT_FIELDS.find(item => item.key === key)!;
    const raw = values[key].trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) return { error: true, text: 'Enter a number' };
    if (value < field.min || value > field.max) return { error: true, text: `Valid range: ${field.min}–${field.max.toLocaleString('en-US')}` };
    if (field.warnAbove !== undefined && value > field.warnAbove) return { error: false, warn: true, text: `Exceeds recommended threshold (≤ ${field.warnAbove} ${field.unit})` };
    return null;
  }
  const blocking = INPUT_FIELDS.some(field => problem(field.key)?.error);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (blocking) return;
    setFailure('');
    setStep('validating');
    const inputs = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, Number(values[field.key])])) as Inputs;
    setStep('sending');
    try {
      const result = await calculateWqi(inputs);
      navigate(`/result?id=${result.id}`);
    } catch (error) {
      setStep('idle');
      setFailure(error instanceof Error ? error.message : 'The AI Service did not respond.');
    }
  }

  const stepClass = (index: number) => {
    const current = step === 'idle' ? -1 : step === 'validating' ? 0 : 1;
    return current > index ? 'step done' : current === index ? 'step running' : 'step todo';
  };

  return <main className="container page">
    <div className="split" style={{ '--split': 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '32px' } as CSSProperties}>
      {/* FORM */}
      <div className="stack-24">
        <div className="stack-4">
          <h1 className="h1">Calculate WQI with AI</h1>
          <p className="sub">Enter 6 measured water quality parameters for the system to predict the WQI score.</p>
        </div>
        <form className="card card-pad-lg stack-24" onSubmit={submit} onReset={() => { setValues(EMPTY); setTouched({}); setSubmitted(false); setStep('idle'); setFailure(''); }} noValidate>
          <div className="grid cols-2" style={{ gap: 20 }}>
            {INPUT_FIELDS.map(field => {
              // Errors show once the field was edited or the form was submitted, not on an empty form.
              const issue = touched[field.key] || submitted ? problem(field.key) : null;
              const input = <input id={field.key} className={issue ? 'input is-error' : 'input'} type="number" step={field.step} value={values[field.key]} aria-invalid={issue?.error || undefined} aria-describedby={`${field.key}-hint`} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} onBlur={() => setTouched(previous => ({ ...previous, [field.key]: true }))}/>;
              return <div className="field" key={field.key}>
                <label className="label" htmlFor={field.key}>{field.label}</label>
                {field.unit ? <div className="input-unit">{input}<em>{field.unit}</em></div> : input}
                {issue
                  ? <span className="hint is-error" id={`${field.key}-hint`}><svg className="i-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>{issue.text}</span>
                  : <span className="hint" id={`${field.key}-hint`}>Valid range: {field.min}–{field.max.toLocaleString('en-US')}</span>}
              </div>;
            })}
          </div>
          <div className="callout callout-neutral">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <span>These 6 parameters are sent to the AI Service for preprocessing and inference using the selected AI model. The final parameter list will follow the official specification provided by the AI team.</span>
          </div>
          {failure && <div className="callout callout-warn" role="alert"><Icon name="warn"/><span>{failure} Please try again.</span></div>}
          <div className="row row-wrap" style={{ gap: 12 }}>
            <button type="submit" className="btn btn-primary btn-lg grow" disabled={step !== 'idle'}>
              <Icon name="sparkle"/>
              {step === 'idle' ? 'Calculate WQI' : 'Calculating…'}
            </button>
            <button type="reset" className="btn btn-secondary btn-lg">Reset</button>
          </div>
        </form>
      </div>

      {/* SIDE */}
      <aside className="stack-20">
        <div className="card-dark card-pad stack-12">
          <div className="row">
            <span className="stat-icon" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}><Icon name="sparkle"/></span>
            <h2 className="h3">About the AI Model</h2>
          </div>
          <p style={{ fontSize: 13, color: '#B9C6CE', lineHeight: 1.65 }}>The AI Service accepts 6 input values, preprocesses them following the correct units and variable order, then runs inference with the trained model to return the WQI score and classification.</p>
          <div className="stack-8" style={{ marginTop: 4 }}>
            <span className={ai?.available ? 'status ok' : 'status off'} style={{ color: ai?.available ? '#6FD69C' : '#8FA6B2' }}><span style={{ color: '#E5EAEE', fontWeight: 500 }}>AI Service: {ai ? ai.available ? 'Operational' : 'Not connected' : 'Checking…'}</span></span>
            <span className="status ok" style={{ color: '#6FD69C' }}><span style={{ color: '#E5EAEE', fontWeight: 500 }}>Consistent results across Web &amp; Mobile</span></span>
          </div>
        </div>
        <div className="card card-pad stack">
          <h2 className="h3">Processing Status</h2>
          <div className="steps" aria-live="polite">
            {['Validating input data', 'Sending to AI Service…', 'Receiving WQI result'].map((label, index) => <div key={label} className={stepClass(index)}>
              <span className="step-ic">{stepClass(index) === 'step done' && <Icon name="check" strokeWidth={3}/>}</span>
              {label}
            </div>)}
          </div>
        </div>
        <div className="callout callout-warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.96L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
          <span>If the AI Service does not respond, the system will display an error message and allow you to retry.</span>
        </div>
      </aside>
    </div>
  </main>;
}
