import { msg, useLocale } from '@/i18n';
import type { UnitStatus } from '@wqi/contracts';

/** One plain sentence first; the model details stay one click away (decision 9 keeps them on the page). */
export function ResearchNote({ unitStatus, referenceBasis }: { unitStatus?: UnitStatus; referenceBasis?: string }) {
  useLocale();
  const units = unitStatus === 'confirmed' ? msg('predictions.unitsConfirmed') : unitStatus === 'assumed-for-research' ? msg('predictions.unitsAssumed') : msg('predictions.unitsUnverified');
  const basis = referenceBasis === 'formula-derived' ? msg('predictions.formulaNote') : referenceBasis === 'lecturer-provided' ? msg('predictions.catboostNote') : msg('predictions.legacyNote');
  return <div className="callout callout-neutral research-note">
    <span>{msg('predictions.plainNote')}</span>
    <details><summary>{msg('common.moreDetails')}</summary><p>{[basis, units, msg('predictions.researchUse')].join(' ')}</p></details>
  </div>;
}
