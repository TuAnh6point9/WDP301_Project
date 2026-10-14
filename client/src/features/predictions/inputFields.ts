import { predictionParameterSpec } from '@wqi/contracts';
import type { Inputs } from './types';
import { WQI_REFERENCE_GUIDANCE } from './referenceGuidance';

const LABELS: Record<keyof Inputs, string> = { ph: 'pH', do: 'DO — Dissolved Oxygen', cod: 'COD', nh4: 'Amoni', po4: 'Phosphat', coliform: 'Coliforms' };
export const INPUT_FIELDS = (['coliform', 'nh4', 'ph', 'po4', 'do', 'cod'] as const).map(key => ({ ...predictionParameterSpec[key], ...WQI_REFERENCE_GUIDANCE[key], key, label: LABELS[key], step: 'any' }));
