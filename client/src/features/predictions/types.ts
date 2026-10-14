import type { Prediction, PredictionParameters } from '@wqi/contracts';

export type Inputs = PredictionParameters;
export type Calculation = Omit<Prediction, '_id' | 'createdAt' | 'parameters'> & { id: string; at: string; inputs: Prediction['parameters'] };
