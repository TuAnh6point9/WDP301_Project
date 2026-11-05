// The official six WQI classes (QĐ 1460/QĐ-TCMT) as colour tones and labels, shared by every map.
import { getVnWqiQualityClass, type StationLatest, type VnWqiQualityClass } from '@wqi/contracts';
import { msg, qualityLabel } from '@/i18n';

/** CSS tone of each class (`.dot.*`, `.pin.*`). */
export const TONE: Record<VnWqiQualityClass, string> = { 'Rất tốt': 'exc', 'Tốt': 'good', 'Trung bình': 'fair', 'Xấu': 'poor', 'Kém': 'vpoor', 'Ô nhiễm rất nặng': 'heavy' };
/** Grey (`none`) means no WQI yet. */
export const tone = (wqi: number | null | undefined) => wqi == null ? 'none' : TONE[getVnWqiQualityClass(wqi)];
// Non-breaking spaces keep "WQI 73" or "Trung bình" whole; a narrow cell wraps only after "·".
const keep = (text: string) => text.split(' · ').map(part => part.replaceAll(' ', ' ')).join(' · ');
/** "WQI 73 · Medium" and "Batch D12-2027 · row 8": which approved row the station shows (decision 28). */
export const wqiText = (latest: StationLatest) => keep(latest.wqi == null ? msg('stations.noWqi') : `WQI ${latest.wqi} · ${qualityLabel(getVnWqiQualityClass(latest.wqi))}`);
export const batchText = (latest: StationLatest) => keep(msg('stations.batchRow', { code: latest.batchCode, row: latest.batchRow ?? '—' }));
