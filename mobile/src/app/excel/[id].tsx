import { inputFlag, parseDecimal, rawColumns, rawParameterColumns, type PageMeta, type PredictionBatch, type PredictionBatchRow, type PredictionParameters, type RawColumn } from '@wqi/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayText, localeName, msg, useLocale } from '@/i18n';
import { messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { batchFailure, batchStatusLabels, getWqiBatch, getWqiBatchExcel, getWqiBatchRows, startWqiBatch } from '@/features/predictions/batch-api';
import { ExcelPick } from '../../ExcelPick';
import { RequireAuth } from '../../RequireAuth';
import { useShareExcel } from '../../share';
import { C, R, S } from '../../theme';
import { Badge, Button, Callout, Card, H2, Pager, Screen, Status, Toggle, ui } from '../../ui';

// Only the six model columns can carry a flag; Temp and BOD5 are kept but never used.
const KEY_OF = Object.fromEntries(Object.entries(rawParameterColumns).map(([key, column]) => [column, key])) as Partial<Record<RawColumn, keyof PredictionParameters>>;

/** FR-09: the web BatchPage — checked rows, start/continue, progress read again every 2 s while working, results to share. */
export default function BatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, sessionEpoch } = useAuth();
  return <RequireAuth from={`/excel/${id}`}><BatchContent key={`${user?._id}:${sessionEpoch}:${id}`} id={id}/></RequireAuth>;
}

function BatchContent({ id }: { id: string }) {
  useLocale();
  const [batch, setBatch] = useState<PredictionBatch>();
  const [rows, setRows] = useState<PredictionBatchRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>();
  const [page, setPage] = useState(1), [errorsOnly, setErrorsOnly] = useState(false);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [uploading, setUploading] = useState(false);
  const excel = useShareExcel();
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setFailure('');
    async function refresh() {
      try {
        const detail = await getWqiBatch(id);
        if (!active) return;
        // Rows are read after the status, so completion never shows an older table.
        const data = await getWqiBatchRows(id, page, errorsOnly);
        if (!active) return;
        setBatch(detail); setRows(data.rows); setMeta(data.meta); setFailure('');
        if (['queued', 'running'].includes(detail.status)) timer = setTimeout(refresh, 2000);
      } catch (error) {
        if (active) setFailure(batchFailure(error, 'Could not load the batch. Saved results are kept.'));
      } finally { if (active) setLoading(false); }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [id, page, errorsOnly, revision]);
  async function start() {
    if (inFlight.current || uploading) return;
    inFlight.current = true; setBusy(true); setFailure('');
    try { const updated = await startWqiBatch(id); if (mounted.current) { setBatch(updated); setRevision(n => n + 1); } }
    catch (error) { if (mounted.current) setFailure(batchFailure(error)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const completed = batch?.status === 'completed' || batch?.status === 'completed_with_errors';
  const working = batch?.status === 'queued' || batch?.status === 'running';
  const processed = batch ? batch.successCount + batch.errorCount : 0;
  const count = (n: number) => n.toLocaleString(localeName());

  return <Screen>
    <Text style={ui.muted}>{msg('excel.description')}</Text>
    {failure ? <Callout tone="warn" action={<Button small variant="secondary" icon="refresh" label={msg('common.tryAgain')} onPress={() => setRevision(n => n + 1)}/>}>{messageText(failure)}</Callout> : null}
    {!batch && loading && <Status loading label={msg('excel.loadingBatch')}/>}
    {batch && <>
      <Card>
        <View style={{ gap: S.xs }}>
          <H2>{batch.fileName}</H2>
          <View style={styles.status} accessibilityLiveRegion="polite"><Text style={[ui.small, { color: C.brand, fontWeight: '700' }]}>{displayText(batchStatusLabels[batch.status])}</Text></View>
        </View>
        <Text style={ui.text}>{msg('excel.rowsPrefix')} {count(batch.rowCount)}  {msg('excel.validPrefix')} {count(batch.validCount)}  {msg('excel.errorsPrefix')} {count(batch.invalidCount)}</Text>
        {batch.status !== 'preview' && <View style={{ gap: S.xs }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: batch.rowCount, now: processed }}>
          <Text style={ui.label}>{msg('excel.processed')} {processed}/{batch.rowCount}  {msg('excel.successPrefix')} {batch.successCount}  {msg('excel.errorPrefix')} {batch.errorCount}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${batch.rowCount ? processed / batch.rowCount * 100 : 0}%` }]}/></View>
        </View>}
        {working && <Text style={ui.muted}>{msg('excel.calculating')} {msg('excel.backgroundHint')}</Text>}
        {batch.status === 'paused' && <Callout tone="warn">{batch.pauseCode === 'AI_MODEL_CHANGED' ? msg('excel.changedModel') : msg('excel.interrupted')}</Callout>}
        {(batch.status === 'preview' || batch.status === 'paused') && <Button icon="sparkle" busy={busy} disabled={uploading || !batch.validCount || batch.pauseCode === 'AI_MODEL_CHANGED'} onPress={() => void start()}
          label={busy ? msg('excel.sending') : batch.status === 'paused' ? msg('excel.continue') : msg('excel.calculateRows', { count: batch.validCount })}/>}
        <Button variant={completed ? 'primary' : 'secondary'} icon="download" label={excel.busy ? msg('common.downloading') : msg('excel.downloadResults')} disabled={!completed || busy} busy={excel.busy}
          onPress={() => void excel.share(() => getWqiBatchExcel(id), `ket-qua-wqi-${id}.xlsx`)}/>
        {excel.failure ? <Callout tone="warn">{messageText(excel.failure)}</Callout> : null}
        <ExcelPick label={msg('excel.chooseAnother')} disabled={busy} onBusyChange={setUploading} replace/>
      </Card>
      <Card>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <H2>{msg('excel.dataResults')}</H2>
          <Toggle label={msg('excel.errorsOnly')} value={errorsOnly} onChange={on => { setErrorsOnly(on); setPage(1); }}/>
        </View>
        {!rows.length && <Text style={ui.muted}>{loading ? msg('common.loading') : errorsOnly ? msg('excel.noErrors') : msg('common.noDataPeriod')}</Text>}
        {rows.map(row => <View key={row._id} style={styles.row}>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <Text style={ui.label}>{msg('excel.excelRow')} {row.rowNumber}</Text>
            {row.result ? <View style={ui.row}><Text style={ui.label}>WQI {row.result.wqi}</Text><Badge value={row.result.qualityClass}/></View> : <Text style={ui.muted}>WQI —</Text>}
          </View>
          <View style={styles.values}>{rawColumns.map(column => {
            const key = KEY_OF[column], flag = key ? inputFlag(key, parseDecimal(row.values[column] ?? undefined)) : null;
            return <Text key={column} style={[ui.small, styles.cell, flag === 'likely-typo' && { color: C.danger, fontWeight: '700' }, flag === 'ai-unreliable' && { color: C.warn, fontWeight: '700' }]}>{column}: {row.values[column] ?? '—'}{flag ? ' ⚠' : ''}</Text>;
          })}</View>
          <Text style={[ui.small, row.issues.length ? { color: C.danger } : row.status === 'success' ? { color: C.ok } : null]}>{row.issues.length ? row.issues.map(messageText).join('; ') : row.status === 'success' ? msg('excel.succeeded') : msg('common.pending')}</Text>
        </View>)}
        <Pager meta={meta} onPage={setPage}/>
      </Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  status: { alignSelf: 'flex-start', backgroundColor: C.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  track: { height: 12, borderRadius: 6, backgroundColor: C.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: C.brand, borderRadius: R.sm },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, gap: S.xs },
  values: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 },
  cell: { width: '50%' },
});
