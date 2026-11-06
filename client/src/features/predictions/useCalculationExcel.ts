import { useRef, useState } from 'react';
import { USER_MESSAGES as M } from '@wqi/contracts';
import { errorSource } from '@/i18n/messages';
import { getCalculationExcel } from './api';

/** Downloads one page of the user's calculations as .xlsx; `failure` holds the untranslated message for the alert. */
export function useCalculationExcel() {
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const running = useRef(false);
  async function download(page: number, limit: number, fileName: string) {
    if (running.current) return;
    running.current = true; setBusy(true); setFailure('');
    try {
      const url = URL.createObjectURL(await getCalculationExcel(page, limit)), anchor = document.createElement('a');
      anchor.href = url; anchor.download = fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setFailure(errorSource(error, M.DOWNLOAD_FAILED)); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy, failure, download };
}
