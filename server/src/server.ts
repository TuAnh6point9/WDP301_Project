import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { getEnv } from './config/env.js';
import { PredictionBatch, PredictionBatchRow } from './modules/prediction-batches/batch.model.js';
import { startBatchWorker } from './modules/prediction-batches/batch.service.js';
try {
  const env = getEnv();
  await connectDatabase();
  await Promise.all([PredictionBatch.createIndexes(), PredictionBatchRow.createIndexes()]);
  const app = createApp();
  const stopBatchWorker = startBatchWorker();
  const server = app.listen(env.PORT, () => console.log(`API listening on http://localhost:${env.PORT}`));
  const shutdown = () => {
    const deadline = setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => { void stopBatchWorker().then(() => Promise.all([mongoose.disconnect(), app.locals.sessionStore.close()])).finally(() => { clearTimeout(deadline); process.exit(0); }); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error && error.message.startsWith('Invalid environment') ? error.message : 'Startup failed. Check environment variables and MongoDB connectivity.');
  process.exitCode = 1;
}
