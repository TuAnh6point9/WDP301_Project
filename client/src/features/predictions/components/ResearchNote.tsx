import type { UnitStatus } from '@wqi/contracts';

export function ResearchNote({ unitStatus, referenceBasis }: { unitStatus?: UnitStatus; referenceBasis?: string }) {
  const units = unitStatus === 'confirmed' ? 'Measurement units are confirmed.' : unitStatus === 'assumed-for-research' ? 'Source units are assumed for research.' : 'Source units are unverified. Use the original source values without unit conversion.';
  const basis = referenceBasis === 'formula-derived' ? 'ML predicts a reference WQI based on VN_WQI.' : referenceBasis === 'lecturer-provided' ? 'CatBoost predicts WQI using the lecturer-provided model. Training-label provenance and external preprocessing have not been verified. The six WQI bands are used for display.' : 'ML predicts WQI. The training-label source has not been recorded.';
  return <div className="callout callout-neutral"><span>{basis} {units} Results are for research use.</span></div>;
}
