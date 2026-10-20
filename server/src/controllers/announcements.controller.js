import { Announcement } from '../models/Announcement.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { audit } from '../services/audit.service.js';
import {
  audiencePreview,
  expireAnnouncements,
  publishAnnouncement,
} from '../services/announcement.service.js';

const withAudience = (row) => ({
  ...row,
  audienceUser: row.audienceUser
    ? {
        id: row.audienceUser._id ?? row.audienceUser,
        name: row.audienceUser.name ?? '',
        email: row.audienceUser.email ?? '',
        role: row.audienceUser.role ?? '',
      }
    : null,
  readRate: row.recipientCount ? Math.round((row.readCount / row.recipientCount) * 100) : 0,
  deliveryRate: row.recipientCount ? Math.round((row.deliveredCount / row.recipientCount) * 100) : 0,
});

const listRow = (row) => {
  const { _id, ...data } = withAudience(row);
  delete data.recipients;
  return { ...data, id: String(_id ?? row.id) };
};

function audienceFields(input, existing = {}) {
  const audience = input.audience ?? existing.audience ?? 'all';
  const fields = {
    audience,
    audienceRole: null,
    audienceUser: null,
  };
  if (audience === 'role') fields.audienceRole = input.audienceRole ?? existing.audienceRole ?? null;
  if (audience === 'user') fields.audienceUser = input.audienceUser ?? existing.audienceUser ?? null;
  return fields;
}

async function resolveAudienceUser(input, existing = null) {
  const audience = input.audience ?? existing?.audience ?? 'all';
  if (audience !== 'user') return null;
  const id = input.audienceUser || existing?.audienceUser;
  const email = String(input.audienceEmail || '').trim().toLowerCase();

  if (email) {
    const user = await User.findOne({ email, deletedAt: null }).select('_id name email role').lean();
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'No active account uses that email address.');
    return user._id;
  }
  if (!id) throw new AppError(400, 'AUDIENCE_USER_REQUIRED', 'Choose a person for a single-user announcement.');

  const user = await User.findOne({ _id: id, deletedAt: null }).select('_id').lean();
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'That account was not found.');
  return user._id;
}

function createData(body, audienceUser) {
  return {
    title: body.title,
    body: body.body,
    type: body.type ?? 'general',
    priority: body.priority ?? 'normal',
    ...audienceFields(body),
    audienceUser,
    publishAt: body.publishAt ? new Date(body.publishAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    pinned: Boolean(body.pinned),
    sendEmail: Boolean(body.sendEmail),
    status: 'draft',
  };
}

export const listAnnouncements = asyncHandler(async (req, res) => {
  await expireAnnouncements();
  const { search, status, type, priority, page, limit } = req.valid.query;

  const filter = {};
  if (status !== 'all') filter.status = status;
  if (type !== 'all') filter.type = type;
  if (priority !== 'all') filter.priority = priority;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { body: rx }];
  }

  const countBase = {};
  if (type !== 'all') countBase.type = type;
  if (priority !== 'all') countBase.priority = priority;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    countBase.$or = [{ title: rx }, { body: rx }];
  }

  const [rows, totalRows, statusRows, allCount] = await Promise.all([
    Announcement.find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('audienceUser', 'name email role')
      .lean(),
    Announcement.countDocuments(filter),
    Announcement.aggregate([{ $match: countBase }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Announcement.countDocuments({}),
  ]);

  const byStatus = { draft: 0, scheduled: 0, published: 0, expired: 0, archived: 0 };
  for (const row of statusRows) {
    if (row._id && byStatus[row._id] !== undefined) byStatus[row._id] = row.count;
  }
  const visible = Object.values(byStatus).reduce((sum, value) => sum + value, 0);

  const total = totalRows;
  res.json({
    announcements: rows.map(listRow),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: { all: visible, byStatus, everyAnnouncement: allCount },
  });
});

export const getAnnouncement = asyncHandler(async (req, res) => {
  const doc = await Announcement.findById(req.valid.params.id)
    .populate('audienceUser', 'name email role')
    .populate('createdBy', 'name email role')
    .populate('recipients.user', 'name email role')
    .lean();
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'That announcement was not found.');

  const recipients = (doc.recipients ?? []).slice(0, 25).map((row) => ({
    id: row.user?._id ?? row.user,
    name: row.user?.name ?? '',
    email: row.user?.email ?? '',
    role: row.user?.role ?? '',
    deliveredAt: row.deliveredAt,
    readAt: row.readAt,
    emailSentAt: row.emailSentAt,
  }));

  const data = withAudience(doc);
  delete data.recipients;
  res.json({ announcement: { ...data, recipients } });
});

export const previewAudience = asyncHandler(async (req, res) => {
  const { audience, audienceRole, audienceUser, email } = req.valid.query;
  let userId = audienceUser;
  let user = null;

  if (audience === 'user' && email) {
    user = await User.findOne({ email: String(email).toLowerCase(), deletedAt: null })
      .select('_id name email role status')
      .lean();
    if (!user) {
      return res.json({ count: 0, sample: [], message: 'No account uses that email address.' });
    }
    if (user.status !== 'active') {
      return res.json({
        count: 0,
        sample: [{ id: user._id, name: user.name, email: user.email, role: user.role }],
        message: 'That account is not active, so it cannot receive an in-app announcement.',
      });
    }
    userId = user._id;
  }

  const result = await audiencePreview({ audience, audienceRole, audienceUser: userId });
  res.json({
    ...result,
    message: result.count === 0 ? 'Nobody matches this audience right now.' : null,
  });
});

export const createAnnouncement = asyncHandler(async (req, res) => {
  const body = req.body;
  const audienceUser = await resolveAudienceUser(body);
  const data = createData(body, audienceUser);
  const intent = body.intent ?? 'draft';

  if (intent === 'schedule') {
    data.status = 'scheduled';
    if (!data.publishAt) data.publishAt = new Date();
  }

  const doc = await Announcement.create({ ...data, createdBy: req.user.id, updatedBy: req.user.id });
  let message = 'Announcement saved as a draft.';

  if (intent === 'publish' || (intent === 'schedule' && data.publishAt <= new Date())) {
    const result = await publishAnnouncement(doc._id, { userId: req.user.id });
    if (result.status === 'published') {
      message = 'Announcement published and delivered in-app.';
    } else {
      message = 'Announcement saved, but it could not be published. Open it and try Publish again.';
    }
  } else if (intent === 'schedule') {
    message = 'Announcement scheduled. It will be published automatically at the chosen time.';
  }

  audit({
    req,
    action: 'admin.announcement_created',
    targetType: 'announcement',
    targetId: doc._id,
    meta: {
      status: intent === 'publish' ? 'published' : intent === 'schedule' ? 'scheduled' : 'draft',
      priority: doc.priority,
      type: doc.type,
      audience: doc.audience,
      sendEmail: doc.sendEmail,
    },
  });

  const fresh = await Announcement.findById(doc._id).populate('audienceUser', 'name email role').lean();
  res.status(201).json({ announcement: listRow(fresh), message });
});

export const updateAnnouncement = asyncHandler(async (req, res) => {
  const doc = await Announcement.findById(req.valid.params.id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'That announcement was not found.');
  if (doc.status === 'archived') {
    throw new AppError(400, 'ARCHIVED', 'An archived announcement cannot be edited.');
  }

  const body = req.body;
  const nextAudience = body.audience ?? doc.audience;
  if (doc.status === 'published' && nextAudience !== doc.audience) {
    throw new AppError(400, 'PUBLISHED_AUDIENCE', 'The audience cannot change after an announcement is published.');
  }

  const audienceUser =
    body.audience !== undefined || body.audienceUser !== undefined || body.audienceEmail !== undefined
      ? await resolveAudienceUser(body, doc)
      : doc.audienceUser;

  const fields = ['title', 'body', 'type', 'priority', 'pinned', 'sendEmail'];
  for (const field of fields) {
    if (body[field] !== undefined) doc[field] = body[field];
  }
  if (body.publishAt !== undefined) doc.publishAt = body.publishAt ? new Date(body.publishAt) : null;
  if (body.expiresAt !== undefined) doc.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.audience !== undefined) Object.assign(doc, audienceFields(body, doc));
  if (doc.audience === 'user') doc.audienceUser = audienceUser;
  if (doc.audience !== 'user') doc.audienceUser = null;
  doc.updatedBy = req.user.id;

  // A scheduled announcement whose time moved into the past is published now rather
  // than quietly missing its slot.
  if (doc.status === 'scheduled' && doc.publishAt && doc.publishAt <= new Date()) {
    await doc.save();
    await publishAnnouncement(doc._id, { userId: req.user.id });
    audit({ req, action: 'admin.announcement_published', targetType: 'announcement', targetId: doc._id, meta: { scheduled: true } });
    const fresh = await Announcement.findById(doc._id).populate('audienceUser', 'name email role').lean();
    return res.json({ announcement: listRow(fresh), message: 'The scheduled time had passed, so it was published now.' });
  }

  await doc.save();
  audit({ req, action: 'admin.announcement_updated', targetType: 'announcement', targetId: doc._id, meta: { fields: Object.keys(body) } });
  const fresh = await Announcement.findById(doc._id).populate('audienceUser', 'name email role').lean();
  res.json({ announcement: listRow(fresh), message: 'Announcement saved.' });
});

export const publish = asyncHandler(async (req, res) => {
  const result = await publishAnnouncement(req.valid.params.id, { userId: req.user.id });
  if (result.status === 'missing') throw new AppError(404, 'NOT_FOUND', 'That announcement was not found.');
  if (result.status === 'archived') throw new AppError(400, 'ARCHIVED', 'An archived announcement cannot be published.');
  if (result.status === 'expired') throw new AppError(400, 'EXPIRED', 'That announcement has expired. Change its expiry before publishing.');

  if (result.status === 'published') {
    audit({
      req,
      action: 'admin.announcement_published',
      targetType: 'announcement',
      targetId: result.announcement._id,
      meta: { recipients: result.announcement.recipientCount, sendEmail: result.announcement.sendEmail },
    });
  }
  const fresh = await Announcement.findById(req.valid.params.id).populate('audienceUser', 'name email role').lean();
  res.json({
    announcement: listRow(fresh),
    message:
      result.status === 'published'
        ? `Published and delivered to ${fresh.recipientCount} ${fresh.recipientCount === 1 ? 'person' : 'people'}.`
        : 'This announcement was already published.',
  });
});

export const archive = asyncHandler(async (req, res) => {
  const doc = await Announcement.findById(req.valid.params.id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'That announcement was not found.');
  if (doc.status === 'archived') return res.json({ announcement: listRow(doc.toObject()), message: 'It was already archived.' });

  doc.status = 'archived';
  doc.archivedAt = new Date();
  doc.updatedBy = req.user.id;
  await doc.save();
  audit({ req, action: 'admin.announcement_archived', targetType: 'announcement', targetId: doc._id });
  res.json({ announcement: listRow(doc.toObject()), message: 'Announcement archived. It stays in the record.' });
});

export const duplicate = asyncHandler(async (req, res) => {
  const source = await Announcement.findById(req.valid.params.id).lean();
  if (!source) throw new AppError(404, 'NOT_FOUND', 'That announcement was not found.');

  const copy = await Announcement.create({
    title: `${source.title} (copy)`.slice(0, 160),
    body: source.body,
    type: source.type,
    priority: source.priority,
    audience: source.audience,
    audienceRole: source.audienceRole,
    audienceUser: source.audienceUser,
    expiresAt: source.expiresAt,
    pinned: false,
    sendEmail: source.sendEmail,
    status: 'draft',
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  audit({ req, action: 'admin.announcement_duplicated', targetType: 'announcement', targetId: copy._id, meta: { source: String(source._id) } });
  const fresh = await Announcement.findById(copy._id).populate('audienceUser', 'name email role').lean();
  res.status(201).json({ announcement: listRow(fresh), message: 'A draft copy is ready to edit.' });
});
