import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import { usePageReadiness } from '@/app/navigation/NavigationTransition';
import { PageStatus } from '@/components/PageStatus';
import { batchStatusLabels, listWqiBatches } from '../batch-api';

export function BatchHistoryPage() {
  const [page, setPage] = useState(1);
  const { user, sessionEpoch } = useAuth();
  const { data, error, loading, reload } = useAsync(() => listWqiBatches(page), [page, user?._id, sessionEpoch]);
  usePageReadiness(error ? 'error' : loading ? 'pending' : data?.rows.length ? 'ready' : 'empty');
  return <main className="container page stack-24">
    <div className="page-head"><div className="stack-4"><h1 className="h1">Lịch sử tính Excel</h1><p className="sub">Các đợt tính thuộc tài khoản của bạn.</p></div><Link className="btn btn-primary" to="/calculate">Tạo đợt tính mới</Link></div>
    <nav className="row row-wrap" aria-label="Loại lịch sử"><Link className="btn btn-secondary" to="/history">Nhập tay</Link><Link className="btn btn-primary" aria-current="page" to="/history/excel">Tính từ Excel</Link></nav>
    {loading || error ? <PageStatus inline error={error} onRetry={reload}/> : <section className="card card-flush"><div className="table-wrap"><table className="table">
      <thead><tr><th>File</th><th>Ngày tạo</th><th>Tổng dòng</th><th>Thành công</th><th>Lỗi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{data?.rows.map(batch => <tr key={batch._id}><td>{batch.fileName}</td><td>{formatDateTime(batch.createdAt)}</td><td>{batch.rowCount}</td><td>{batch.successCount}</td><td>{batch.errorCount}</td><td>{batchStatusLabels[batch.status]}</td><td><Link className="link" to={`/excel/${batch._id}`}>Mở đợt tính</Link></td></tr>)}{!data?.rows.length && <tr><td colSpan={7}>Chưa có đợt tính Excel.</td></tr>}</tbody>
    </table></div><div className="table-foot"><span className="small">{data?.meta.total ?? 0} đợt · Trang {page}/{Math.max(1, data?.meta.pages ?? 1)}</span><div className="pager"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Trang trước</button><button className="btn btn-secondary btn-sm" disabled={page >= (data?.meta.pages ?? 1)} onClick={() => setPage(n => n + 1)}>Trang sau</button></div></div></section>}
  </main>;
}
