import type { Inputs } from './types';

// Pending the AI team's official variable specification (requirements section 6).
export const INPUT_FIELDS: { key: keyof Inputs; label: string; unit: string; min: number; max: number; step: string; warnAbove?: number }[] = [
  { key: 'ph', label: 'pH', unit: '', min: 0, max: 14, step: '0.1' },
  { key: 'do', label: 'DO — Dissolved Oxygen', unit: 'mg/l', min: 0, max: 14, step: '0.1' },
  { key: 'bod5', label: 'BOD5', unit: 'mg/l', min: 0, max: 50, step: '0.1' },
  { key: 'cod', label: 'COD', unit: 'mg/l', min: 0, max: 100, step: '0.1' },
  { key: 'nh4', label: 'Ammonium — N-NH4', unit: 'mg/l', min: 0, max: 10, step: '0.01', warnAbove: 0.3 },
  { key: 'coliform', label: 'Coliforms', unit: 'MPN/100ml', min: 0, max: 10000, step: '1' },
];
