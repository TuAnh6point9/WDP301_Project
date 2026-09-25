export type RecordColumn = 'ph' | 'do' | 'bod' | 'cod' | 'nh4' | 'col';
/** One water quality sample as listed on the admin Data Records page. */
export type WaterRecord = { id: string; date: string; station: string; wqi: number | null; source: string } & Record<RecordColumn, number | null>;
export type WaterRecordInput = Omit<WaterRecord, 'id' | 'wqi' | 'source'>;
