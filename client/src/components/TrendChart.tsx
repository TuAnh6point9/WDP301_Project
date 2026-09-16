import { parameterLabels, type Parameters, type WaterRecord } from '@wqi/contracts';
import { Empty } from './ui';
export function TrendChart({ records, field }: { records: WaterRecord[]; field: keyof Parameters | 'wqi' }) {
  if (!records.length) return <Empty/>;
  const groups = new Map<string, WaterRecord[]>();
  for (const record of records) {
    const id = typeof record.stationId === 'string' ? record.stationId : record.stationId?._id;
    if (!id) continue;
    groups.set(id, [...(groups.get(id) || []), record]);
  }
  return <div className="charts">{[...groups.entries()].map(([id, rows]) => {
    const sorted = [...rows].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
    const points = sorted.map(row => ({ time: Date.parse(row.measuredAt), value: field === 'wqi' ? row.wqi : row.parameters[field] }));
    const values = points.flatMap(point => point.value === null ? [] : [point.value]);
    const station = sorted[0].stationId;
    const label = typeof station === 'string' ? station : station.name;
    if (!values.length) return <div key={id}><h3>{label}</h3><Empty title="Chưa có WQI"/></div>;
    const minimum = Math.min(...values); const maximum = Math.max(...values);
    const span = maximum - minimum || 1; const start = points[0].time; const end = points[points.length - 1].time;
    const x = (time: number) => 45 + (end === start ? 270 : ((time - start) / (end - start)) * 530);
    const y = (value: number) => 155 - (value - minimum) / span * 120;
    const segments: string[][] = [[]];
    points.forEach(point => { if (point.value === null) segments.push([]); else segments[segments.length - 1].push(`${x(point.time)},${y(point.value)}`); });
    return <figure key={id}><figcaption>{label} · {field === 'wqi' ? 'WQI' : parameterLabels[field]}</figcaption><svg viewBox="0 0 620 190" role="img" aria-label={`Biểu đồ ${field} tại ${label}`}><line x1="45" y1="155" x2="575" y2="155" stroke="#d5dfdc"/><text x="4" y="40">{maximum.toFixed(1)}</text><text x="4" y="155">{minimum.toFixed(1)}</text>{segments.filter(segment => segment.length).map((segment, index) => <polyline key={index} points={segment.join(' ')} fill="none" stroke="#247967" strokeWidth="2"/>)}{points.map((point, index) => point.value !== null && <circle key={index} cx={x(point.time)} cy={y(point.value)} r="3" fill="#247967"><title>{new Date(point.time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}: {point.value}</title></circle>)}</svg><p className="muted">{new Date(start).toLocaleDateString('vi-VN')} — {new Date(end).toLocaleDateString('vi-VN')} · {values.length} giá trị trên trang hiện tại</p></figure>;
  })}</div>;
}
