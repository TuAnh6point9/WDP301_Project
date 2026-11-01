import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { syncImportIndexes } from '../src/modules/imports/import.indexes.js';

// A separate mongod and database; the script itself is only ever run on Atlas by the team lead.
const installedMongod = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
let db: MongoMemoryServer;
beforeAll(async () => {
  if (existsSync(installedMongod)) process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
  db = await MongoMemoryServer.create({ instance: { dbName: 'index_test_only' }, binary: existsSync(installedMongod) ? { systemBinary: installedMongod } : undefined });
  await mongoose.connect(db.getUri(), { dbName: 'index_test_only', autoIndex: false });
});
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });

describe('import index sync', () => {
  it('replaces the old unique indexes that block batch-code imports and is safe to run twice', async () => {
    const collection = (name: string) => mongoose.connection.db!.collection(name);
    await collection('importbatches').createIndex({ contentHash: 1 }, { unique: true });
    await collection('importedrows').createIndex({ batchId: 1, rowNumber: 1 }, { unique: true });
    await collection('waterrecords').createIndex({ stationId: 1, measuredAt: 1 }, { unique: true });
    await collection('waterrecords').createIndex({ batchCode: 1, stationId: 1 }, { unique: true, partialFilterExpression: { batchCode: { $type: 'string' } } });
    expect(await syncImportIndexes()).toEqual(['importbatches.contentHash_1', 'importedrows.batchId_1_rowNumber_1', 'waterrecords.stationId_1_measuredAt_1', 'waterrecords.batchCode_1_stationId_1']);
    expect(await syncImportIndexes()).toEqual([]);
    const indexes = async (name: string) => Object.fromEntries((await collection(name).indexes()).map(index => [index.name, { unique: index.unique ?? false, partial: index.partialFilterExpression ?? null }]));
    expect(await indexes('importbatches')).toMatchObject({ code_1: { unique: true, partial: { code: { $type: 'string' } } } });
    expect((await indexes('importbatches')).contentHash_1).toBeUndefined();
    expect(await indexes('importedrows')).toMatchObject({ batchId_1_rowNumber_1: { unique: false }, waterRecordId_1: { unique: true } });
    expect(await indexes('waterrecords')).toMatchObject({
      stationId_1_measuredAt_1: { unique: true, partial: { measuredAt: { $type: 'date' } } },
      batchCode_1_batchRow_1: { unique: true, partial: { batchCode: { $type: 'string' }, batchRow: { $type: 'number' } } },
    });
    expect((await indexes('waterrecords')).batchCode_1_stationId_1).toBeUndefined();
  });
});
