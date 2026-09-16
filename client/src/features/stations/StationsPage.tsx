import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Station } from '@wqi/contracts';
import { useApi } from '../../lib/hooks';
import { Alert, Empty, Loading, PageHeader, Pager } from '../../components/ui';

export function StationsPage() {
  const [page, setPage] = useState(1);
  const stations = useApi<Station[]>(`/stations?page=${page}&limit=20`);
  return <><PageHeader title="Danh sách trạm quan trắc" description="Vị trí và thông tin trạm được quản trị viên xác nhận từ nguồn thực tế." actions={<Link className="button secondary" to="/map">Xem bản đồ</Link>}/><section className="panel">
    {stations.loading ? <Loading/> : stations.error ? <Alert>{stations.error}</Alert> : !stations.data?.length ? <Empty>Chưa có thông tin trạm được cung cấp.</Empty> : <><div className="table-scroll"><table><thead><tr><th>Mã trạm</th><th>Tên trạm</th><th>Khu vực</th><th>Kinh độ</th><th>Vĩ độ</th><th>Trạng thái</th><th>Dữ liệu</th></tr></thead><tbody>{stations.data.map(station => <tr key={station._id}><td>{station.code}</td><td>{station.name}</td><td>{station.administrativeArea}</td><td>{station.location.coordinates[0]}</td><td>{station.location.coordinates[1]}</td><td>{station.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}</td><td><Link className="text-link" to={`/stations/${station._id}`}>Xem bản ghi →</Link></td></tr>)}</tbody></table></div><Pager meta={stations.meta} onPage={setPage}/></>}
  </section></>;
}
