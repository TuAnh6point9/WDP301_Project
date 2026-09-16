import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, PencilSimple } from '@phosphor-icons/react';
import type { Station } from '@wqi/contracts';
import { api, errorMessage } from '../../lib/axios';
import { useApi } from '../../lib/hooks';
import { ActionForm, Alert, Empty, Loading, Modal, PageHeader, Pager } from '../../components/ui';
import { formNumber } from './admin-helpers';

export function StationsAdminPage() {
  const [page, setPage] = useState(1);
  const list = useApi<Station[]>(`/stations?page=${page}`);
  const [editing, setEditing] = useState<Station | 'new' | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  async function toggle(station: Station) {
    setBusyId(station._id); setError('');
    try {
      if (station.isActive) await api.delete(`/stations/${station._id}`);
      else await api.patch(`/stations/${station._id}`, { isActive: true });
      list.reload();
    } catch (error) { setError(errorMessage(error)); } finally { setBusyId(''); }
  }
  return <>
    <PageHeader title="Quản lý trạm quan trắc" description="Nhập thông tin và tọa độ từ nguồn đã xác nhận. Ngừng hoạt động trạm vẫn giữ dữ liệu lịch sử." actions={<button className="button" onClick={() => setEditing('new')}><Plus size={18}/>Thêm trạm</button>}/>
    {error && <Alert>{error}</Alert>}
    <section className="panel">
      {list.loading ? <Loading/> : list.error ? <Alert>{list.error}</Alert> : !list.data?.length ? <Empty>Chưa có trạm. Admin có thể bổ sung trạm khi có thông tin và tọa độ thực.</Empty> : <div className="table-scroll"><table><thead><tr><th>Mã trạm</th><th>Tên trạm</th><th>Khu vực</th><th>Kinh độ / Vĩ độ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{list.data.map(station => <tr key={station._id}>
        <td><Link className="text-link" to={`/stations/${station._id}`}>{station.code}</Link></td><td>{station.name}</td><td>{station.administrativeArea}</td><td>{station.location.coordinates.join(' / ')}</td><td><span className={`badge ${station.isActive ? 'status-verified' : 'status-rejected'}`}>{station.isActive ? 'Hoạt động' : 'Ngừng hoạt động'}</span></td>
        <td><div className="actions"><button className="button secondary compact" onClick={() => setEditing(station)}><PencilSimple size={16}/>Sửa</button><button className="button secondary compact" disabled={Boolean(busyId)} onClick={() => void toggle(station)}>{busyId === station._id ? 'Đang lưu…' : station.isActive ? 'Ngừng hoạt động' : 'Kích hoạt'}</button></div></td>
      </tr>)}</tbody></table></div>}
      <Pager meta={list.meta} onPage={setPage}/>
    </section>
    {editing && <StationEditor station={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }}/>} 
  </>;
}

function StationEditor({ station, onClose, onSaved }: { station?: Station; onClose: () => void; onSaved: () => void }) {
  return <Modal title={station ? `Chỉnh sửa ${station.code}` : 'Thêm trạm quan trắc'} onClose={onClose}><ActionForm submitLabel={station ? 'Lưu thay đổi' : 'Tạo trạm'} onSuccess={onSaved} onSubmit={async form => {
    const fields = {
      name: String(form.get('name')).trim(),
      administrativeArea: String(form.get('administrativeArea')),
      location: { type: 'Point', coordinates: [formNumber(form, 'longitude'), formNumber(form, 'latitude')] },
    };
    if (station) await api.patch(`/stations/${station._id}`, fields);
    else await api.post('/stations', { ...fields, code: String(form.get('code')).trim().toUpperCase() });
  }}>
    <div className="form-grid"><label>Mã trạm<input name="code" required minLength={2} maxLength={40} pattern="[A-Za-z0-9_\-]+" defaultValue={station?.code} disabled={Boolean(station)}/></label><label>Tên trạm<input name="name" required minLength={2} maxLength={160} defaultValue={station?.name}/></label>
      <label>Khu vực hành chính<select name="administrativeArea" required defaultValue={station?.administrativeArea || ''}><option value="" disabled>Chọn khu vực</option><option>Hải Dương</option><option>Hải Phòng</option></select></label>
      <label>Kinh độ<input name="longitude" type="number" required step="any" min={-180} max={180} defaultValue={station?.location.coordinates[0]}/></label>
      <label>Vĩ độ<input name="latitude" type="number" required step="any" min={-90} max={90} defaultValue={station?.location.coordinates[1]}/></label>
    </div>
  </ActionForm></Modal>;
}
