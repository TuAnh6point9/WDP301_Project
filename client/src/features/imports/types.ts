export type ImportStatus = 'Imported' | 'Rejected' | 'Rolled back';
export type ImportBatch = { id: string; file: string; by: string; date: string; rows: number; errors: number; status: ImportStatus };
export type RowError = { row: number; error: string };
/** Result of validating an uploaded sheet before anything is written. */
export type ImportPreview = { id: string; total: number; valid: number; errors: RowError[]; rows: { range: string; ok: boolean; note: string }[] };
export type ImportOptions = { station: string; duplicates: 'skip' | 'replace' };
