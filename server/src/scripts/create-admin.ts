import mongoose from 'mongoose';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { userSchema } from '@wqi/contracts';
import { connectDatabase } from '../config/database.js';
import { User } from '../modules/users/user.model.js';
import { hashPassword } from '../modules/auth/auth.service.js';
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: true });
try {
  const name = await prompt.question('Admin name: ');
  const email = await prompt.question('Admin email: ');
  process.stdout.write('Password (minimum 12 characters; hidden): ');
  muted = true;
  const password = await prompt.question('');
  muted = false;
  process.stdout.write('\n');
  const input = userSchema.parse({ name, email, password, role: 'admin' });
  await connectDatabase();
  if (await User.exists({ email: input.email })) throw new Error('Account already exists. No changes made.');
  await User.create({ name: input.name, email: input.email, role: 'admin', passwordHash: await hashPassword(input.password) });
  console.log('Admin account created. No station or measurement data was added.');
} finally { prompt.close(); await mongoose.disconnect(); }
