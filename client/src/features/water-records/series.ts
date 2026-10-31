// Parameters and daily time axis for the Historical Data chart (UC04, UC05).
import { parameterLabels } from '@wqi/contracts';

export const DAY = 864e5;
export const DAYS = 365;
/** Last day of the chart axis: today (UTC). Day index 0 is DAYS - 1 days earlier. */
export const END = (() => { const now = new Date(); return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); })();

// The six measurements the WQI model reads, plus the WQI computed from them.
export type ParamKey = 'WQI' | 'Coliform' | 'NH4' | 'pH' | 'PO4' | 'DO' | 'COD';
/** `better` is the direction of change that means cleaner water (null when neither does). */
export type Param = { name: string; unit: string; lo: number | null; hi: number | null; dec: number; better: 'up' | 'down' | null };
// Default limits: QCVN 08-MT:2015/BTNMT, column A2. WQI has no default limit.
// Names and order follow the contracts (parameterLabels/parameterKeys); units are the reference units of
// the WQI form, since the source units are unverified.
export const PARAMS: Record<ParamKey, Param> = {
  WQI: { name: 'WQI', unit: 'WQI', lo: null, hi: null, dec: 0, better: 'up' },
  Coliform: { name: parameterLabels.coliform, unit: 'MPN/100 mL', lo: null, hi: 5000, dec: 0, better: 'down' },
  NH4: { name: parameterLabels.nh4, unit: 'mg/L as N', lo: null, hi: .3, dec: 2, better: 'down' },
  pH: { name: parameterLabels.ph, unit: 'pH', lo: 6, hi: 8.5, dec: 2, better: null },
  PO4: { name: parameterLabels.po4, unit: 'mg/L as P', lo: null, hi: .2, dec: 2, better: 'down' },
  DO: { name: parameterLabels.do, unit: 'mg/L', lo: 5, hi: null, dec: 2, better: 'up' },
  COD: { name: parameterLabels.cod, unit: 'mg/L', lo: null, hi: 15, dec: 2, better: 'down' },
};
export const PARAM_KEYS = Object.keys(PARAMS) as ParamKey[];
/** The six measurements charted on the Historical Data page; WQI is shown in its table. */
export const MEASUREMENT_KEYS = PARAM_KEYS.filter(key => key !== 'WQI');
/** "DO (mg/L)"; a parameter whose unit is its own name (pH, WQI) is shown once. */
export const paramLabel = (key: ParamKey) => PARAMS[key].unit === PARAMS[key].name ? PARAMS[key].name : `${PARAMS[key].name} (${PARAMS[key].unit})`;

/** Daily values per station and parameter, one slot per day index (null = no sample). */
export type SeriesSet = Record<string, Partial<Record<ParamKey, (number | null)[]>>>;
export type SeriesReader = (station: string, key: ParamKey) => (number | null)[];

const EMPTY: (number | null)[] = Array(DAYS).fill(null);

/** Reads one station's values, or the daily mean of all stations when station is 'all'. */
export function seriesReader(set: SeriesSet): SeriesReader {
  return (station, key) => {
    if (station !== 'all') return set[station]?.[key] ?? EMPTY;
    // A mean of WQI values is not a WQI.
    if (key === 'WQI') return EMPTY;
    const all = Object.values(set).map(values => values[key] ?? EMPTY);
    return Array.from({ length: DAYS }, (_, i) => {
      const values = all.map(values => values[i]).filter((v): v is number => v !== null);
      return values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(PARAMS[key].dec) : null;
    });
  };
}

/**
 * A sampling round ("đợt đo"): one day on which at least one station was sampled. Rounds are numbered
 * from 1 in date order within each calendar year, so round 3 of 2026 is the third sampling day of 2026
 * on the chart axis (the past year).
 */
export type Batch = { day: number; number: number; year: number };
export function batchesOf(days: Iterable<number>): Batch[] {
  let year = 0, number = 0;
  return [...new Set(days)].sort((a, b) => a - b).map(day => {
    const y = dateOf(day).getUTCFullYear();
    number = y === year ? number + 1 : 1;
    year = y;
    return { day, number, year };
  });
}

export const dateOf = (index: number) => new Date(END - (DAYS - 1 - index) * DAY);
export const isoOf = (index: number) => dateOf(index).toISOString().slice(0, 10);
export const indexOf = (iso: string) => Math.round((Date.parse(iso) - END) / DAY) + DAYS - 1;
