import { messageText } from '@/i18n/messages';
import { msg, useLocale } from '@/i18n';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { useAuth } from '@/features/auth/AuthContext';
import { batchFailure, previewWqiFile } from '../batch-api';

export function ExcelFileButton({ label = 'Excel', disabled = false, onBusyChange }: { label?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  useLocale();
  const navigate = useNavigate();
  const { sessionEpoch } = useAuth();
  const currentSession = useRef(sessionEpoch);
  currentSession.current = sessionEpoch;
  const input = useRef<HTMLInputElement>(null), inFlight = useRef(false), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const hintId = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // Allow selecting the same workbook again, including after a failed upload.
    if (!file || disabled || inFlight.current) return;
    setFailure('');
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setFailure('Please choose an .xlsx file up to 5 MB.'); return;
    }
    const submittedSession = sessionEpoch;
    inFlight.current = true; setBusy(true); onBusyChange?.(true);
    try {
      const preview = await previewWqiFile(file);
      if (mounted.current && submittedSession === currentSession.current) navigate(`/excel/${preview._id}`);
    } catch (error) {
      if (mounted.current && submittedSession === currentSession.current) setFailure(batchFailure(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  }

  return <div className="excel-file-action stack-8" aria-busy={busy}>
    <input ref={input} type="file" accept=".xlsx" aria-label={msg('excel.file')} hidden disabled={disabled || busy} onChange={event => void upload(event)}/>
    <div className="row row-wrap">
      <button type="button" className="btn btn-secondary excel-file-button" disabled={disabled || busy} aria-describedby={hintId} onClick={() => input.current?.click()}>
        <Icon name="spreadsheet"/>{busy ? msg('excel.reading') : label}
      </button>
      <span id={hintId} className="small text-2">{msg('excel.uploadLimits')}</span>
    </div>
    <p className="small text-2">{msg('excel.columnsHint')}</p>
    {busy && <LoadingIndicator scope="inline" label={msg('excel.checking')}/>}
    {failure && <p className="small" role="alert">{messageText(failure)}</p>}
  </div>;
}
