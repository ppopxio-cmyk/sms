import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: 'Ethiopian College' },
    shortName: { type: String, trim: true, maxlength: 40, default: 'EC' },
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    website: { type: String, trim: true, maxlength: 160, default: '' },
    address: { type: String, trim: true, maxlength: 220, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: 'Addis Ababa' },
    region: { type: String, trim: true, maxlength: 80, default: '' },
    country: { type: String, trim: true, maxlength: 80, default: 'Ethiopia' },
    establishedYear: { type: Number, min: 1800, max: 2200, default: null },
    motto: { type: String, trim: true, maxlength: 160, default: '' },
    logoUrl: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '#4f46e5' },
    facebook: { type: String, trim: true, default: '' },
    telegram: { type: String, trim: true, default: '' },
    youtube: { type: String, trim: true, default: '' },
    instagram: { type: String, trim: true, default: '' },
    admissionsEmail: { type: String, trim: true, lowercase: true, default: '' },
    admissionsPhone: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const securitySchema = new mongoose.Schema(
  {
    idleMinutes: { type: Number, min: 5, max: 2880, default: 2880 },
    absoluteDays: { type: Number, min: 1, max: 365, default: 30 },
    lockoutAttempts: { type: Number, min: 3, max: 20, default: 3 },
    lockoutMinutes: { type: Number, min: 1, max: 1440, default: 15 },
    minPasswordLength: { type: Number, min: 8, max: 64, default: 8 },
    requireTwoStep: { type: Boolean, default: false },
    singleSession: { type: Boolean, default: false },
  },
  { _id: false },
);

const emailSchema = new mongoose.Schema(
  {
    announcementEmails: { type: Boolean, default: true },
    securityAlerts: { type: Boolean, default: true },
    replyTo: { type: String, trim: true, lowercase: true, maxlength: 160, default: '' },
    footer: { type: String, trim: true, maxlength: 300, default: 'Ethiopian College Management System' },
    batchSize: { type: Number, min: 1, max: 100, default: 25 },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    inApp: { type: Boolean, default: true },
    emailAnnouncements: { type: Boolean, default: false },
    dailyDigest: { type: Boolean, default: false },
    maintenanceAlerts: { type: Boolean, default: true },
  },
  { _id: false },
);

const localizationSchema = new mongoose.Schema(
  {
    language: { type: String, enum: ['en', 'am'], default: 'en' },
    calendar: { type: String, enum: ['ethiopian', 'gregorian'], default: 'ethiopian' },
    timezone: { type: String, default: 'Africa/Addis_Ababa' },
    dateFormat: { type: String, enum: ['amharic', 'english'], default: 'amharic' },
    weekStart: { type: String, enum: ['monday', 'sunday'], default: 'monday' },
    currency: { type: String, default: 'ETB' },
  },
  { _id: false },
);

const systemSchema = new mongoose.Schema(
  {
    schoolYear: { type: String, trim: true, maxlength: 30, default: '2019 EC' },
    term: { type: String, enum: ['Term 1', 'Term 2', 'Semester 1', 'Semester 2'], default: 'Term 1' },
    timeFormat: { type: String, enum: ['24h', '12h'], default: '24h' },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      trim: true,
      maxlength: 500,
      default: 'The college portal is being updated. Please try again shortly.',
    },
    maintenanceUntil: { type: Date, default: null },
    allowAdminRecovery: { type: Boolean, default: true },
  },
  { _id: false },
);

const financeSchema = new mongoose.Schema(
  {
    defaultBank: {
      bank: { type: String, trim: true, default: 'Commercial Bank of Ethiopia' },
      accountNumber: { type: String, trim: true, default: '1000123456789' },
      holderName: { type: String, trim: true, default: 'HARAMAYA HEALTH SCIENCE COLLEGE' },
    },
    graceDays: { type: Number, min: 0, max: 90, default: 0 },
    reminders: {
      daysBefore: { type: [Number], default: [3, 1, 0] },
      notifyTeachersOnOverdue: { type: Boolean, default: true },
    },
    enforcement: {
      blockAssessments: { type: Boolean, default: true },
      blockTeacherResults: { type: Boolean, default: true },
      blockDocuments: { type: Boolean, default: true },
      blockGraduation: { type: Boolean, default: true },
      blockRegistration: { type: Boolean, default: false },
      blockProgression: { type: Boolean, default: false },
      blockPublishing: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global', immutable: true },
    institution: { type: institutionSchema, default: () => ({}) },
    security: { type: securitySchema, default: () => ({}) },
    email: { type: emailSchema, default: () => ({}) },
    notifications: { type: notificationSchema, default: () => ({}) },
    localization: { type: localizationSchema, default: () => ({}) },
    system: { type: systemSchema, default: () => ({}) },
    finance: { type: financeSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    maintenanceUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    maintenanceChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SystemSetting = mongoose.model('SystemSetting', settingSchema);
