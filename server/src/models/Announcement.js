import mongoose from 'mongoose';

export const ANNOUNCEMENT_TYPES = [
  'general',
  'academic',
  'exam',
  'event',
  'administrative',
  'emergency',
  'holiday',
  'finance',
];

export const ANNOUNCEMENT_PRIORITIES = ['normal', 'high', 'critical'];
export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'published', 'expired', 'archived'];

const recipientSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: '' },
  },
  { _id: false },
);

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    type: { type: String, enum: ANNOUNCEMENT_TYPES, default: 'general', index: true },
    priority: { type: String, enum: ANNOUNCEMENT_PRIORITIES, default: 'normal', index: true },
    audience: { type: String, enum: ['all', 'role', 'user'], default: 'all' },
    audienceRole: { type: String, enum: ['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT'], default: null },
    audienceUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ANNOUNCEMENT_STATUSES, default: 'draft', index: true },
    publishAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null },
    pinned: { type: Boolean, default: false },
    sendEmail: { type: Boolean, default: false },
    recipients: { type: [recipientSchema], default: [] },
    recipientCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
    emailSentCount: { type: Number, default: 0 },
    emailFailedCount: { type: Number, default: 0 },
    emailStatus: { type: String, enum: ['none', 'pending', 'sending', 'sent', 'partial', 'failed'], default: 'none' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    fanoutAt: { type: Date, default: null },
  },
  { timestamps: true },
);

announcementSchema.index({ status: 1, publishAt: 1 });
announcementSchema.index({ status: 1, expiresAt: 1 });
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ pinned: -1, publishedAt: -1 });

export const Announcement = mongoose.model('Announcement', announcementSchema);
