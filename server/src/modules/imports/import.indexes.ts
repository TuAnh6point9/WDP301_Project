import { ImportBatch, ImportedRow } from './import.model.js';
import { WaterRecord } from '../water-records/water-record.model.js';

// `createIndexes` never drops an index, and these old ones block batch-code imports (decision 24; the last one since a batch holds many rows of one station).
const outdated = [
  { model: ImportBatch, name: 'contentHash_1', stale: () => true },
  { model: ImportedRow, name: 'batchId_1_rowNumber_1', stale: (index: { unique?: boolean }) => Boolean(index.unique) },
  { model: WaterRecord, name: 'stationId_1_measuredAt_1', stale: (index: { partialFilterExpression?: unknown }) => !index.partialFilterExpression },
  { model: WaterRecord, name: 'batchCode_1_stationId_1', stale: () => true },
];
/** Drops the outdated import indexes, then creates the current ones. Data is untouched. Returns the dropped index names. */
export async function syncImportIndexes() {
  const dropped: string[] = [];
  for (const { model, name, stale } of outdated) {
    const index = (await model.collection.indexes().catch(() => [])).find(item => item.name === name);
    if (!index || !stale(index)) continue;
    await model.collection.dropIndex(name);
    dropped.push(`${model.collection.collectionName}.${name}`);
  }
  for (const model of [ImportBatch, ImportedRow, WaterRecord]) await model.createIndexes();
  return dropped;
}
