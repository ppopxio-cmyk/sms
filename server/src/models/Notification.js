import mongoose from 'mongoose';
import { env } from '../config/env.js';

// One row per event per person, so the bell can show a real count and every person
// can clear their own history. Rows delete themselves after NOTIFICATION_TTL_DAYS.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 300 },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NOTIFICATION_TTL_MS = env.NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000;

export const Notification = mongoose.model('Notification', notificationSchema);
