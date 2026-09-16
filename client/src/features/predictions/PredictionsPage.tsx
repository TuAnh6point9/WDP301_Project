import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { parameterKeys, parameterLabels, type ApiResponse, type Prediction } from '@wqi/contracts';
import { api } from '../../lib/axios';
import { useApi } from '../../lib/hooks';
import { ActionForm, Alert, Empty, Loading, PageHeader, Pager, ParameterFields, QualityBadge, UnitConfirmation, formatDate, readParameters } from '../../components/ui';

function PredictionDetails({ prediction }: { prediction: Prediction }) {
  return <section className="panel"><div className="section-heading"><div><h2>Kết quả dự đoán</h2><p>{formatDate(prediction.createdAt)}</p></div><QualityBadge value={prediction.wqi} label={prediction.qualityClass}/></div>
    <dl className="result-grid">{parameterKeys.map(key => <div key={key}><dt>{parameterLabels[key]}{key === 'ph' ? '' : ' (mg/L)'}</dt><dd>{prediction.parameters[key]}</dd></div>)}</dl>
    <dl className="detail-list"><div><dt>Phiên bản mô hình</dt><dd>{prediction.modelVersion}</dd></div><div><dt>Phiên bản phân hạng</dt><dd>{prediction.classificationVersion}</dd></div><div><dt>Cơ sở đơn vị</dt><dd>mg/L; NH4+ tính theo ion. pH không có đơn vị.</dd></div></dl>
    <p className="muted">Kết quả gắn với bộ thông số trên và được lưu trong lịch sử cá nhân.</p>
  </section>;
}

export function PredictionsPage() {
  const status = useApi<{ available: boolean }>('/predictions/status');
  const [result, setResult] = useState<Prediction | null>(null);
  const available = status.data?.available === true;
  return <><PageHeader title="Dự đoán chỉ số WQI" description="Gửi sáu thông số đã đối chiếu đơn vị đến dịch vụ AI và lưu kết quả vào lịch sử cá nhân." actions={<Link className="button secondary" to="/history">Lịch sử tính</Link>}/>
    <section className="panel"><div className="section-heading"><div><h2>Thông số đầu vào</h2><p>Cung cấp đầy đủ các thông số từ dữ liệu thực tế.</p></div><span className="badge">{status.loading ? 'Đang kiểm tra dịch vụ' : available ? 'Đã cấu hình AI' : 'AI chưa khả dụng'}</span></div>
      {status.loading ? <Loading/> : status.error ? <><Alert>{status.error}</Alert><button className="button secondary" onClick={status.reload}>Kiểm tra lại</button></> : !available ? <><Empty title="Chức năng dự đoán chưa khả dụng">Dịch vụ AI chưa được cấu hình. Hệ thống sẽ tiếp nhận đầu vào khi dịch vụ được kết nối.</Empty><button className="button secondary" onClick={status.reload}>Kiểm tra lại dịch vụ</button></> : <ActionForm submitLabel="Tính WQI" onSubmit={async form => {
        setResult(null);
        const response = await api.post<ApiResponse<Prediction>>('/predictions', { parameters: readParameters(form), unitBasis: 'mg/L; NH4+ as ion' });
        setResult(response.data.data);
      }}><ParameterFields/><UnitConfirmation/></ActionForm>}
    </section>
    {result && <PredictionDetails prediction={result}/>}
  </>;
}

export function HistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const history = useApi<Prediction[]>(id ? null : `/predictions?page=${page}&limit=20`);
  const detail = useApi<Prediction>(id ? `/predictions/${id}` : null);
  return <><PageHeader title={id ? 'Chi tiết lần dự đoán' : 'Lịch sử tính WQI'} description="Các lần dự đoán thành công thuộc tài khoản đang đăng nhập." actions={<Link className="button secondary" to={id ? '/history' : '/predict'}>{id ? 'Trở về lịch sử' : 'Tính WQI'}</Link>}/>
    {id ? detail.loading ? <Loading/> : detail.error ? <Alert>{detail.error}</Alert> : detail.data ? <PredictionDetails prediction={detail.data}/> : <Empty/> : <section className="panel">
      {history.loading ? <Loading/> : history.error ? <Alert>{history.error}</Alert> : !history.data?.length ? <Empty title="Chưa có lịch sử tính">Lần dự đoán thành công đầu tiên sẽ xuất hiện tại đây.</Empty> : <><div className="table-scroll"><table><thead><tr><th>Thời điểm tính</th><th>WQI / Phân hạng</th><th>Mô hình</th><th>Chi tiết</th></tr></thead><tbody>{history.data.map(prediction => <tr key={prediction._id}><td>{formatDate(prediction.createdAt)}</td><td><QualityBadge value={prediction.wqi} label={prediction.qualityClass}/></td><td>{prediction.modelVersion}</td><td><Link className="text-link" to={`/history/${prediction._id}`}>Xem đầu vào và kết quả →</Link></td></tr>)}</tbody></table></div><Pager meta={history.meta} onPage={setPage}/></>}
    </section>}
  </>;
}
