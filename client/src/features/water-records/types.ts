export type RecordColumn = 'ph' | 'do' | 'cod' | 'nh4' | 'po4' | 'coliform';
export type ReviewStatus = 'pending' | 'verified' | 'rejected';
/** One water quality sample as listed on the admin Data Records page. */
export type WaterRecord = {
  id: string; date: string; station: string; stationId: string; wqi: number | null;
  /** Short origin label; sourceNote holds the full provenance note, if any. */
  source: string; sourceNote: string;
  status: ReviewStatus; version: number;
} & Record<RecordColumn, number | null>;
export type WaterRecordInput = { date: string; stationId: string } & Record<RecordColumn, number>;
/** A station a sample can be recorded at. */
export type RecordStation = { id: string; code: string; name: string; active: boolean };
