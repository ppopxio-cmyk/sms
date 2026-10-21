import { Announcement } from '../models/Announcement.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { publishAnnouncement, audiencePreview, registrarAudienceAllowed } from '../services/announcement.service.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, paged, searchFilter, mergeFilters, sortOf, ownFilter } from '../services/registrar.helpers.js';

const ALLOWED_ROLES = new Set(['TEACHER', 'ACCOUNTANT']);

async function resolveRegistrarAudience(input) {
  if (input.audience === 'role') {
    if (!ALLOWED_ROLES.has(input.audienceRole)) {
      throw new AppError(400, 'AUDIENCE_NOT_ALLOWED', 'Registrar notices can be sent to all teachers or all accountants only.');
    }
    return { audience: 'role', audienceRole: input.audienceRole, audienceUser: null };
  }
  if (input.audience === 'user') {
    const email = String(input.audienceEmail || '').trim().toLowerCase();
    if (!email) throw new AppError(400, 'RECIPIENT_REQUIRED', 'Enter the email of one teacher or accountant.');
    const user = await User.findOne({ email, deletedAt: null, status: 'active' }).select('_id email role name').lean();
    if (!user) throw new AppError(400, 'RECIPIENT_NOT_FOUND', 'No active account matches that email.');
    if (!ALLOWED_ROLES.has(user.role)) {
      throw new AppError(400, 'RECIPIENT_NOT_ALLOWED', 'Choose a teacher or accountant. Registrar notices cannot be sent to administrators.');
    }
    return { audience: 'user', audienceRole: null, audienceUser: user._id };
  }
  throw new AppError(400, 'AUDIENCE_NOT_ALLOWED', 'Choose all teachers, all accountants, or one eligible account.');
}

function announcementView(row) {
  return {
    id: String(row._id),
    kind: row.kind,
    title: row.title,
    body: row.body,
    type: row.type,
    priority: row.priority,
    audience: row.audience,
    audienceRole: row.audienceRole,
    status: row.status,
    publishAt: row.publishAt,
    publishedAt: row.publishedAt,
    recipientCount: row.recipientCount,
    deliveredCount: row.deliveredCount,
    readCount: row.readCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    audiencePolicy: row.audiencePolicy,
  };
}

export const previewAudience = asyncHandler(async (req, res) => {
  const audience = await resolveRegistrarAudience(req.body ?? req.query);
  const preview = await audiencePreview(audience);
  res.json({
    count: preview.count,
    sample: preview.sample,
    message: audience.audience === 'role'
      ? `This will reach all active ${audience.audienceRole === 'TEACHER' ? 'teachers' : 'accountants'}.`
      : 'This will reach one named account.',
  });
});

export const listNotices = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const userId = req.user.id;
  const userRole = req.user.role;

  // Build the authorization filter: the user can see announcements where
  // 1. They are the author (createdBy)
  // 2. audience is 'all'
  // 3. audience is 'role' AND audienceRole matches their role
  // 4. audience is 'user' AND audienceUser is them
  const authFilter = ownFilter({
    $or: [
      { createdBy: userId },
      { audience: 'all' },
      { audience: 'role', audienceRole: userRole },
      { audience: 'user', audienceUser: userId },
    ],
  });

  // Additional filters
  const additionalFilters = mergeFilters(
    query.kind ? { kind: query.kind } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
    searchFilter(query.search, ['title', 'body']),
    query.author === 'mine' ? { createdBy: userId } : null,
    query.audienceRole ? { audienceRole: query.audienceRole } : null,
    query.from || query.to
      ? {
          createdAt: ownFilter({
            ...(query.from ? { $gte: new Date(query.from) } : {}),
            ...(query.to ? { $lte: new Date(query.to) } : {}),
          }),
        }
      : null,
  );

  const filter = mergeFilters(authFilter, additionalFilters);

  const [rows, total] = await Promise.all([
    Announcement.find(filter)
      .sort(sortOf(query, ['createdAt', 'updatedAt', 'publishAt', 'status'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Announcement.countDocuments(filter),
  ]);

  res.json({ ...paged(rows.map(announcementView), total, page, limit) });
});

export const getNotice = asyncHandler(async (req, res) => {
  const row = await Announcement.findOne({ _id: req.valid.params.id, createdBy: req.user.id }).lean();
  if (!row) throw new AppError(404, 'NOTICE_NOT_FOUND', 'That notice was not found.');
  res.json({ notice: announcementView(row) });
});

export const createNotice = asyncHandler(async (req, res) => {
  const input = req.body;
  const audience = await resolveRegistrarAudience(input);
  const when = input.scheduledFor ? new Date(input.scheduledFor) : null;
  if (when && when.getTime() < Date.now() - 60_000) {
    throw new AppError(400, 'SCHEDULE_IN_PAST', 'Choose a future date and time, or send it now.');
  }
  const row = await Announcement.create({
    title: input.title,
    body: input.body,
    type: input.type,
    priority: input.priority,
    kind: input.kind || 'announcement',
    audience: audience.audience,
    audienceRole: audience.audienceRole,
    audienceUser: audience.audienceUser,
    audiencePolicy: 'registrar-restricted',
    status: when ? 'scheduled' : 'draft',
    publishAt: when,
    sendEmail: false,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  if (!when) {
    if (!(await registrarAudienceAllowed(row))) {
      row.status = 'archived';
      await row.save();
      throw new AppError(400, 'AUDIENCE_NOT_ALLOWED', 'That audience is not permitted for a Registrar notice.');
    }
    const result = await publishAnnouncement(row._id, { userId: req.user.id });
    if (result.status !== 'published' && result.status !== 'already') {
      throw new AppError(409, 'NOTICE_NOT_PUBLISHED', 'The notice could not be published.');
    }
  }
  const saved = await Announcement.findById(row._id).lean();
  audit({
    req,
    action: when ? 'registrar.notice.schedule' : 'registrar.notice.publish',
    targetType: 'Announcement',
    targetId: row._id,
    meta: { kind: row.kind, audience: row.audience, audienceRole: row.audienceRole || null, scheduled: Boolean(when) },
  });
  res.status(201).json({ notice: announcementView(saved) });
});

export const updateNotice = asyncHandler(async (req, res) => {
  const row = await Announcement.findOne({ _id: req.valid.params.id, createdBy: req.user.id });
  if (!row) throw new AppError(404, 'NOTICE_NOT_FOUND', 'That notice was not found.');
  if (['published', 'expired', 'archived'].includes(row.status)) {
    throw new AppError(409, 'NOTICE_STATE', 'A published notice cannot be rewritten. Create a new notice instead.');
  }
  const input = req.body;
  const audience = await resolveRegistrarAudience(input);
  const when = input.scheduledFor ? new Date(input.scheduledFor) : null;
  row.title = input.title;
  row.body = input.body;
  row.type = input.type;
  row.priority = input.priority;
  row.audience = audience.audience;
  row.audienceRole = audience.audienceRole;
  row.audienceUser = audience.audienceUser;
  row.publishAt = when;
  row.status = when ? 'scheduled' : 'draft';
  row.updatedBy = req.user.id;
  await row.save();
  audit({ req, action: 'registrar.notice.update', targetType: 'Announcement', targetId: row._id });
  res.json({ notice: announcementView(row) });
});

export const publishNotice = asyncHandler(async (req, res) => {
  const row = await Announcement.findOne({ _id: req.valid.params.id, createdBy: req.user.id });
  if (!row) throw new AppError(404, 'NOTICE_NOT_FOUND', 'That notice was not found.');
  const result = await publishAnnouncement(row._id, { userId: req.user.id });
  if (result.status === 'invalid_audience') {
    throw new AppError(409, 'AUDIENCE_NOT_ALLOWED', 'The audience is no longer eligible. Choose recipients again.');
  }
  audit({ req, action: 'registrar.notice.publish', targetType: 'Announcement', targetId: row._id });
  res.json({ notice: announcementView(await Announcement.findById(row._id).lean()) });
});

export const archiveNotice = asyncHandler(async (req, res) => {
  const row = await Announcement.findOne({ _id: req.valid.params.id, createdBy: req.user.id });
  if (!row) throw new AppError(404, 'NOTICE_NOT_FOUND', 'That notice was not found.');
  row.status = 'archived';
  row.archivedAt = new Date();
  row.updatedBy = req.user.id;
  await row.save();
  audit({ req, action: 'registrar.notice.archive', targetType: 'Announcement', targetId: row._id });
  res.json({ notice: announcementView(row) });
});

export const notificationSummary = asyncHandler(async (_req, res) => {
  const [unread, total] = await Promise.all([
    Notification.countDocuments({ userId: _req.user.id, readAt: null }),
    Notification.countDocuments({ userId: _req.user.id }),
  ]);
  res.json({ unread, total });
});
