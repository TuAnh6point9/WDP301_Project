import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { parameterKeys, parameterLabels, type Parameters, type Station, type WaterRecord } from '@wqi/contracts';
import { api } from '../../lib/axios';
import { useApi, useStations } from '../../lib/hooks';
import { StationMap } from '../../components/StationMap';
import { TrendChart } from '../../components/TrendChart';
import { ActionForm, Alert, Empty, Loading, Modal, PageHeader, Pager, ParameterFields, QualityBadge, StatusBadge, UnitConfirmation, formatDate, readParameters } from '../../components/ui';

type RecordAction = { kind: 'create' } | { kind: 'edit' | 'review'; record: WaterRecord };
type Filters = { stationId: string; from: string; to: string; status: string };
const emptyFilters: Filters = { stationId: '', from: '', to: '', status: '' };
const unitBasis = 'mg/L; NH4+ as ion';

function vietnamTimestamp(value: string) {
  return new Date(`${value.length === 16 ? `${value}:00` : value}+07:00`).toISOString();
}
function vietnamInput(value: string) {
  return new Date(Date.parse(value) + 7 * 60 * 60 * 1000).toISOString().slice(0, 23);
}

function RecordForm({ action, stations, selectedStation, onSaved }: { action: RecordAction; stations: Station[]; selectedStation?: string; onSaved: () => void }) {
  const record = action.kind === 'create' ? null : action.record;
  if (action.kind === 'review') return <ActionForm submitLabel="Lưu kiểm định" onSuccess={onSaved} onSubmit={async form => {
    await api.patch(`/water-records/${action.record._id}/validation`, {
      status: form.get('status'), note: form.get('note'), version: action.record.version,
    });
  }}><p className="muted">Thời điểm đo: {formatDate(action.record.measuredAt)}. Quyết định kiểm định áp dụng cho phiên bản đang mở.</p>
    <label>Kết quả kiểm định<select name="status" defaultValue="verified" required><option value="verified">Duyệt và công khai</option><option value="rejected">Từ chối</option></select></label>
    <label>Ghi chú kiểm định<textarea name="note" minLength={3} maxLength={1000} required rows={3}/></label>
  </ActionForm>;
  return <ActionForm submitLabel={record ? 'Lưu thay đổi' : 'Ghi nhận dữ liệu'} onSuccess={onSaved} onSubmit={async form => {
    const body = { measuredAt: vietnamTimestamp(String(form.get('measuredAt'))), parameters: readParameters(form), unitBasis };
    if (record) await api.patch(`/water-records/${record._id}`, { ...body, version: record.version });
    else await api.post(`/stations/${String(form.get('stationId'))}/water-records`, body);
  }}>
    {record ? <p className="muted">Thay đổi thông số hoặc thời gian sẽ đưa bản ghi về chờ kiểm định và xóa WQI của đầu vào cũ.</p> : <label>Trạm quan trắc<select name="stationId" required defaultValue={selectedStation || ''}><option value="" disabled>Chọn trạm</option>{stations.filter(station => station.isActive).map(station => <option key={station._id} value={station._id}>{station.code} · {station.name}</option>)}</select></label>}
    <label>Thời gian đo (giờ Việt Nam, UTC+7)<input name="measuredAt" type="datetime-local" step="0.001" required defaultValue={record ? vietnamInput(record.measuredAt) : undefined}/></label>
    <ParameterFields initial={record?.parameters}/>
    <UnitConfirmation/>
  </ActionForm>;
}

export function RecordsPage({ admin = false }: { admin?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState('');
  const [field, setField] = useState<keyof Parameters | 'wqi'>('ph');
  const [action, setAction] = useState<RecordAction | null>(null);
  const stations = useStations();
  const station = useApi<Station>(id ? `/stations/${id}` : null);
  const query = new URLSearchParams({ page: String(page), limit: '20' });
  if (filters.stationId && !id) query.set('stationId', filters.stationId);
  if (filters.from) query.set('from', vietnamTimestamp(filters.from));
  if (filters.to) query.set('to', vietnamTimestamp(filters.to));
  if (!admin) query.set('status', 'verified');
  else if (filters.status) query.set('status', filters.status);
  const records = useApi<WaterRecord[]>(`${id ? `/stations/${id}` : ''}/water-records?${query}`);
  const stationList = stations.data || [];
  const activeStations = stationList.filter(item => item.isActive);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { stationId: String(form.get('stationId') || ''), from: String(form.get('from') || ''), to: String(form.get('to') || ''), status: String(form.get('status') || '') };
    if (next.from && next.to && next.from >= next.to) {
      setFilterError('Thời gian bắt đầu phải trước thời gian kết thúc.');
      return;
    }
    setFilterError(''); setFilters(next); setPage(1);
  }

  if (id && station.loading) return <Loading/>;
  if (id && station.error) return <Alert>{station.error}</Alert>;
  return <>
    <PageHeader title={id ? station.data?.name || 'Dữ liệu trạm' : admin ? 'Kiểm định dữ liệu quan trắc' : 'Dữ liệu quan trắc'} description={admin ? 'Ghi nhận thông tin thực, đối chiếu nguồn và kiểm định trước khi công khai.' : 'Tra cứu bản ghi đã kiểm định theo trạm và thời gian đo.'} actions={admin ? <button className="button" onClick={() => setAction({ kind: 'create' })} disabled={!activeStations.length}><Plus size={18}/>Ghi nhận dữ liệu</button> : <Link className="button secondary" to="/stations">Danh sách trạm</Link>}/>
    {id && station.data && <section className="panel"><div className="section-heading"><div><h2>{station.data.code} · {station.data.administrativeArea}</h2><p>Kinh độ {station.data.location.coordinates[0]} · Vĩ độ {station.data.location.coordinates[1]}</p></div><span className="badge">{station.data.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</span></div><StationMap stations={[station.data]}/></section>}
    <section className="panel">
      <div className="section-heading"><div><h2>Bộ lọc dữ liệu</h2><p>Giờ Việt Nam (UTC+7). Thời điểm kết thúc không nằm trong khoảng tra cứu.</p></div></div>
      <form className="filter-form" onSubmit={filter}>
        {!id && <label>Trạm quan trắc<select name="stationId" defaultValue=""><option value="">Tất cả trạm</option>{stationList.filter(item => admin || item.isActive).map(item => <option key={item._id} value={item._id}>{item.code} · {item.name}</option>)}</select></label>}
        <label>Từ thời điểm<input type="datetime-local" name="from" step="1"/></label>
        <label>Đến trước thời điểm<input type="datetime-local" name="to" step="1"/></label>
        {admin && <label>Kiểm định<select name="status" defaultValue=""><option value="">Tất cả trạng thái</option><option value="pending">Chờ kiểm định</option><option value="verified">Đã kiểm định</option><option value="rejected">Từ chối</option></select></label>}
        <button className="button" type="submit">Áp dụng</button>
        <button className="button secondary" type="reset" onClick={() => { setFilters(emptyFilters); setFilterError(''); setPage(1); }}>Đặt lại</button>
      </form>
      {stations.loading && <Loading/>}{stations.error && <Alert>{stations.error}</Alert>}
      {filterError && <Alert>{filterError}</Alert>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>{admin ? 'Danh sách kiểm định' : 'Kết quả tra cứu'}</h2><p>pH không có đơn vị. Nồng độ dùng mg/L; NH4+ tính theo ion.</p></div><button className="button secondary" onClick={records.reload} disabled={records.loading}>Tải lại</button></div>
      {records.loading ? <Loading/> : records.error ? <Alert>{records.error}</Alert> : !records.data?.length ? <Empty>Chưa có bản ghi phù hợp bộ lọc. {admin ? 'Bổ sung dữ liệu thực hoặc xử lý dữ liệu Excel trong khu vực quản trị.' : 'Dữ liệu xuất hiện sau khi quản trị viên bổ sung và kiểm định.'}</Empty> : <>
        <div className="table-scroll"><table><thead><tr><th>Trạm</th><th>Thời gian đo</th>{parameterKeys.map(key => <th key={key}>{parameterLabels[key]}</th>)}<th>WQI</th><th>Kiểm định</th>{admin && <th>Thao tác</th>}</tr></thead><tbody>{records.data.map(record => <tr key={record._id}>
          <td>{typeof record.stationId === 'object' && record.stationId ? <Link className="text-link" to={`/stations/${record.stationId._id}`}>{record.stationId.code}<br/>{record.stationId.name}</Link> : 'Trạm không khả dụng'}</td>
          <td>{formatDate(record.measuredAt)}</td>{parameterKeys.map(key => <td key={key}>{record.parameters[key]}</td>)}<td><QualityBadge value={record.wqi} label={record.qualityClass}/></td><td><StatusBadge status={record.validationStatus}/></td>
          {admin && <td><div className="record-actions"><button className="button secondary compact" onClick={() => setAction({ kind: 'edit', record })}>Sửa</button><button className="button secondary compact" onClick={() => setAction({ kind: 'review', record })}>Kiểm định</button></div></td>}
        </tr>)}</tbody></table></div><Pager meta={records.meta} onPage={setPage}/>
      </>}
    </section>
    {!records.loading && !records.error && <section className="panel"><div className="section-heading"><div><h2>Diễn biến theo thời gian</h2><p>Cùng bộ lọc và các bản ghi trên trang hiện tại; mỗi trạm được thể hiện riêng.</p></div><label>Thông số<select value={field} onChange={event => setField(event.target.value as keyof Parameters | 'wqi')}>{parameterKeys.map(key => <option key={key} value={key}>{parameterLabels[key]}{key === 'ph' ? '' : ' (mg/L)'}</option>)}<option value="wqi">WQI</option></select></label></div><TrendChart records={records.data || []} field={field}/></section>}
    {action && <Modal title={action.kind === 'create' ? 'Ghi nhận số liệu quan trắc' : action.kind === 'edit' ? 'Chỉnh sửa bản ghi' : 'Kiểm định bản ghi'} onClose={() => setAction(null)}><RecordForm action={action} stations={stationList} selectedStation={id || filters.stationId} onSaved={() => { setAction(null); records.reload(); }}/></Modal>}
  </>;
}

export function StationDetailPage() { return <RecordsPage/>; }
