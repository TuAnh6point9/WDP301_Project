import type { VnWqiQualityClass } from '@wqi/contracts';

// Display metadata mirrors the existing contract bands; it never computes a prediction.
export const CLASSIFICATION_COLORS: Record<string, { background: string; color: string }> = {
  'Rất tốt': { background: 'rgb(51,51,255)', color: '#fff' },
  'Tốt': { background: 'rgb(0,228,0)', color: '#111' },
  'Trung bình': { background: 'rgb(255,255,0)', color: '#111' },
  'Xấu': { background: 'rgb(255,126,0)', color: '#111' },
  'Kém': { background: 'rgb(255,0,0)', color: '#111' },
  'Ô nhiễm rất nặng': { background: 'rgb(126,0,35)', color: '#fff' },
};

export const WQI_DISPLAY_BANDS: { label: VnWqiQualityClass; min: number; max: number }[] = [
  { label: 'Ô nhiễm rất nặng', min: 0, max: 9 },
  { label: 'Kém', min: 10, max: 25 },
  { label: 'Xấu', min: 26, max: 50 },
  { label: 'Trung bình', min: 51, max: 75 },
  { label: 'Tốt', min: 76, max: 90 },
  { label: 'Rất tốt', min: 91, max: 100 },
];
