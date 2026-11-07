import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayText, msg, useLocale } from '@/i18n';
import { messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { getCalculationExcel, listCalculationPage } from '@/features/predictions/api';
import { batchStatusLabels, listWqiBatches } from '@/features/predictions/batch-api';
import { fieldsForRows } from '@/features/predictions/snapshotFields';
import { formatDateTime } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/paging';
import { useAsync } from '@/lib/useAsync';
import { Icon } from '../../Icon';
import { RequireAuth } from '../../RequireAuth';
import { useShareExcel } from '../../share';
import { C, R, S } from '../../theme';
import { Badge, Button, Callout, Pager, Screen, Segmented, Status, Title, ui } from '../../ui';

/** FR-07: an account's own predictions (typed in or from Excel), 10 per page, each one reopened from here. */
export default function HistoryScreen() {
  useLocale();
  const { user, sessionEpoch } = useAuth();
  const [tab, setTab] = useState<'manual' | 'excel'>('manual');
  return <RequireAuth from="/history">
    <Screen>
      <Title hint={msg('history.description')}>{msg('history.title')}</Title>
      <Segmented label={msg('history.type')} value={tab} onChange={setTab} options={[{ value: 'manual', label: msg('history.manual') }, { value: 'excel', label: msg('history.excel') }]}/>
      {/* A new session starts clean, so one account's rows never stay on screen for the next. */}
      {tab === 'manual' ? <Manual key={`${user?._id}:${sessionEpoch}`}/> : <Batches key={`${user?._id}:${sessionEpoch}`}/>}
    </Screen>
  </RequireAuth>;
}

function Manual() {
  useLocale();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(page, PAGE_SIZE), [page], { keepPrevious: true });
  const excel = useShareExcel();
  const rows = data?.data ?? [];
  const fields = fieldsForRows(rows);
  return <>
    <View style={{ gap: S.sm }}>
      <Button variant="secondary" icon="download" label={excel.busy ? msg('common.downloading') : msg('history.exportPage')} busy={excel.busy} disabled={loading || Boolean(error) || !rows.length}
        onPress={() => data && void excel.share(() => getCalculationExcel(data.meta.page, PAGE_SIZE), `lich-su-tinh-wqi-trang-${data.meta.page}.xlsx`)}/>
      <Button variant="secondary" icon="file" label={msg('report.title')} onPress={() => router.push('/report')}/>
    </View>
    {excel.failure ? <Callout tone="warn">{messageText(excel.failure)}</Callout> : null}
    {(loading && !data) || error ? <Status loading={loading} error={error} onRetry={reload} label={msg('common.loadingResults')}/>
      : !rows.length ? <Status empty={msg('history.empty')}/>
        : rows.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${formatDateTime(item.at)}, WQI ${item.wqi}, ${msg('common.view')}`}
          onPress={() => router.push({ pathname: '/result', params: { id: item.id } })} android_ripple={{ color: '#0E6E8C22' }} style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={ui.small}>{formatDateTime(item.at)}</Text>
            <View style={ui.row}><Text style={styles.wqi}>{item.wqi}</Text><Badge value={item.qualityClass}/></View>
            <Text style={ui.small} numberOfLines={2}>{fields.map(field => `${displayText(field.label)} ${item.inputs[field.key] ?? '—'}`).join(' · ')}</Text>
          </View>
          <Icon name="chevronRight" size={22} color={C.muted}/>
        </Pressable>)}
    <Pager meta={data?.meta} onPage={setPage}/>
  </>;
}

function Batches() {
  useLocale();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => listWqiBatches(page), [page], { keepPrevious: true });
  return <>
    <Text style={ui.muted}>{msg('excel.historyHint')}</Text>
    <Button variant="secondary" icon="spreadsheet" label={msg('excel.newBatch')} onPress={() => router.navigate('/calculate')}/>
    {(loading && !data) || error ? <Status loading={loading} error={error} onRetry={reload}/>
      : !data?.rows.length ? <Status empty={msg('excel.emptyHistory')}/>
        : data.rows.map(batch => <Pressable key={batch._id} accessibilityRole="button" accessibilityLabel={`${batch.fileName}, ${msg('excel.openBatch')}`}
          onPress={() => router.push({ pathname: '/excel/[id]', params: { id: batch._id } })} android_ripple={{ color: '#0E6E8C22' }} style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={ui.label} numberOfLines={1}>{batch.fileName}</Text>
            <Text style={ui.small}>{formatDateTime(batch.createdAt)} · {displayText(batchStatusLabels[batch.status])}</Text>
            <Text style={ui.small}>{msg('excel.totalRows')}: {batch.rowCount} · {msg('excel.succeeded')}: {batch.successCount} · {msg('excel.errors')}: {batch.errorCount}</Text>
          </View>
          <Icon name="chevronRight" size={22} color={C.muted}/>
        </Pressable>)}
    <Pager meta={data?.meta} onPage={setPage}/>
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: S.md, minHeight: 64 },
  wqi: { fontSize: 22, fontWeight: '800', color: C.ink },
});
