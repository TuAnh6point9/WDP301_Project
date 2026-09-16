import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { Database, WarningCircle } from '@phosphor-icons/react';
import { parameterKeys, parameterLabels, type Parameters, type PageMeta } from '@wqi/contracts';
import { errorMessage } from '../lib/axios';
export const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-heading"><div><p className="eyebrow">AN KIM HẢI / CHẤT LƯỢNG NƯỚC</p><h1>{title}</h1>{description && <p className="subheading">{description}</p>}</div>{actions}</header>;
}
export function Empty({ title = 'Chưa có dữ liệu', children }: { title?: string; children?: ReactNode }) {
  return <div className="empty"><Database size={32} weight="light"/><h3>{title}</h3><p>{children || 'Dữ liệu sẽ xuất hiện khi được bổ sung và kiểm định.'}</p></div>;
}
export function Alert({ children }: { children: ReactNode }) { return <div className="alert" role="alert"><WarningCircle size={20}/><span>{children}</span></div>; }
export function Loading() { return <p className="loading" role="status">Đang tải dữ liệu…</p>; }
export function QualityBadge({ value, label }: { value: number | null; label: string | null }) {
  return <span className="badge">{value === null ? 'Chưa có WQI' : `${value} · ${label || 'Chưa phân hạng'}`}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { pending: 'Chờ kiểm định', verified: 'Đã kiểm định', rejected: 'Từ chối', ready: 'Đã nhập', importing: 'Đang nhập', failed: 'Nhập lỗi' };
  return <span className={`badge status-${status}`}>{labels[status] || status}</span>;
}
export function Pager({ meta, onPage }: { meta?: PageMeta; onPage: (page: number) => void }) {
  if (!meta || meta.total === 0) return null;
  return <div className="pager"><span>{meta.total} bản ghi · Trang {meta.page}/{meta.pages}</span><div><button className="button secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Trước</button><button className="button secondary" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Tiếp</button></div></div>;
}
export function ActionForm({ onSubmit, children, submitLabel = 'Lưu', onSuccess }: { onSubmit: (form: FormData) => Promise<void>; children: ReactNode; submitLabel?: string; onSuccess?: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess(false);
    try { await onSubmit(data); setSuccess(true); onSuccess?.(); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <form onSubmit={handle} className="form-stack"><fieldset disabled={busy}>{children}</fieldset>{error && <Alert>{error}</Alert>}{success && <p className="success" role="status">Đã lưu thành công.</p>}<button className="button" disabled={busy}>{busy ? 'Đang xử lý…' : submitLabel}</button></form>;
}
export function ParameterFields({ initial = {} }: { initial?: Partial<Parameters> }) {
  return <div className="form-grid">{parameterKeys.map(key => <label key={key}>{parameterLabels[key]} <small>{key === 'ph' ? 'không đơn vị' : 'mg/L'}</small><input name={key} type="number" step="any" min="0" max={key === 'ph' ? 14 : undefined} required defaultValue={initial[key]} /></label>)}</div>;
}
export function readParameters(form: FormData): Parameters {
  return Object.fromEntries(parameterKeys.map(key => [key, form.get(key) === '' || form.get(key) === null ? NaN : Number(form.get(key))])) as Parameters;
}
export function UnitConfirmation() {
  return <label className="check"><input type="checkbox" required name="unitsConfirmed"/>Tôi xác nhận các nồng độ dùng mg/L, NH4+ tính theo ion; đã đối chiếu với nguồn dữ liệu.</label>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} aria-label={title} className="modal" onCancel={event => { event.preventDefault(); onClose(); }}><header><h2>{title}</h2><button type="button" className="button secondary" onClick={onClose}>Đóng</button></header>{children}</dialog>;
}
