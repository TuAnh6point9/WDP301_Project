import type { Inputs } from './types';

// Display guidance only; these ranges never define validation or CatBoost's domain.
// Reference-unit guidance and source rationale are documented in docs/ai-contract.md.
export const WQI_REFERENCE_GUIDANCE: Record<keyof Inputs, { referenceUnit: string; referenceHint: string; range: [number, number] }> = {
  coliform: {
    referenceUnit: 'MPN/100 mL',
    referenceHint: 'Suggested range: 0–10,000',
    range: [0, 10000],
  },
  nh4: {
    referenceUnit: 'mg/L as N',
    referenceHint: 'Suggested range: 0–5',
    range: [0, 5],
  },
  ph: {
    referenceUnit: '',
    referenceHint: 'Suggested range: 6–8.5 (allowed 0–14)',
    range: [6, 8.5],
  },
  po4: {
    referenceUnit: 'mg/L as P',
    referenceHint: 'Suggested range: 0–4',
    range: [0, 4],
  },
  do: {
    referenceUnit: 'mg/L',
    referenceHint: 'Suggested range: 0–12',
    range: [0, 12],
  },
  cod: {
    referenceUnit: 'mg/L',
    referenceHint: 'Suggested range: 0–150',
    range: [0, 150],
  },
};
/** Draws a reviewer's eye to a likely typo; it never rejects or changes the value. */
export const outsideReference = (key: keyof Inputs, value: number) => value < WQI_REFERENCE_GUIDANCE[key].range[0] || value > WQI_REFERENCE_GUIDANCE[key].range[1];
