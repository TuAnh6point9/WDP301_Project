import mongoose from 'mongoose';
import { getEnv } from './env.js';
import { createAtlasLookup, isAtlasSrvUri, isDnsFailure, resolveAtlasSeeds } from './atlas-dns.js';

export async function connectDatabase() {
  mongoose.set('bufferCommands', false);
  const env = getEnv();
  const options = { serverSelectionTimeoutMS: 15000, autoIndex: false };
  try {
    await mongoose.connect(env.MONGODB_URI, options);
  } catch (error) {
    if (env.MONGODB_DNS_FALLBACK !== 'https' || !isAtlasSrvUri(env.MONGODB_URI) || !isDnsFailure(error)) throw error;
    await mongoose.disconnect();
    const uri = await resolveAtlasSeeds(env.MONGODB_URI);
    console.warn('System DNS could not resolve Atlas. Using verified HTTPS DNS for this connection only.');
    await mongoose.connect(uri, { ...options, lookup: createAtlasLookup() });
  }
}
