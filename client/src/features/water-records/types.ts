import type { RawValues, WaterRecord } from '@wqi/contracts';
export type ReviewStatus = 'verified' | 'rejected';
/** A record as listed for admins: the station is populated. */
export type AdminRecord = WaterRecord & { stationId: { _id: string; code: string; name: string } | null };
type Person = { _id: string; name: string; email: string } | null;
/** GET /water-records/:id: who created/reviewed the record and the unchanged raw row it came from. */
export type AdminRecordDetail = Omit<AdminRecord, 'source' | 'reviewNote'> & {
  createdBy: Person; reviewedBy: Person; reviewedAt: string | null; reviewNote: string | null; wqiSource: string | null;
  source: {
    kind: 'manual' | 'excel'; note?: string;
    rowId?: { _id: string; rowNumber: number; values: RawValues; issues: string[]; batchId: { _id: string; fileName: string; createdAt: string } | null } | null;
  };
};
