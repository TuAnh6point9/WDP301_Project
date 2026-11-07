import { USER_MESSAGES as M } from '@wqi/contracts';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { msg } from '@/i18n';
import { errorSource } from '@/i18n/messages';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The web downloads the file; the phone saves it to its cache and opens Android's share sheet (Drive, Zalo, Files…). Same file name as the web. */
export async function saveAndShare(blob: Blob, name: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error(msg('mobile.shareUnavailable'));
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: XLSX, dialogTitle: msg('mobile.share') });
}

/** The web's useCalculationExcel for any server Excel file: `failure` holds the untranslated message for the alert. */
export function useShareExcel() {
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const running = useRef(false);
  async function share(load: () => Promise<Blob>, name: string) {
    if (running.current) return;
    running.current = true; setBusy(true); setFailure('');
    try { await saveAndShare(await load(), name); } catch (error) { setFailure(errorSource(error, M.DOWNLOAD_FAILED)); }
    finally { running.current = false; setBusy(false); }
  }
  return { busy, failure, share };
}
