import { Schema, model } from 'mongoose';
const schema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{2,40}$/ },
  name: { type: String, required: true, minlength: 2, maxlength: 160 },
  administrativeArea: { type: String, required: true, enum: ['Hải Dương', 'Hải Phòng'] },
  location: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true, validate: (c: number[]) => c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' });
schema.index({ location: '2dsphere' });
export const Station = model('Station', schema);
