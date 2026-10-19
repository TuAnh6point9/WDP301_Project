import { Schema, model } from 'mongoose';
// Who did what and whether it worked; never request payloads, passwords or typed e-mail addresses.
const schema = new Schema({
  action: { type: String, required: true, maxlength: 60 },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  target: { type: String, default: null, maxlength: 300 },
  outcome: { type: String, enum: ['success', 'failure'], required: true },
  status: { type: Number, required: true },
  requestId: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
schema.index({ action: 1, createdAt: -1 });
export const AuditLog = model('AuditLog', schema);
