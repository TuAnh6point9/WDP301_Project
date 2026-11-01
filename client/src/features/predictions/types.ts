import type { Prediction, PredictionParameters } from '@wqi/contracts';

export type Inputs = PredictionParameters;
export type Calculation = Omit<Prediction, '_id' | 'createdAt' | 'parameters'> & { id: string; at: string; inputs: Prediction['parameters'] };
/** A visitor's result: same numbers, but nothing was stored, so there is no id yet. */
export type PreviewCalculation = Omit<Calculation, 'id'>;
