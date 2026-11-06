import { msg, useLocale } from '@/i18n';
import { Link } from 'react-router-dom';
import { useAsync } from '@/lib/useAsync';
import { PageStatus } from '@/components/PageStatus';
import { Icon } from '@/components/Icon';
import { Brand } from '@/components/Brand';
import { useAuth } from '@/features/auth/AuthContext';
import { listCalculationPage } from '@/features/predictions/api';
import { fieldsForRows, templateColumn } from '@/features/predictions/snapshotFields';
import { useCalculationExcel } from '@/features/predictions/useCalculationExcel';
import { messageText } from '@/i18n/messages';
import { ClassificationBadge } from '@/features/predictions/components/ClassificationBadge';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';

// The printed article is Vietnamese in either language and never names the model (user's request 06/11).
// Same "dd/mm/yyyy hh:mm" as the downloaded .xlsx (vi-VN alone puts the time first).
const viTime = (at: string) => { const d = new Date(at), two = (n: number) => String(n).padStart(2, '0'); return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };

/** A limited, printable preview of the current user's latest calculations. */
export function ReportPage() {
  useLocale();
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listCalculationPage(1, 20), [user?._id, sessionEpoch]);
  const excel = useCalculationExcel();
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.data.length ? 'ready' : 'empty');
  if (loading || error || !data) return <PageStatus error={error} onRetry={reload}/>;
  const rows = data.data;
  const fields = fieldsForRows(rows);
  return <main className="container page">
    <div className="stack-4 report-head"><Link to="/history" className="back-link"><Icon name="back"/>{msg('common.history')}</Link><h1 className="h1">{msg('report.title')}</h1><p className="sub">{msg('report.description')}</p></div>
    <div className="report-layout">
      <aside className="card card-pad stack-24 report-options">
        <div className="stack-8"><span className="label-caps">{msg('report.scope')}</span><p className="small text-2">{msg('report.latest')}{' '}{rows.length} {msg('common.of')} {data.meta.total} {' '}{msg('report.scopeHint')}</p><Link to="/history" className="link small">{msg('report.allHistory')}</Link></div>
        <hr className="divider"/>
        <div className="stack-8"><span className="label-caps">{msg('common.download')}</span><button type="button" className="btn btn-primary" disabled={!rows.length} onClick={() => window.print()}><Icon name="download"/>{msg('report.print')}</button><button type="button" className="btn btn-secondary" disabled={!rows.length || excel.busy} aria-busy={excel.busy} onClick={() => void excel.download(1, 20, '20-lan-tinh-wqi-gan-nhat.xlsx')}><Icon name="download"/>{excel.busy ? msg('common.downloading') : msg('report.excel')}</button>{excel.failure && <div className="callout callout-warn small" role="alert">{messageText(excel.failure)}</div>}</div>
      </aside>
      <section className="preview-stage" aria-label={msg('report.preview')}><article className="paper" lang="vi">
        <div className="row-between" style={{ borderBottom: '2px solid var(--ink)', paddingBottom: 16 }}><div className="brand" style={{ fontSize: 14 }}><Brand small/>WQI An Kim Hải</div><span className="muted" style={{ fontSize: 11 }}>Ngày lập {viTime(new Date().toISOString())}</span></div>
        <div className="stack-4"><h2 className="num" style={{ fontSize: 20 }}>Báo cáo lịch sử tính WQI</h2><p className="small text-2">{rows.length} trên {data.meta.total} lượt tính gần nhất · {user?.name}</p></div>
        <p className="small text-2">Mỗi dòng là một lượt tính đã lưu, cột đặt tên theo file mẫu nhập liệu. Ô trống (—) là thông số không có trong lượt tính đó.</p>
        <div className="stack-8"><h3 className="h4">Thông số đầu vào và kết quả</h3><div className="table-wrap"><table className="table"><thead><tr><th>Thời gian tính</th>{fields.map(field => <th key={field.key}>{templateColumn(field.key)}</th>)}<th>WQI</th><th>Phân loại</th></tr></thead><tbody>{!rows.length && <tr><td colSpan={fields.length + 3} className="muted">Chưa có lượt tính nào.</td></tr>}{rows.map(item => <tr key={item.id}><td>{viTime(item.at)}</td>{fields.map(field => <td key={field.key}>{item.inputs[field.key] ?? '—'}</td>)}<td className="strong">{item.wqi}</td><td><ClassificationBadge value={item.qualityClass} locale="vi"/></td></tr>)}</tbody></table></div></div>
        <hr className="divider"/><p className="muted" style={{ fontSize: 10.5, textAlign: 'center' }}>WQI An Kim Hải · Chỉ gồm 20 lượt tính gần nhất</p>
      </article></section>
    </div>
  </main>;
}
