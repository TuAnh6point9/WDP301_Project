import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { msg, useLocale } from '@/i18n';
import { messageText } from '@/i18n/messages';
import { useAuth } from '@/features/auth/AuthContext';
import { getCalculationExcel, listCalculationPage } from '@/features/predictions/api';
import { fieldsForRows, templateColumn } from '@/features/predictions/snapshotFields';
import { useAsync } from '@/lib/useAsync';
import { RequireAuth } from '../RequireAuth';
import { useShareExcel } from '../share';
import { C, S } from '../theme';
import { Badge, Button, Callout, Card, Screen, Status, Title, ui } from '../ui';

// Same "dd/mm/yyyy hh:mm" as the web report and the downloaded .xlsx.
const viTime = (at: string) => { const d = new Date(at), two = (n: number) => String(n).padStart(2, '0'); return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };

/** The web report of the 20 latest calculations: Excel to share instead of printing; the preview stays Vietnamese like the printed page. */
export default function ReportScreen() {
  return <RequireAuth from="/report"><Report/></RequireAuth>;
}

function Report() {
  useLocale();
  const router = useRouter();
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(1, 20), [user?._id, sessionEpoch]);
  const excel = useShareExcel();
  if (loading || error || !data) return <Screen><Status loading={loading} error={error} onRetry={reload}/></Screen>;
  const rows = data.data, fields = fieldsForRows(rows);
  return <Screen>
    <Title hint={msg('mobile.reportDescription')}>{msg('report.title')}</Title>
    <Card>
      <Text style={ui.label}>{msg('report.scope')}</Text>
      <Text style={ui.muted}>{msg('report.latest')} {rows.length} {msg('common.of')} {data.meta.total} {msg('report.scopeHint')}</Text>
      <Button icon="download" label={excel.busy ? msg('common.downloading') : msg('mobile.reportExcel')} disabled={!rows.length} busy={excel.busy}
        onPress={() => void excel.share(() => getCalculationExcel(1, 20), '20-lan-tinh-wqi-gan-nhat.xlsx')}/>
      {excel.failure ? <Callout tone="warn">{messageText(excel.failure)}</Callout> : null}
      <Text style={ui.small}>{msg('mobile.reportHint')}</Text>
      <Button small variant="ghost" icon="clock" label={msg('report.allHistory')} onPress={() => router.back()}/>
    </Card>
    <Card>
      <View style={{ borderBottomWidth: 2, borderBottomColor: C.ink, paddingBottom: S.sm, gap: 2 }}>
        <Text style={ui.label}>WQI An Kim Hải</Text>
        <Text style={ui.small}>Ngày lập {viTime(new Date().toISOString())}</Text>
      </View>
      <Text style={ui.h3}>Báo cáo lịch sử dự đoán WQI</Text>
      <Text style={ui.small}>{rows.length} trên {data.meta.total} lượt tính gần nhất · {user?.name}</Text>
      <Text style={ui.small}>Mỗi dòng là một lượt tính đã lưu, cột đặt tên theo file mẫu nhập liệu. Ô trống (—) là thông số không có trong lượt tính đó.</Text>
      {!rows.length && <Text style={ui.muted}>Chưa có lượt tính nào.</Text>}
      {rows.map(item => <View key={item.id} style={styles.row}>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={ui.small}>{viTime(item.at)}</Text>
          <View style={ui.row}><Text style={ui.label}>WQI {item.wqi}</Text><Badge value={item.qualityClass} locale="vi"/></View>
        </View>
        <Text style={ui.small}>{fields.map(field => `${templateColumn(field.key)} ${item.inputs[field.key] ?? '—'}`).join(' · ')}</Text>
      </View>)}
      <Text style={[ui.small, { textAlign: 'center' }]}>WQI An Kim Hải · Chỉ gồm 20 lượt tính gần nhất</Text>
    </Card>
  </Screen>;
}

const styles = StyleSheet.create({ row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.sm, gap: 2 } });
