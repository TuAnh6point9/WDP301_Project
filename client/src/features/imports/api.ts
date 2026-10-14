import { USER_MESSAGES as M } from '@wqi/contracts';
// Excel import of historical data (UC10) and the import history shown on Data Records.
// Backend endpoints (docs/openapi.yaml): POST /imports/preview, POST /imports/commit.
// TODO(BE): replace each body with a call through lib/http once the endpoint exists.
import type { ImportBatch, ImportOptions, ImportPreview, RowError } from './types';

export async function previewImport(_file: File, _options: ImportOptions): Promise<ImportPreview> {
  throw new Error(M.IMPORT_UNAVAILABLE);
}

export async function commitImport(_previewId: string): Promise<void> {
  throw new Error(M.IMPORT_UNAVAILABLE);
}

/** Newest first. */
export async function listImportBatches(): Promise<ImportBatch[]> {
  return [];
}

export async function rollbackImport(_id: string): Promise<void> {
  throw new Error(M.ROLLBACK_UNAVAILABLE);
}

export async function getImportErrors(_id: string): Promise<RowError[]> {
  return [];
}
