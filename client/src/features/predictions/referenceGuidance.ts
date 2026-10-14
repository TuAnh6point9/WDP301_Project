import type { Inputs } from './types';

// Display guidance only; these ranges never define validation or CatBoost's domain.
// Reference-unit guidance and source rationale are documented in docs/ai-contract.md.
export const WQI_REFERENCE_GUIDANCE: Record<keyof Inputs, { referenceUnit: string; referenceHint: string }> = {
  coliform: {
    referenceUnit: 'MPN/100 mL',
    referenceHint: 'Suggested range: 0–10,000',
  },
  nh4: {
    referenceUnit: 'mg/L as N',
    referenceHint: 'Suggested range: 0–5',
  },
  ph: {
    referenceUnit: '',
    referenceHint: 'Suggested range: 6–8.5 (allowed 0–14)',
  },
  po4: {
    referenceUnit: 'mg/L as P',
    referenceHint: 'Suggested range: 0–4',
  },
  do: {
    referenceUnit: 'mg/L',
    referenceHint: 'Suggested range: 0–12',
  },
  cod: {
    referenceUnit: 'mg/L',
    referenceHint: 'Suggested range: 0–150',
  },
};
