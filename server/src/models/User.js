import mongoose from 'mongoose';
import { ROLES } from '../config/roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'TEACHER', index: true },
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
    emailVerified: { type: Boolean, default: false },
    twoStepEnabled: { type: Boolean, default: false },
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    lastLoginAt: Date,
    passwordChangedAt: Date,
    // Set when an administrator creates the account or hands out a temporary
    // password. The person must choose their own password before anything else.
    mustChangePassword: { type: Boolean, default: false },
    // Soft delete: the account stops working but the audit trail keeps its history.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
