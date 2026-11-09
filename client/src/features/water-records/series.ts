// Parameters and sampling rounds for the Historical Data chart (UC04, UC05).
import { parameterLabels } from '@wqi/contracts';

// The six measurements the WQI model reads, plus the WQI computed from them.
export type ParamKey = 'WQI' | 'Coliform' | 'NH4' | 'pH' | 'PO4' | 'DO' | 'COD';
export type MeasurementKey = Exclude<ParamKey, 'WQI'>;
/** `better` is the direction of change that means cleaner water (null when neither does). */
export type Param = { name: string; unit: string; lo: number | null; hi: number | null; dec: number; better: 'up' | 'down' | null };
// Default limits: QCVN 08-MT:2015/BTNMT, column A2. WQI has no default limit.
// Names follow the contracts (parameterLabels); units are the reference units of the WQI form, since the source units are unverified.
export const PARAMS: Record<ParamKey, Param> = {
  WQI: { name: 'WQI', unit: 'WQI', lo: null, hi: null, dec: 0, better: 'up' },
  Coliform: { name: parameterLabels.coliform, unit: 'MPN/100 mL', lo: null, hi: 5000, dec: 0, better: 'down' },
  NH4: { name: parameterLabels.nh4, unit: 'mg/L as N', lo: null, hi: .3, dec: 2, better: 'down' },
  pH: { name: parameterLabels.ph, unit: 'pH', lo: 6, hi: 8.5, dec: 2, better: null },
  PO4: { name: parameterLabels.po4, unit: 'mg/L as P', lo: null, hi: .2, dec: 2, better: 'down' },
  DO: { name: parameterLabels.do, unit: 'mg/L', lo: 5, hi: null, dec: 2, better: 'up' },
  COD: { name: parameterLabels.cod, unit: 'mg/L', lo: null, hi: 15, dec: 2, better: 'down' },
};
/** The six measurements in the order of every screen (contracts parameterDisplayKeys): Coliform, Amoni, pH, Phosphat, DO, COD. */
export const MEASUREMENT_KEYS: MeasurementKey[] = ['Coliform', 'NH4', 'pH', 'PO4', 'DO', 'COD'];
/** What the Historical Data chart can show: the six measurements, then the WQI computed from them. */
export const CHART_KEYS: ParamKey[] = [...MEASUREMENT_KEYS, 'WQI'];
/** CSV header: Vietnamese column names of the data-entry template, in its order (user's request 06/11). */
export const HISTORY_CSV_HEADER = ['Mã đợt', 'Mã trạm', 'Coliforms', 'Amoni', 'PH', 'Phosphat', 'DO', 'COD', 'WQI'];
/** "DO (mg/L)"; a parameter whose unit is its own name (pH, WQI) is shown once. */
export const paramLabel = (key: ParamKey) => PARAMS[key].unit === PARAMS[key].name ? PARAMS[key].name : `${PARAMS[key].name} (${PARAMS[key].unit})`;

/**
 * A sampling round ("đợt đo"): the batch code of an Excel import, or, for a record entered with a sampling
 * date and no code, that day. `at` orders the rounds: the day sampled, or when the batch was first saved.
 */
export type Round = { key: string; code: string | null; day: string | null; at: number };
/** The batch code, or the sampling day as dd/mm/yyyy for records without one. */
export const roundLabel = (round: Round) => round.code ?? round.day!.split('-').reverse().join('/');
/** One verified record as charted: its stored values and WQI, unchanged. */
export type Sample = { id: string; round: string; station: string; values: Record<MeasurementKey, number>; wqi: number | null };

/**
 * What the chart shows for one round: the mean of its samples and, when there are several, their lowest and highest value.
 * WQI is read from the samples that have one; it is null for a round where none has.
 */
export type RoundPoint = {
  round: Round; label: string; stations: string[]; count: number;
  mean: Record<ParamKey, number | null>; range: Record<ParamKey, readonly [number, number] | null>;
};
const valueOf = (sample: Sample, key: ParamKey) => key === 'WQI' ? sample.wqi : sample.values[key];
export function roundPoints(rounds: Round[], samples: Sample[]): RoundPoint[] {
  const byRound = new Map<string, Sample[]>();
  for (const sample of samples) {
    const group = byRound.get(sample.round) ?? [];
    group.push(sample);
    byRound.set(sample.round, group);
  }
  return rounds.flatMap(round => {
    const group = byRound.get(round.key);
    if (!group?.length) return [];
    const of = <T>(read: (values: number[], key: ParamKey) => T) => Object.fromEntries(CHART_KEYS.map(key => [key, read(group.flatMap(sample => valueOf(sample, key) ?? []), key)])) as Record<ParamKey, T>;
    return [{
      round, label: roundLabel(round), stations: [...new Set(group.map(sample => sample.station))].sort(), count: group.length,
      mean: of((values, key) => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(PARAMS[key].dec) : null),
      range: of(values => values.length > 1 ? [Math.min(...values), Math.max(...values)] as const : null),
    }];
  });
}
