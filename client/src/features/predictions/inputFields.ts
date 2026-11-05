import { parameterDisplayKeys, predictionParameterSpec } from '@wqi/contracts';
import type { Inputs } from './types';
import { WQI_REFERENCE_GUIDANCE } from './referenceGuidance';

const LABELS: Record<keyof Inputs, string> = { coliform: 'Coliforms', nh4: 'Amoni', ph: 'pH', po4: 'Phosphat', do: 'DO — Dissolved Oxygen', cod: 'COD' };
export const INPUT_FIELDS = parameterDisplayKeys.map(key =>({ ...predictionParameterSpec[key], ...WQI_REFERENCE_GUIDANCE[key], key, label: LABELS[key] }));
