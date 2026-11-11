import { Router } from 'express';
import { Schema, model } from 'mongoose';
import { DEFAULT_QCVN_COLUMN, QCVN_CHOICES, USER_MESSAGES as M, settingsUpdateSchema, type SystemSettings } from '@wqi/contracts';
import { adminOnly } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { audited } from '../audit/audit.service.js';
import { AppError } from '../../utils/app-error.js';

// One document holds the system settings; until an admin saves, the defaults apply (version 0).
const schema = new Schema({
  key: { type: String, required: true, unique: true, enum: ['system'] },
  qcvnColumn: { type: String, required: true, enum: QCVN_CHOICES },
  version: { type: Number, required: true, min: 1 },
}, { timestamps: true, strict: 'throw' });
export const Setting = model('Setting', schema);

type Stored = { qcvnColumn: string; version: number; updatedAt?: Date } | null;
const view = (doc: Stored): SystemSettings => ({
  qcvnColumn: (doc?.qcvnColumn ?? DEFAULT_QCVN_COLUMN) as SystemSettings['qcvnColumn'], version: doc?.version ?? 0, updatedAt: doc?.updatedAt?.toISOString() ?? null,
});

export const settingsRouter = Router();
// Public: every chart reads the QCVN column its limit lines follow.
settingsRouter.get('/', async (_req, res) => {
  res.json({ data: view(await Setting.findOne({ key: 'system' }).lean<Stored>()) });
});
settingsRouter.patch('/', adminOnly, audited('settings.update'), validate(settingsUpdateSchema), async (req, res) => {
  const { qcvnColumn, version } = req.body as { qcvnColumn: string; version: number };
  res.locals.auditTarget = `qcvnColumn:${qcvnColumn}`;
  let saved: Stored;
  try {
    saved = version === 0
      ? (await Setting.create({ key: 'system', qcvnColumn, version: 1 })).toObject()
      : await Setting.findOneAndUpdate({ key: 'system', version }, { $set: { qcvnColumn }, $inc: { version: 1 } }, { new: true }).lean<Stored>();
  } catch (error) {
    // Another admin created the document first.
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) saved = null;
    else throw error;
  }
  if (!saved) throw new AppError(409, 'RECORD_CHANGED', M.RECORD_CHANGED);
  res.json({ data: view(saved) });
});
