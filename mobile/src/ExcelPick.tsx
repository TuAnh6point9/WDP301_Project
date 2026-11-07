import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { msg, useLocale } from '@/i18n';
import { messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { batchFailure } from '@/features/predictions/batch-api';
import { fileProblem } from './predict';
import { S } from './theme';
import { Button, Callout, ui } from './ui';
import { pickWorkbook, uploadWorkbook } from './upload';

/** The web's ExcelFileButton: pick an .xlsx (≤ 5 MB), send it for checking, then open its batch screen. */
export function ExcelPick({ label, disabled = false, onBusyChange, replace = false }: { label?: string; disabled?: boolean; onBusyChange?: (busy: boolean) => void; replace?: boolean }) {
  useLocale();
  const router = useRouter();
  const { sessionEpoch } = useAuth();
  const session = useRef(sessionEpoch);
  session.current = sessionEpoch;
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function choose() {
    if (disabled || inFlight.current) return;
    setFailure('');
    inFlight.current = true;
    try {
      const file = await pickWorkbook();
      if (!file) return;
      const problem = fileProblem(file.name, file.size);
      if (problem) { setFailure(problem); return; }
      const started = sessionEpoch;
      setBusy(true); onBusyChange?.(true);
      const batch = await uploadWorkbook(file);
      if (!mounted.current || started !== session.current) return;
      const target = { pathname: '/excel/[id]' as const, params: { id: batch._id } };
      if (replace) router.replace(target); else router.push(target);
    } catch (error) { if (mounted.current) setFailure(batchFailure(error)); }
    finally { inFlight.current = false; if (mounted.current) { setBusy(false); onBusyChange?.(false); } }
  }
  return <View style={{ gap: S.sm }} accessibilityState={{ busy }}>
    <Button variant="secondary" icon="spreadsheet" label={busy ? msg('excel.reading') : label ?? msg('mobile.chooseExcel')} onPress={() => void choose()} disabled={disabled} busy={busy}/>
    <Text style={ui.small}>{msg('excel.uploadLimits')}</Text>
    <Text style={ui.small}>{msg('excel.columnsHint')}</Text>
    {busy && <Text style={ui.muted} accessibilityLiveRegion="polite">{msg('excel.checking')}</Text>}
    {failure ? <Callout tone="warn">{messageText(failure)}</Callout> : null}
  </View>;
}
