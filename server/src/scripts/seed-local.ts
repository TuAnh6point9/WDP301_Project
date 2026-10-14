import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { parseWorkbook, commitWorkbook } from '../modules/imports/import.service.js';
import { User } from '../modules/users/user.model.js';
import { Station } from '../modules/stations/station.model.js';
import { WaterRecord } from '../modules/water-records/water-record.model.js';
import { ImportBatch, ImportedRow } from '../modules/imports/import.model.js';
import { Prediction } from '../modules/predictions/prediction.model.js';
import { hashPassword, verifyPassword } from '../modules/auth/auth.service.js';

// This command deliberately cannot target Atlas or another local database.
const localUri = 'mongodb://127.0.0.1:27017/akh_wqi_local?directConnection=true';
const privateDir = fileURLToPath(new URL('../../../.local/', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
const backupPath = `${envPath}.atlas.local`;
const credentialsPath = join(privateDir, 'local-admin.json');
const sourcePath = resolve(process.argv[2] ?? join(homedir(), 'Downloads', 'AKH-5_2026 (1).xlsx'));
const adminEmail = 'admin.local@wqi.local';

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

async function main() {
  // Validate the file before changing the database or backend configuration.
  const buffer = await readFile(sourcePath);
  const parsed = await parseWorkbook(buffer);
  await mongoose.connect(localUri, { serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  if (mongoose.connection.name !== 'akh_wqi_local') throw new Error('Unexpected database; refusing to seed.');
  await mkdir(privateDir, { recursive: true });

  for (const model of [User, Station, WaterRecord, ImportBatch, ImportedRow, Prediction]) {
    if (!await db.listCollections({ name: model.collection.name }).hasNext()) await model.createCollection();
    await model.createIndexes();
  }
  for (const name of ['ai_input_schemas', 'sessions']) {
    if (!await db.listCollections({ name }).hasNext()) await db.createCollection(name);
  }

  let migration = await User.findOne({ email: 'data-migration@system.local' });
  if (!migration) migration = await User.create({
    name: 'Historical Data Migration', email: 'data-migration@system.local',
    passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
    role: 'admin', isActive: false,
  });

  let admin = await User.findOne({ email: adminEmail }).select('+passwordHash');
  let credentials: { email: string; password: string };
  if (admin) {
    if (!await exists(credentialsPath)) throw new Error('Local admin already exists but .local/local-admin.json is missing. No password was reset.');
    credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
    if (credentials.email !== adminEmail || admin.role !== 'admin' || !admin.isActive ||
        !await verifyPassword(credentials.password, admin.passwordHash)) {
      throw new Error('Existing local admin does not match the saved credentials. No account was overwritten.');
    }
  } else {
    // Save before insertion so a retry can recover from interruption without losing the password.
    credentials = await exists(credentialsPath)
      ? JSON.parse(await readFile(credentialsPath, 'utf8'))
      : { email: adminEmail, password: randomBytes(24).toString('base64url') };
    if (credentials.email !== adminEmail || typeof credentials.password !== 'string' || credentials.password.length < 12) {
      throw new Error('Invalid local credential file.');
    }
    if (!await exists(credentialsPath)) await writeFile(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    admin = await User.create({ name: 'Local Development Admin', email: adminEmail,
      passwordHash: await hashPassword(credentials.password), role: 'admin', isActive: true });
  }

  const result = await commitWorkbook(buffer, basename(sourcePath), migration.id);
  const stored = await ImportedRow.find({ batchId: result.batch._id }).sort({ rowNumber: 1 }).lean();
  if (stored.length !== parsed.rows.length || stored.some((row, i) => row.rowNumber !== parsed.rows[i].rowNumber ||
      Object.entries(parsed.rows[i].values).some(([key, value]) => row.values[key] !== value))) {
    throw new Error('Database rows differ from the source workbook. Backend configuration was not switched.');
  }

  // Export the eight original features, with no invented WQI labels or measurement metadata.
  const datasetDir = join(privateDir, 'datasets');
  await mkdir(datasetDir, { recursive: true });
  await writeFile(join(datasetDir, 'AKH-5_2026.raw.json'), `${JSON.stringify(stored.map(row => ({
    rowNumber: row.rowNumber, values: row.values,
  })), null, 2)}\n`);
  const collectionCounts: Record<string, number> = {};
  for (const name of ['ai_input_schemas', 'importbatches', 'importedrows', 'predictions', 'stations', 'users', 'waterrecords']) {
    collectionCounts[name] = await db.collection(name).countDocuments();
  }
  const manifest = { database: 'akh_wqi_local', sourceFile: basename(sourcePath), sha256: parsed.contentHash,
    batchId: result.batch.id, rowCount: parsed.rows.length, issueCount: parsed.issueCount,
    allSourceCellsMatch: true, duplicateImport: result.duplicate, collectionCounts,
    missingForSupervisedWqiTraining: ['WQI target labels', 'confirmed parameter units/basis', 'station/time metadata'],
  };
  await writeFile(join(privateDir, 'local-database-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const originalEnv = await readFile(envPath, 'utf8');
  if (!/^MONGODB_URI=.*akh_wqi_local/m.test(originalEnv) && !await exists(backupPath)) {
    await writeFile(backupPath, originalEnv, { flag: 'wx', mode: 0o600 });
  }
  let localEnv = originalEnv;
  for (const [key, value] of Object.entries({ MONGODB_URI: localUri, NODE_ENV: 'development', AI_MODE: 'disabled' })) {
    const expression = new RegExp(`^${key}=.*$`, 'm');
    localEnv = expression.test(localEnv) ? localEnv.replace(expression, `${key}=${value}`) : `${localEnv.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(envPath, localEnv);
  console.log(JSON.stringify(manifest, null, 2));
  console.log('Backend configured for local MongoDB. Admin credentials: .local/local-admin.json (not printed).');
  console.log('Previous configuration, when applicable: server/.env.atlas.local (ignored by Git).');
}

try { await main(); }
catch (error) {
  // Do not print connection strings, credential documents or database error objects.
  console.error(error instanceof Error && /^(Local admin|Existing local admin|Invalid local credential|Unexpected database|Database rows)/.test(error.message)
    ? error.message : 'Local setup failed. Check that MongoDB is running on 127.0.0.1:27017 and the workbook path is correct.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
