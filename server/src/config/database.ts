import mongoose from 'mongoose';
import { getEnv } from './env.js';

export async function connectDatabase() {
  mongoose.set('bufferCommands', false);
  await mongoose.connect(getEnv().MONGODB_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
}
