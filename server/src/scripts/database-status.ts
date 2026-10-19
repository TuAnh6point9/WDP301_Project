import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';

try {
  await connectDatabase();
  const database = mongoose.connection.db;
  if (!database) throw new Error('Database connection is not available.');

  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const summary = await Promise.all(collections
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async ({ name }) => ({ name, documents: await database.collection(name).countDocuments() })));

  console.log(JSON.stringify({
    host: mongoose.connection.host,
    database: mongoose.connection.name,
    state: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable',
    collections: summary,
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
