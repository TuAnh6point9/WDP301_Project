import { Schema, model } from 'mongoose';
const schema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], required: true, default: 'user' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' });
export const User = model('User', schema);
