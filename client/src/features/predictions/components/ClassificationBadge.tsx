import { qualityLabel, useLocale, type Locale } from '@/i18n';
import { qualityClassLabel } from '@wqi/contracts';
import type { Calculation } from '../types';
import { CLASSIFICATION_COLORS } from '../classificationDisplay';

export function ClassificationBadge({ value, large = false, locale }: { value: Calculation['qualityClass']; large?: boolean; locale?: Locale }) {
  useLocale();
  return <span className={`badge${large ? ' badge-lg' : ''}`} style={CLASSIFICATION_COLORS[value]}>{locale === 'en' ? qualityClassLabel(value) : qualityLabel(value)}</span>;
}
