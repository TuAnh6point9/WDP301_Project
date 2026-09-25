// WQI classification bands used across the web app (0–100 scale).

export type QualityKey = 'exc' | 'good' | 'fair' | 'poor' | 'vpoor';
export type Quality = { key: QualityKey; label: string };

const QUALITY: [number, QualityKey, string][] = [[91, 'exc', 'Excellent'], [76, 'good', 'Good'], [51, 'fair', 'Fair'], [26, 'poor', 'Poor'], [0, 'vpoor', 'Very Poor']];
export function quality(wqi: number): Quality {
  const [, key, label] = QUALITY.find(([min]) => wqi >= min)!;
  return { key, label };
}
