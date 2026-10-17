import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { PREDICTION_UNIT_BASIS, parametersSchema, type Parameters as Measurements } from '@wqi/contracts';
import { connectDatabase } from '../config/database.js';
import { User } from '../modules/users/user.model.js';
import { Station } from '../modules/stations/station.model.js';
import { WaterRecord } from '../modules/water-records/water-record.model.js';
import { deriveWqi } from '../modules/water-records/water-record.service.js';
import { getAiStatus } from '../integrations/ai/ai.service.js';
import { hashPassword } from '../modules/auth/auth.service.js';

// Loads the AKH monitoring workbook supplied by the lecturer: blocks of nine rows, one per
// sampling round, ordered AH1…AH9, with the round label (e.g. D17-2026) in column J of a block's
// first row. Only rounds of YEAR are imported. Re-running is safe: a round already stored for a
// station is left as it is, except that --dates moves it to the date given there.
const YEAR = 2026;
const HEADER = ['PH', 'Temp', 'BOD5', 'COD', 'DO', 'Amoni', 'Phosphat', 'Coliforms', 'WQI'];
const COLUMNS: Record<keyof Measurements, number> = { ph: 1, cod: 4, do: 5, nh4: 6, po4: 7, coliform: 8 };
const STATION_COUNT = 9;
// Provisional positions read off the lecturer's sampling map; replace them once the official
// coordinates arrive. Existing stations are never modified by this script.
const STATIONS: { code: string; administrativeArea: 'Hải Dương' | 'Hải Phòng'; coordinates: [number, number] }[] = [
  { code: 'AH1', administrativeArea: 'Hải Dương', coordinates: [106.491, 20.936] },
  { code: 'AH2', administrativeArea: 'Hải Dương', coordinates: [106.493, 20.956] },
  { code: 'AH3', administrativeArea: 'Hải Phòng', coordinates: [106.536, 20.951] },
  { code: 'AH4', administrativeArea: 'Hải Phòng', coordinates: [106.563, 20.896] },
  { code: 'AH5', administrativeArea: 'Hải Phòng', coordinates: [106.573, 20.868] },
  { code: 'AH6', administrativeArea: 'Hải Phòng', coordinates: [106.611, 20.866] },
  { code: 'AH7', administrativeArea: 'Hải Phòng', coordinates: [106.656, 20.858] },
  { code: 'AH8', administrativeArea: 'Hải Phòng', coordinates: [106.620, 20.843] },
  { code: 'AH9', administrativeArea: 'Hải Phòng', coordinates: [106.670, 20.843] },
];

type Sample = { row: number; round: string; station: string; parameters: Measurements; fileWqi: number | null; measuredAt: Date; provisional: boolean };

function usage(): never {
  throw new Error('Usage: npm run db:akh-2026 -- <workbook.xlsx> [--dates <round-dates.json>]');
}
function numberOf(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\s*\d+(?:[.,]\d+)?\s*$/.test(value)) return Number(value.trim().replace(',', '.'));
  if (value && typeof value === 'object' && 'result' in value) return numberOf(value.result as ExcelJS.CellValue);
  if (value && typeof value === 'object' && 'richText' in value) return numberOf(value.richText.map(part => part.text).join(''));
  return null;
}
/** Until the real sampling dates are provided: two rounds a month, on the 5th and the 20th. */
function provisionalDate(round: number) {
  if (round < 1 || round > 24) throw new Error(`Round ${round} has no provisional date; pass it with --dates.`);
  return `${YEAR}-${String(Math.ceil(round / 2)).padStart(2, '0')}-${round % 2 ? '05' : '20'}`;
}

async function readSamples(path: string, dates: Record<string, string>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readFile(path) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet || HEADER.some((name, index) => String(sheet.getCell(1, index + 1).value ?? '').trim() !== name)) {
    throw new Error(`The first sheet must start with the columns ${HEADER.join(', ')}.`);
  }
  const samples: Sample[] = [], problems: string[] = [];
  for (let first = 2; first <= sheet.rowCount; first += STATION_COUNT) {
    const label = String(sheet.getCell(first, 10).value ?? '').trim();
    const match = /^D(\d{1,2})-(\d{4})$/.exec(label);
    if (!match || Number(match[2]) !== YEAR) continue;
    const given = dates[label];
    const real = (day: string) => { const date = new Date(`${day}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(day); };
    if (given !== undefined && !real(given)) throw new Error(`Invalid date for ${label} in --dates: ${given}`);
    const day = given ?? provisionalDate(Number(match[1]));
    for (let offset = 0; offset < STATION_COUNT; offset++) {
      const row = first + offset;
      const values = Object.fromEntries(Object.entries(COLUMNS).map(([key, column]) => [key, numberOf(sheet.getCell(row, column).value)]));
      const parameters = parametersSchema.safeParse(values);
      if (!parameters.success) { problems.push(`row ${row} (${label}, AH${offset + 1})`); continue; }
      samples.push({ row, round: label, station: `AH${offset + 1}`, parameters: parameters.data, fileWqi: numberOf(sheet.getCell(row, 9).value),
        measuredAt: new Date(`${day}T00:00:00Z`), provisional: given === undefined });
    }
  }
  if (problems.length) throw new Error(`Missing or invalid measurements, nothing was written: ${problems.join('; ')}`);
  if (!samples.length) throw new Error(`No rounds labelled D<n>-${YEAR} were found in column J.`);
  return samples;
}

async function systemUser() {
  // The same inactive account the local seed uses for data migrations; it cannot sign in.
  const existing = await User.findOne({ email: 'data-migration@system.local' });
  return existing ?? User.create({
    name: 'Historical Data Migration', email: 'data-migration@system.local',
    passwordHash: await hashPassword(randomBytes(32).toString('base64url')), role: 'admin', isActive: false,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const datesAt = args.indexOf('--dates');
  const datesPath = datesAt >= 0 ? args[datesAt + 1] ?? usage() : null;
  const workbookPath = args.find((arg, index) => !arg.startsWith('--') && (datesAt < 0 || index !== datesAt + 1)) ?? usage();
  const base = process.env.INIT_CWD ?? process.cwd();
  const dates: Record<string, string> = datesPath ? JSON.parse(await readFile(resolve(base, datesPath), 'utf8')) : {};
  const samples = await readSamples(resolve(base, workbookPath), dates);

  const ai = await getAiStatus();
  if (!ai.available) throw new Error(`The AI service is not ready (${ai.reason}). Start it with npm run ai:dev, then run this again.`);
  await connectDatabase();
  for (const model of [Station, WaterRecord]) await model.createIndexes();
  const user = await systemUser();

  const stations = new Map<string, mongoose.Types.ObjectId>();
  let stationsCreated = 0;
  for (const { code, administrativeArea, coordinates } of STATIONS) {
    let station = await Station.findOne({ code });
    if (!station) {
      station = await Station.create({ code, name: `Điểm lấy mẫu ${code}`, administrativeArea, location: { type: 'Point', coordinates } });
      stationsCreated++;
    }
    stations.set(code, station._id);
  }

  let created = 0, moved = 0, unchanged = 0, withoutWqi = 0;
  const differences: number[] = [];
  for (const sample of samples) {
    const stationId = stations.get(sample.station)!;
    const note = `AKH ${sample.round} · dòng Excel ${sample.row} · WQI trong file ${sample.fileWqi ?? '—'}${sample.provisional ? ' · ngày đo tạm gán theo đợt' : ''}`;
    const existing = await WaterRecord.findOne({ stationId, 'source.kind': 'excel', 'source.note': new RegExp(`^AKH ${sample.round} · `) });
    if (existing) {
      if (existing.measuredAt.getTime() === sample.measuredAt.getTime()) { unchanged++; continue; }
      await WaterRecord.updateOne({ _id: existing._id }, { $set: { measuredAt: sample.measuredAt, 'source.note': note }, $inc: { version: 1 } });
      moved++;
      continue;
    }
    const wqi = await deriveWqi(sample.parameters);
    if (wqi.wqi === null) withoutWqi++;
    else if (sample.fileWqi !== null) differences.push(Math.abs(wqi.wqi - sample.fileWqi));
    // Lecturer-supplied enterprise data: stored as already reviewed so it is public on the chart.
    await WaterRecord.create({
      stationId, measuredAt: sample.measuredAt, parameters: sample.parameters, unitBasis: PREDICTION_UNIT_BASIS, ...wqi,
      validationStatus: 'verified', reviewedBy: user._id, reviewedAt: new Date(), reviewNote: 'Số liệu doanh nghiệp do giảng viên cung cấp (file Excel AKH).',
      source: { kind: 'excel', note }, createdBy: user._id,
    });
    created++;
  }

  const rounds = [...new Set(samples.map(sample => sample.round))];
  console.log(JSON.stringify({
    database: mongoose.connection.name, year: YEAR, rounds: `${rounds[0]} … ${rounds[rounds.length - 1]} (${rounds.length})`,
    stations: { created: stationsCreated, existing: STATIONS.length - stationsCreated },
    records: { created, datesUpdated: moved, unchanged, withoutWqi },
    wqiModelVsFile: differences.length ? {
      compared: differences.length,
      meanAbsoluteDifference: +(differences.reduce((a, b) => a + b, 0) / differences.length).toFixed(1),
      within5Points: differences.filter(d => d <= 5).length,
    } : null,
    provisionalDates: samples.some(sample => sample.provisional),
  }, null, 2));
  if (stationsCreated) console.log('New stations use provisional coordinates from the sampling map; update them when the official ones arrive.');
}

try { await main(); }
catch (error) {
  // Do not print connection strings or database error objects.
  console.error(error instanceof Error && !/mongo/i.test(error.name) ? error.message : 'Import failed. Check that MongoDB is running and server/.env is configured.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
