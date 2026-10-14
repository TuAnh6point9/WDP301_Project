import type { Calculation } from '../types';
import { CLASSIFICATION_COLORS } from '../classificationDisplay';

export function ClassificationBadge({ value, large = false }: { value: Calculation['qualityClass']; large?: boolean }) {
  return <span className={`badge${large ? ' badge-lg' : ''}`} style={CLASSIFICATION_COLORS[value]}>{value}</span>;
}
