import type { ImportBatch as ApiBatch, ImportedRow } from '@wqi/contracts';
export type { ImportedRow };
export type ImportBatch = ApiBatch & { uploadedBy: { _id: string; name: string; email: string } | null };
/** Server-side validation of an uploaded sheet; nothing is written yet. */
export type ImportPreview = {
  rows: Pick<ImportedRow, 'rowNumber' | 'values' | 'issues'>[]; rowCount: number; issueCount: number;
  missingMetadata: string[]; duplicate: boolean;
};
export type NormalizeInput = { stationId: string; measuredAt: string; sourceNote: string };
