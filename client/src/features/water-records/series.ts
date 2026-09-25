// Parameters and daily time axis for the Historical Data chart (UC04, UC05).

export const DAY = 864e5;
export const DAYS = 365;
/** Last day of the chart axis: today (UTC). Day index 0 is DAYS - 1 days earlier. */
export const END = (() => { const now = new Date(); return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); })();

export type ParamKey = 'DO' | 'BOD5' | 'COD' | 'NH4' | 'pH' | 'TSS' | 'Temp' | 'Coliform';
export type Param = { name: string; unit: string; lo: number | null; hi: number | null; dec: number };
// Default limits: QCVN 08-MT:2015/BTNMT, column A2.
export const PARAMS: Record<ParamKey, Param> = {
  DO: { name: 'DO', unit: 'mg/L', lo: 5, hi: null, dec: 1 },
  BOD5: { name: 'BOD5', unit: 'mg/L', lo: null, hi: 6, dec: 1 },
  COD: { name: 'COD', unit: 'mg/L', lo: null, hi: 15, dec: 1 },
  NH4: { name: 'Ammonium', unit: 'mg/L', lo: null, hi: .3, dec: 2 },
  pH: { name: 'pH', unit: 'pH', lo: 6, hi: 8.5, dec: 1 },
  TSS: { name: 'TSS', unit: 'mg/L', lo: null, hi: 30, dec: 0 },
  Temp: { name: 'Temperature', unit: '°C', lo: null, hi: null, dec: 1 },
  Coliform: { name: 'Coliform', unit: 'MPN/100mL', lo: null, hi: 5000, dec: 0 },
};
export const PARAM_KEYS = Object.keys(PARAMS) as ParamKey[];

/** Daily values per station and parameter, one slot per day index (null = no sample). */
export type SeriesSet = Record<string, Partial<Record<ParamKey, (number | null)[]>>>;
export type SeriesReader = (station: string, key: ParamKey) => (number | null)[];

const EMPTY: (number | null)[] = Array(DAYS).fill(null);

/** Reads one station's values, or the daily mean of all stations when station is 'all'. */
export function seriesReader(set: SeriesSet): SeriesReader {
  return (station, key) => {
    if (station !== 'all') return set[station]?.[key] ?? EMPTY;
    const all = Object.values(set).map(values => values[key] ?? EMPTY);
    return Array.from({ length: DAYS }, (_, i) => {
      const values = all.map(values => values[i]).filter((v): v is number => v !== null);
      return values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(PARAMS[key].dec) : null;
    });
  };
}

export const dateOf = (index: number) => new Date(END - (DAYS - 1 - index) * DAY);
export const isoOf = (index: number) => dateOf(index).toISOString().slice(0, 10);
export const indexOf = (iso: string) => Math.round((Date.parse(iso) - END) / DAY) + DAYS - 1;
