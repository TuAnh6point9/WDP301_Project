import { useState, type FormEvent } from 'react';
import { DownloadSimple, Printer } from '@phosphor-icons/react';
import { parameterKeys, parameterLabels, type WaterRecord } from '@wqi/contracts';
import { download, errorMessage } from '../../lib/axios';
import { useApi } from '../../lib/hooks';
import { Alert, Empty, Loading, PageHeader, QualityBadge, StatusBadge, formatDate } from '../../components/ui';
import { useStationOptions, vietnamTimestamp } from './admin-helpers';

export function ReportsPage() {
  const [query, setQuery] = useState('');
  const [filterCaption, setFilterCaption] = useState('Tất cả trạm · Tất cả thời gian · Tất cả trạng thái');
  const records = useApi<WaterRecord[]>(`/reports/water-records${query}`);
  const stationOptions = useStationOptions();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const stationId = String(form.get('stationId') || '');
    const from = String(form.get('from') || ''); const to = String(form.get('to') || '');
    if (from && to && from >= to) { setError('Thời điểm kết thúc phải sau thời điểm bắt đầu.'); return; }
    const status = String(form.get('status') || '');
    const params = new URLSearchParams();
    if (stationId) params.set('stationId', stationId);
    if (from) params.set('from', vietnamTimestamp(from));
    if (to) params.set('to', vietnamTimestamp(to));
    if (status) params.set('status', status);
    setQuery(params.size ? `?${params}` : '');
    const statusLabel = { pending: 'Chờ kiểm định', verified: 'Đã kiểm định', rejected: 'Từ chối' }[status];
    setFilterCaption(`${stationOptions.stations.find(station => station._id === stationId)?.name || 'Tất cả trạm'} · ${from ? formatDate(vietnamTimestamp(from)) : 'Không giới hạn đầu'} → ${to ? formatDate(vietnamTimestamp(to)) : 'Không giới hạn cuối'} · ${statusLabel || 'Tất cả trạng thái'}`);
  }
  async function exportExcel() {
    setExporting(true); setError('');
    try { await download(`/reports/water-records.xlsx${query}`, 'water-records.xlsx'); }
    catch (error) { setError(errorMessage(error)); } finally { setExporting(false); }
  }
  const hasRecords = Boolean(records.data?.length);
  return <>
    <div className="no-print"><PageHeader title="Xuất báo cáo" description="Báo cáo từ dữ liệu thực trong hệ thống. Chỉ Admin có quyền nhập và xuất dữ liệu." actions={<div className="actions"><button className="button secondary" disabled={!hasRecords || records.loading || exporting} onClick={() => window.print()}><Printer size={18}/>In / Lưu PDF</button><button className="button" disabled={!hasRecords || records.loading || exporting} onClick={() => void exportExcel()}><DownloadSimple size={18}/>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>}/>
      <form className="panel filters" onSubmit={applyFilters}><label>Trạm<select name="stationId" disabled={stationOptions.loading}><option value="">Tất cả trạm</option>{stationOptions.stations.map(station => <option key={station._id} value={station._id}>{station.code} · {station.name}{!station.isActive ? ' (ngừng hoạt động)' : ''}</option>)}</select></label><label>Từ thời điểm (giờ Việt Nam)<input name="from" type="datetime-local"/></label><label>Đến trước thời điểm (giờ Việt Nam)<input name="to" type="datetime-local"/></label><label>Kiểm định<select name="status"><option value="">Tất cả trạng thái</option><option value="pending">Chờ kiểm định</option><option value="verified">Đã kiểm định</option><option value="rejected">Từ chối</option></select></label><button className="button secondary">Áp dụng bộ lọc</button></form>
      {error && <Alert>{error}</Alert>}{stationOptions.error && <Alert>{stationOptions.error}</Alert>}
    </div>
    <section className="panel print-report"><div className="section-heading"><div><h2>Báo cáo quan trắc An Kim Hải</h2><p>{filterCaption}</p><p>Nồng độ: mg/L · NH4+ theo ion · pH không đơn vị · Thời gian: giờ Việt Nam</p></div><span className="badge">{records.data?.length ?? '—'} bản ghi</span></div>
      {records.loading ? <Loading/> : records.error ? <Alert>{records.error}</Alert> : !hasRecords ? <Empty>Chưa có bản ghi phù hợp với bộ lọc để xuất báo cáo.</Empty> : <div className="table-scroll"><table><thead><tr><th>Trạm</th><th>Thời gian đo</th>{parameterKeys.map(key => <th key={key}>{parameterLabels[key]}</th>)}<th>WQI</th><th>Kiểm định</th><th>Nguồn</th></tr></thead><tbody>{records.data!.map(record => <tr key={record._id}><td>{typeof record.stationId === 'object' ? `${record.stationId.code} · ${record.stationId.name}` : record.stationId}</td><td>{formatDate(record.measuredAt)}</td>{parameterKeys.map(key => <td key={key}>{record.parameters[key]}</td>)}<td><QualityBadge value={record.wqi} label={record.qualityClass}/></td><td><StatusBadge status={record.validationStatus}/></td><td>{record.source?.kind === 'excel' ? 'Excel' : 'Admin nhập'}{record.source?.rowId && <small> · {record.source.rowId}</small>}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
