import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { syncImportIndexes } from '../modules/imports/import.indexes.js';
// Run once per database when deploying batch-code imports: `npm run db:sync-import-indexes` with MONGODB_URI set.
try {
  await connectDatabase();
  const dropped = await syncImportIndexes();
  console.log(dropped.length ? `Dropped old indexes: ${dropped.join(', ')}.` : 'No old import indexes found.');
  console.log('Import indexes are up to date. Existing data was preserved.');
} finally { await mongoose.disconnect(); }
