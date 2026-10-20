import { z } from 'zod';
import { ROLES } from '../config/roles.js';
import { ANNOUNCEMENT_PRIORITIES, ANNOUNCEMENT_STATUSES, ANNOUNCEMENT_TYPES } from '../models/Announcement.js';

const optionalEmail = z.union([z.literal(''), z.email().max(160)]).optional();
const optionalDate = z.union([z.iso.datetime(), z.null()]).optional();
const text = (max, label) => z.string().trim().min(1, `${label} is required.`).max(max);
const number = (min, max) => z.coerce.number().int().min(min).max(max);

const institution = z
  .object({
    name: text(120, 'Institution name').optional(),
    shortName: z.string().trim().max(40).optional(),
    email: optionalEmail,
    phone: z.string().trim().max(40).optional(),
    website: z.string().trim().max(160).optional(),
    address: z.string().trim().max(220).optional(),
    city: z.string().trim().max(80).optional(),
    region: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
    establishedYear: z.union([z.coerce.number().int().min(1800).max(2200), z.null()]).optional(),
    motto: z.string().trim().max(160).optional(),
  })
  .strict();

const security = z
  .object({
    idleMinutes: number(5, 1440).optional(),
    absoluteDays: number(1, 365).optional(),
    lockoutAttempts: number(3, 20).optional(),
    lockoutMinutes: number(1, 1440).optional(),
    minPasswordLength: number(8, 64).optional(),
    requireTwoStep: z.boolean().optional(),
    singleSession: z.boolean().optional(),
  })
  .strict();

const email = z
  .object({
    announcementEmails: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    replyTo: optionalEmail,
    footer: z.string().trim().max(300).optional(),
    batchSize: number(1, 100).optional(),
  })
  .strict();

const notifications = z
  .object({
    inApp: z.boolean().optional(),
    emailAnnouncements: z.boolean().optional(),
    dailyDigest: z.boolean().optional(),
    maintenanceAlerts: z.boolean().optional(),
  })
  .strict();

const localization = z
  .object({
    language: z.enum(['en', 'am']).optional(),
    calendar: z.enum(['ethiopian', 'gregorian']).optional(),
    timezone: z.string().trim().max(80).optional(),
    dateFormat: z.enum(['amharic', 'english']).optional(),
    weekStart: z.enum(['monday', 'sunday']).optional(),
    currency: z.string().trim().max(10).optional(),
  })
  .strict();

const system = z
  .object({
    schoolYear: z.string().trim().max(30).optional(),
    term: z.enum(['Term 1', 'Term 2', 'Semester 1', 'Semester 2']).optional(),
    timeFormat: z.enum(['24h', '12h']).optional(),
    maintenanceMessage: z.string().trim().max(500).optional(),
    maintenanceUntil: optionalDate,
    allowAdminRecovery: z.boolean().optional(),
  })
  .strict();

export const updateSettingsSchema = z
  .strictObject({
    institution: institution.optional(),
    security: security.optional(),
    email: email.optional(),
    notifications: notifications.optional(),
    localization: localization.optional(),
    system: system.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Choose at least one setting to save.');

export const maintenanceSchema = z.strictObject({
  enabled: z.boolean(),
  message: z.string().trim().min(10, 'Write a short message people will understand.').max(500).optional(),
  until: optionalDate,
  password: z.string().min(1, 'Confirm with your password.').max(128),
});

export const testEmailSchema = z.strictObject({});

// Create applies the defaults; update deliberately starts without them so a request
// that changes only the title does not also reset the audience and priority.
const announcementBase = z.strictObject({
  title: z.string().trim().min(3, 'Write a title of at least 3 characters.').max(160),
  body: z.string().trim().min(3, 'Write the announcement.').max(5000),
  type: z.enum(ANNOUNCEMENT_TYPES),
  priority: z.enum(ANNOUNCEMENT_PRIORITIES),
  audience: z.enum(['all', 'role', 'user']),
  audienceRole: z.enum(ROLES).optional(),
  audienceUser: z.string().regex(/^[a-f0-9]{24}$/i, 'Choose a valid person.').optional(),
  audienceEmail: z.email('Enter a valid email address.').max(254).optional(),
  publishAt: optionalDate,
  expiresAt: optionalDate,
  pinned: z.boolean(),
  sendEmail: z.boolean(),
});

export const createAnnouncementSchema = announcementBase
  .extend({
    intent: z.enum(['draft', 'schedule', 'publish']).default('draft'),
  })
  .partial({
    type: true,
    priority: true,
    audience: true,
    audienceRole: true,
    audienceUser: true,
    audienceEmail: true,
    publishAt: true,
    expiresAt: true,
    pinned: true,
    sendEmail: true,
  })
  .refine(
    (value) => value.audience !== 'role' || Boolean(value.audienceRole),
    { path: ['audienceRole'], message: 'Choose the role that should receive this.' },
  )
  .refine(
    (value) => value.audience !== 'user' || Boolean(value.audienceUser || value.audienceEmail),
    { path: ['audienceEmail'], message: 'Choose a person or enter their email.' },
  )
  .refine(
    (value) => value.intent !== 'schedule' || Boolean(value.publishAt),
    { path: ['publishAt'], message: 'Choose when this should be published.' },
  )
  .refine(
    (value) => !value.expiresAt || !value.publishAt || new Date(value.expiresAt) > new Date(value.publishAt),
    { path: ['expiresAt'], message: 'The expiry must be after the publish time.' },
  );

export const updateAnnouncementSchema = announcementBase
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Change something before saving.')
  .refine(
    (value) => !value.expiresAt || !value.publishAt || new Date(value.expiresAt) > new Date(value.publishAt),
    { path: ['expiresAt'], message: 'The expiry must be after the publish time.' },
  );

export const listAnnouncementsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', ...ANNOUNCEMENT_STATUSES]).default('all'),
  type: z.enum(['all', ...ANNOUNCEMENT_TYPES]).default('all'),
  priority: z.enum(['all', ...ANNOUNCEMENT_PRIORITIES]).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const audiencePreviewSchema = z.strictObject({
  audience: z.enum(['all', 'role', 'user']).default('all'),
  audienceRole: z.enum(ROLES).optional(),
  audienceUser: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  email: z.email().max(254).optional(),
});

export const exportAnnouncementsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', ...ANNOUNCEMENT_STATUSES]).default('all'),
  type: z.enum(['all', ...ANNOUNCEMENT_TYPES]).default('all'),
  priority: z.enum(['all', ...ANNOUNCEMENT_PRIORITIES]).default('all'),
  format: z.enum(['xlsx', 'docx', 'pdf']).default('xlsx'),
});

export const exportAnalyticsQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(7).max(90).default(30),
  format: z.enum(['xlsx', 'docx', 'pdf']).default('xlsx'),
});
