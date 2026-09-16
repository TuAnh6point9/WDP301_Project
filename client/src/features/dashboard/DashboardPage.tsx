import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, ChartLine, ShieldCheck } from '@phosphor-icons/react';
import type { Station, WaterRecord } from '@wqi/contracts';
import { useApi, useStations } from '../../lib/hooks';
import { StationMap } from '../../components/StationMap';
import { Alert, Empty, Loading, QualityBadge, formatDate, PageHeader } from '../../components/ui';
export function DashboardPage({ mapOnly = false }: { mapOnly?: boolean }) {
  const stations = useStations();
  const records = useApi<WaterRecord[]>('/water-records?limit=5&status=verified');
  const stationData: Station[] = stations.data.filter(station => station.isActive);
  return <><PageHeader title={mapOnly ? 'Bản đồ trạm quan trắc' : 'Chất lượng nước An Kim Hải'} description="Theo dõi dữ liệu quan trắc đã được kiểm định trong khu vực nghiên cứu." actions={<Link className="button secondary" to="/records">Tra cứu dữ liệu <ArrowRight size={17}/></Link>}/>
    {!mapOnly && <div className="metrics"><div><MapPin size={22}/><span>Trạm đang hoạt động</span><strong>{stations.loading || stations.error ? '—' : stationData.length}</strong></div><div><ChartLine size={22}/><span>Bản ghi đã kiểm định</span><strong>{records.meta ? records.meta.total : '—'}</strong></div><div><ShieldCheck size={22}/><span>Nguồn dữ liệu</span><strong className="metric-text">Quan trắc lịch sử</strong></div></div>}
    {stations.error && <Alert>{stations.error}</Alert>}{stations.loading && <Loading/>}
    <section className="panel map-panel"><div className="section-heading"><div><h2>Không gian quan trắc</h2><p>Các trạm có vị trí địa lý được cung cấp</p></div><Link className="text-link" to="/stations">Danh sách trạm <ArrowRight size={16}/></Link></div><StationMap stations={stationData}/><div className="map-caption">Chọn một trạm để xem thông tin và dữ liệu liên quan.</div></section>
    {!mapOnly && <section className="panel"><div className="section-heading"><div><h2>Quan trắc gần nhất</h2><p>Các bản ghi đã hoàn tất kiểm định</p></div><Link className="text-link" to="/records">Xem tất cả <ArrowRight size={17}/></Link></div>{records.loading ? <Loading/> : records.error ? <Alert>{records.error}</Alert> : !records.data?.length ? <Empty>Chưa có bản ghi đã kiểm định để hiển thị.</Empty> : <div className="table-scroll"><table><thead><tr><th>Trạm</th><th>Thời gian đo</th><th>pH</th><th>DO (mg/L)</th><th>Chỉ số WQI</th></tr></thead><tbody>{records.data.map(record => <tr key={record._id}><td>{typeof record.stationId === 'object' ? record.stationId.name : record.stationId}</td><td>{formatDate(record.measuredAt)}</td><td>{record.parameters.ph}</td><td>{record.parameters.do}</td><td><QualityBadge value={record.wqi} label={record.qualityClass}/></td></tr>)}</tbody></table></div>}</section>}
  </>;
}
export function AboutPage() { return <><PageHeader title="Về hệ thống" description="Đồ án WDP301 · Hệ thống giám sát và tính toán WQI khu vực An Kim Hải"/><article className="panel prose"><h2>Dữ liệu chất lượng nước, có nguồn gốc rõ ràng</h2><p>Hệ thống hỗ trợ quản lý trạm, lưu trữ dữ liệu quan trắc lịch sử và tra cứu chất lượng nước theo vị trí, thời gian. Dữ liệu chỉ được công khai sau khi quản trị viên kiểm định.</p><h2>Sáu thông số quan trắc</h2><p>pH, DO, BOD5, COD, TSS và NH4+. Các trường thiếu được giữ nguyên trạng thái chưa có dữ liệu. Kết quả WQI chỉ xuất hiện khi có kết quả từ dịch vụ AI được tích hợp.</p><h2>Phạm vi phiên bản web</h2><p>Dữ liệu lịch sử được quản trị viên nhập từ Excel. Phiên bản này không thu nhận dữ liệu thời gian thực từ cảm biến.</p></article></>; }
