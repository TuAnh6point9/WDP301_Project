import type { ImportBatch as ApiBatch, ImportedRow } from '@wqi/contracts';
export type { ImportedRow };
export type ImportBatch = ApiBatch & { uploadedBy: { _id: string; name: string; email: string } | null };
/** One batch code found in the file. `validCount` rows can be saved; overwriting replaces the `replaces` records the batch already has. */
export type BatchCheck = {
  code: string; rowCount: number; stations: string[]; issueCount: number; validCount: number; replaces: number;
  existing: { createdAt: string; uploadedBy: { name: string } | null; rowCount: number } | null;
};
export type RejectedRow = { rowNumber: number; reason: string };
/** A row whose file cell for the batch code or station is empty. `label` is a code written in a column with no name. */
export type MissingRow = { rowNumber: number; code: string; station: string; label?: string };
/** [row number, batch code, station code] the admin completed in the dialog. */
export type ImportFill = [number, string, string];
/** Server-side check of an uploaded sheet; nothing is written yet. `confirm` holds the keys of existing batches; a batch the admin does not confirm is skipped. `stations` holds the active stations the admin can choose, small to large. */
export type ImportPreview = {
  rowCount: number; batches: BatchCheck[]; confirm: string[]; rejected: RejectedRow[]; missing: MissingRow[]; stations: string[];
  rows: Pick<ImportedRow, 'rowNumber' | 'values' | 'issues'>[];
};
export type ImportResult = { batches: { code: string; created: boolean; added: number; overwritten: number; issueCount: number; skipped?: number }[]; rejected: RejectedRow[]; wqi: { calculated: number; pending: number } };
