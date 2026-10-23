import { msg, useLocale } from '@/i18n';
import type { UnitStatus } from '@wqi/contracts';

export function ResearchNote({ unitStatus, referenceBasis }: { unitStatus?: UnitStatus; referenceBasis?: string }) {
  useLocale();
  const units = unitStatus === 'confirmed' ? msg('predictions.unitsConfirmed') : unitStatus === 'assumed-for-research' ? msg('predictions.unitsAssumed') : msg('predictions.unitsUnverified');
  const basis = referenceBasis === 'formula-derived' ? msg('predictions.formulaNote') : referenceBasis === 'lecturer-provided' ? msg('predictions.catboostNote') : msg('predictions.legacyNote');
  return <div className="callout callout-neutral"><span>{[basis, units, msg('predictions.researchUse')].join(' ')}</span></div>;
}
