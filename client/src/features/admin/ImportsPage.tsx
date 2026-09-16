import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DownloadSimple, UploadSimple, ArrowRight } from '@phosphor-icons/react';
import { normalizeSchema, parameterKeys, parameterLabels, rawColumns, type ApiResponse, type ImportBatch, type ImportedRow, type Parameters, type RawColumn } from '@wqi/contracts';
import { api, download, errorMessage } from '../../lib/axios';
import { useApi } from '../../lib/hooks';
import { Alert, Empty, Loading, Modal, PageHeader, Pager, StatusBadge, UnitConfirmation, formatDate } from '../../components/ui';
import { formNumber, useStationOptions, vietnamTimestamp } from './admin-helpers';

type SourceRow = Pick<ImportedRow, 'rowNumber' | 'values' | 'issues'>;
type Preview = { rows: SourceRow[]; rowCount: number; issueCount: number; missingMetadata: string[]; duplicate: boolean };

function RawTable({ rows, before, after }: { rows: SourceRow[]; before?: (row: SourceRow) => ReactNode; after?: (row: SourceRow) => ReactNode }) {
  return <div className="table-scroll"><table><thead><tr>{before && <th>Chọn</th>}<th>Dòng Excel</th>{rawColumns.map(column => <th key={column}>{column}</th>)}<th>Kiểm tra dữ liệu gốc</th>{after && <th>Thao tác</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber}>
    {before && <td>{before(row)}</td>}<td>{row.rowNumber}</td>{rawColumns.map(column => <td key={column}>{row.values[column] === null ? <span className="muted">Trống</span> : String(row.values[column])}</td>)}
    <td>{row.issues.length ? <details><summary>{row.issues.length} vấn đề</summary><ul>{row.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details> : <span className="badge">Đủ 8 giá trị số</span>}</td>{after && <td>{after(row)}</td>}
  </tr>)}</tbody></table></div>;
}

export function ImportsPage() {
  const [page, setPage] = useState(1);
  const batches = useApi<ImportBatch[]>(`/imports?page=${page}`);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function upload(action: 'preview' | 'commit') {
    if (!file) { setError('Vui lòng chọn file Excel.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File Excel tối đa 5 MB.'); return; }
    setBusy(action); setError('');
    const data = new FormData(); data.append('file', file);
    try {
      if (action === 'preview') {
        setPreview(null);
        const response = await api.post<ApiResponse<Preview>>('/imports/preview', data, { timeout: 60000 });
        setPreview(response.data.data);
      } else {
        const response = await api.post<ApiResponse<{ batch: ImportBatch; duplicate: boolean }>>('/imports/commit', data, { timeout: 60000 });
        navigate(`/admin/imports/${response.data.data.batch._id}`);
      }
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(null); }
  }
  return <>
    <PageHeader title="Dữ liệu Excel gốc" description="Admin quản lý nhập dữ liệu, kiểm tra và bổ sung thông tin quan trắc trước khi công khai."/>
    <section className="panel"><div className="section-heading"><div><h2>Nhập file Excel</h2><p>Giữ nguyên 8 cột: {rawColumns.join(', ')}. Tối đa 5 MB, 10.000 dòng, một sheet.</p></div></div>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); void upload('preview'); }}><label>Chọn file .xlsx<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={Boolean(busy)} onChange={event => { setFile(event.target.files?.[0] || null); setPreview(null); setError(''); }}/></label><div><button className="button secondary" disabled={!file || Boolean(busy)}><UploadSimple size={18}/>{busy === 'preview' ? 'Đang kiểm tra…' : 'Kiểm tra và xem trước'}</button></div></form>
      {error && <Alert>{error}</Alert>}
      {preview && <div className="import-preview"><div className="section-heading"><div><h3>Kết quả kiểm tra: {file?.name}</h3><p>{preview.rowCount} dòng · {preview.issueCount} dòng cần kiểm tra giá trị · Hiển thị tối đa 20 dòng đầu</p></div><span className="badge">{preview.duplicate ? 'File đã được nhập' : 'Chưa lưu vào hệ thống'}</span></div>
        <p className="notice">Dữ liệu gốc chưa có trạm, thời gian đo, TSS và thông tin đơn vị xác nhận. Nhập file sẽ lưu vào khu vực Admin; dữ liệu chỉ được công khai sau khi bổ sung thông tin thực và kiểm định.</p>
        <RawTable rows={preview.rows}/><div className="actions"><button className="button" disabled={Boolean(busy)} onClick={() => void upload('commit')}>{busy === 'commit' ? 'Đang nhập dữ liệu…' : preview.duplicate ? 'Mở đợt nhập đã có' : 'Xác nhận nhập dữ liệu gốc'}<ArrowRight size={18}/></button></div>
      </div>}
    </section>
    <section className="panel"><div className="section-heading"><div><h2>Lịch sử nhập dữ liệu</h2><p>Các đợt nhập và dữ liệu gốc được lưu riêng để đối chiếu.</p></div><button className="button secondary compact" onClick={batches.reload}>Tải lại</button></div>
      {batches.loading ? <Loading/> : batches.error ? <Alert>{batches.error}</Alert> : !batches.data?.length ? <Empty>Chưa có file được nhập. Chọn file Excel thực để bắt đầu quản lý dữ liệu.</Empty> : <div className="table-scroll"><table><thead><tr><th>File nguồn</th><th>Thời điểm nhập</th><th>Số dòng</th><th>Dòng cần kiểm tra</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{batches.data.map(batch => <tr key={batch._id}><td>{batch.fileName}</td><td>{formatDate(batch.createdAt)}</td><td>{batch.rowCount}</td><td>{batch.issueCount}</td><td><StatusBadge status={batch.status}/></td><td><Link className="text-link" to={`/admin/imports/${batch._id}`}>Xem dữ liệu <ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>}
      <Pager meta={batches.meta} onPage={setPage}/>
    </section>
  </>;
}

export function ImportDetailPage() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const detail = useApi<{ batch: ImportBatch; rows: ImportedRow[] }>(id ? `/imports/${id}/rows?page=${page}` : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [normalizing, setNormalizing] = useState<ImportedRow[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const rows = detail.data?.rows || [];
  const available = rows.filter(row => !row.waterRecordId);
  const ready = detail.data?.batch.status === 'ready';
  const allSelected = available.length > 0 && available.every(row => selected.includes(row._id));
  async function exportOriginal() {
    setExporting(true); setError('');
    try { await download(`/reports/imports/${id}.xlsx`, 'original-values.xlsx'); }
    catch (error) { setError(errorMessage(error)); } finally { setExporting(false); }
  }
  const fullRow = (source: SourceRow) => rows.find(row => row.rowNumber === source.rowNumber)!;
  return <>
    <PageHeader title={detail.data?.batch.fileName || 'Chi tiết dữ liệu Excel'} description="Dữ liệu gốc được giữ nguyên. Chỉ tạo bản ghi quan trắc khi có đầy đủ thông tin thực." actions={<Link className="button secondary" to="/admin/imports">Danh sách đợt nhập</Link>}/>
    {error && <Alert>{error}</Alert>}
    {detail.loading ? <Loading/> : detail.error ? <Alert>{detail.error}</Alert> : !detail.data ? <Empty title="Không có đợt nhập"/> : <>
      <section className="panel"><div className="section-heading"><div><h2>Thông tin nguồn</h2><p>Nhập lúc {formatDate(detail.data.batch.createdAt)} · {detail.data.batch.rowCount} dòng · {detail.data.batch.issueCount} dòng cần kiểm tra</p></div><StatusBadge status={detail.data.batch.status}/></div><p className="notice">TSS, trạm và thời gian đo cần được Admin bổ sung từ nguồn thực. Amoni được giữ nguyên ở cột nguồn; chỉ nhập NH4+ sau khi xác nhận cách biểu diễn và đơn vị.</p>
        <div className="actions"><button className="button secondary" disabled={!ready || exporting} onClick={() => void exportOriginal()}><DownloadSimple size={18}/>{exporting ? 'Đang xuất…' : 'Xuất 8 cột dữ liệu gốc'}</button><button className="button secondary" onClick={detail.reload}>Tải lại dữ liệu</button></div>
      </section>
      <section className="panel"><div className="section-heading"><div><h2>Các dòng dữ liệu</h2><p>Lựa chọn áp dụng trong trang hiện tại. Dòng đã chuyển được quản lý tiếp ở mục Kiểm định dữ liệu.</p></div><button className="button" disabled={!ready || !selected.length} onClick={() => setNormalizing(rows.filter(row => selected.includes(row._id) && !row.waterRecordId))}>Bổ sung {selected.length ? `(${selected.length} dòng)` : 'thông tin'}</button></div>
        {!!available.length && <label className="check"><input type="checkbox" checked={allSelected} disabled={!ready} onChange={event => setSelected(event.target.checked ? available.map(row => row._id) : [])}/>Chọn tất cả dòng chưa chuyển trong trang</label>}
        {!rows.length ? <Empty/> : <RawTable rows={rows} before={source => { const row = fullRow(source); return <input type="checkbox" aria-label={`Chọn dòng ${row.rowNumber}`} disabled={!ready || Boolean(row.waterRecordId)} checked={selected.includes(row._id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row._id] : previous.filter(value => value !== row._id))}/>; }} after={source => { const row = fullRow(source); return row.waterRecordId ? <Link className="text-link" to="/admin/records">Đã chuyển → Kiểm định</Link> : <button className="button secondary compact" disabled={!ready} onClick={() => setNormalizing([row])}>Bổ sung thông tin</button>; }}/>} 
        <Pager meta={detail.meta} onPage={value => { setSelected([]); setPage(value); }}/>
      </section>
    </>}
    {normalizing && id && <NormalizeRows batchId={id} rows={normalizing} onClose={() => setNormalizing(null)} onApplied={() => { setSelected([]); detail.reload(); }}/>} 
  </>;
}

const sourceParameters: Partial<Record<keyof Parameters, RawColumn>> = { ph: 'PH', do: 'DO', bod5: 'BOD5', cod: 'COD' };
type Outcome = { ok: boolean; message: string };
function NormalizeRows({ batchId, rows, onClose, onApplied }: { batchId: string; rows: ImportedRow[]; onClose: () => void; onApplied: () => void }) {
  const stations = useStationOptions();
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const activeStations = stations.stations.filter(station => station.isActive);
  const remaining = rows.filter(row => !outcomes[row._id]?.ok);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    let applied = false;
    try {
      for (const row of remaining) {
        const parameters = Object.fromEntries(parameterKeys.map(key => [key, formNumber(form, `${row._id}:${key}`)]));
        const parsed = normalizeSchema.safeParse({ stationId: form.get('stationId'), measuredAt: vietnamTimestamp(String(form.get(`${row._id}:measuredAt`) || '')), parameters, sourceNote: form.get('sourceNote'), unitBasis: 'mg/L; NH4+ as ion' });
        let outcome: Outcome;
        if (!parsed.success) outcome = { ok: false, message: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
        else {
          try {
            await api.post(`/imports/${batchId}/rows/${row._id}/normalize`, parsed.data);
            outcome = { ok: true, message: 'Đã tạo bản ghi chờ kiểm định.' }; applied = true;
          } catch (error) { outcome = { ok: false, message: errorMessage(error) }; }
        }
        setOutcomes(previous => ({ ...previous, [row._id]: outcome }));
      }
    } finally { setBusy(false); if (applied) onApplied(); }
  }
  return <Modal title={`Bổ sung thông tin · ${rows.length} dòng`} onClose={() => { if (!busy) onClose(); }}>
    <p className="notice">Nhập thời điểm và thông số cho từng dòng. PH, DO, BOD5, COD được sao từ giá trị gốc để đối chiếu; TSS và NH4+ cần được cung cấp. Bản ghi tạo thành công sẽ chờ kiểm định.</p>
    {stations.loading && <Loading/>}{stations.error && <Alert>{stations.error}</Alert>}
    {!stations.loading && !activeStations.length && <Alert>Cần tạo ít nhất một trạm có thông tin thực và đang hoạt động trước khi chuyển dữ liệu.</Alert>}
    <form className="form-stack" onSubmit={event => void submit(event)}><fieldset disabled={busy || !activeStations.length || !remaining.length}>
      <label>Trạm áp dụng cho các dòng đã chọn<select name="stationId" required defaultValue=""><option value="" disabled>Chọn trạm thực tế</option>{activeStations.map(station => <option key={station._id} value={station._id}>{station.code} · {station.name}</option>)}</select></label>
      <label>Nguồn xác nhận thông tin bổ sung<textarea name="sourceNote" required minLength={10} maxLength={2000} rows={3} placeholder="Ghi tài liệu hoặc hồ sơ xác nhận trạm, thời gian, TSS, NH4+ và đơn vị."/></label>
      <UnitConfirmation/>
      {rows.map(row => <fieldset key={row._id} className="panel" disabled={Boolean(outcomes[row._id]?.ok)}><legend>Dòng Excel {row.rowNumber}</legend>
        <p className="muted">Amoni gốc: {row.values.Amoni ?? 'trống'} · Temp: {row.values.Temp ?? 'trống'} · Phosphat: {row.values.Phosphat ?? 'trống'} · Coliforms: {row.values.Coliforms ?? 'trống'}</p>
        <label>Thời điểm đo (giờ Việt Nam)<input name={`${row._id}:measuredAt`} type="datetime-local" required step="1"/></label>
        <div className="form-grid">{parameterKeys.map(key => {
          const sourceKey = sourceParameters[key];
          const value = sourceKey ? row.values[sourceKey] : null;
          return <label key={key}>{parameterLabels[key]} <small>{key === 'ph' ? 'không đơn vị' : 'mg/L'}{key === 'nh4' ? ', theo ion NH4+' : ''}</small><input name={`${row._id}:${key}`} type="number" step="any" min={0} max={key === 'ph' ? 14 : undefined} required defaultValue={typeof value === 'number' ? value : undefined}/></label>;
        })}</div>
      </fieldset>)}
    </fieldset>
      {!!Object.keys(outcomes).length && <div role="status" className="normalization-results"><h3>Kết quả theo dòng</h3>{rows.filter(row => outcomes[row._id]).map(row => <p key={row._id} className={outcomes[row._id].ok ? 'success' : 'field-error'}><strong>Dòng {row.rowNumber}:</strong> {outcomes[row._id].message}</p>)}</div>}
      <button className="button" disabled={busy || stations.loading || !activeStations.length || !remaining.length}>{busy ? 'Đang chuyển từng dòng…' : !remaining.length ? 'Đã chuyển các dòng' : 'Tạo bản ghi chờ kiểm định'}</button>
    </form>
  </Modal>;
}
