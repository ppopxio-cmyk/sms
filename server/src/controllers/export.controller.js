import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AuditLog } from '../models/AuditLog.js';
import { Announcement } from '../models/Announcement.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { formatEthiopianAmharic } from '../utils/ethiopianDate.js';
import { audit } from '../services/audit.service.js';
import { auditCategory, auditCategoryFilter } from '../services/auditCategory.service.js';
import { buildExport, EXPORT_LIMIT } from '../services/export.service.js';
import { after, atOrAfter, oneOf } from '../utils/mongo.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_MS = 2 * 60 * 1000;

const ROLE_LABEL = {
  ADMIN: 'አስተዳዳሪ',
  REGISTRAR: 'መዝጋቢ',
  TEACHER: 'መምህር',
  ACCOUNTANT: 'ሒሳብ ባለሙያ',
};

const USER_STATUS_LABEL = {
  pending: 'በመጠባበቅ ላይ',
  active: 'ንቁ',
  disabled: 'ተሰናክሏል',
};

const SESSION_STATE_LABEL = {
  online: 'መስመር ላይ',
  away: 'ርቆ',
  expired: 'ጊዜው አልፏል',
  terminated: 'ተጠናቋል',
};

const CATEGORY_LABEL = {
  signin: 'መግቢያ',
  security: 'ደህንነት',
  admin: 'አስተዳደር',
  settings: 'ቅንብሮች',
  announcements: 'ማስታወቂያዎች',
  maintenance: 'ጥገና',
  account: 'መለያ',
  export: 'ማውጣት',
  other: 'ሌላ',
};

const ACTION_LABEL = {
  'auth.login': 'መግቢያ',
  'auth.login_failed': 'ያልተሳካ መግቢያ',
  'auth.login_not_set_up': 'መለያ ያልተዘጋጀ መግቢያ',
  'auth.logout': 'መውጣት',
  'auth.email_verified': 'ኢሜይል ተረጋግጧል',
  'auth.account_setup': 'መለያ ተዘጋጅቷል',
  'auth.password_change_failed': 'የይለፍ ቃል ለውጥ አልተሳካም',
  'auth.password_changed': 'የይለፍ ቃል ተቀይሯል',
  'auth.password_reset_requested': 'የይለፍ ቃል መቀየር ተጠይቋል',
  'auth.password_reset_done': 'የይለፍ ቃል ተቀይሯል',
  'auth.account_delete_failed': 'መለያ ማጥፋት አልተሳካም',
  'auth.account_delete_code_sent': 'የመለያ ማጥፊያ ኮድ ተልኳል',
  'auth.account_deleted': 'መለያ ጠፍቷል',
  'auth.device_named': 'መሣሪያ ተሰይሟል',
  'auth.session_signout_code_sent': 'የመውጫ ኮድ ተልኳል',
  'auth.session_signed_out': 'ከመሣሪያ ወጥቷል',
  'auth.refresh_reuse': 'የተደገመ የመግቢያ ሙከራ',
  'admin.confirm_failed': 'የአስተዳዳሪ ማረጋገጫ አልተሳካም',
  'admin.user_created': 'ተጠቃሚ ተፈጥሯል',
  'admin.user_disabled': 'ተጠቃሚ ተሰናክሏል',
  'admin.user_enabled': 'ተጠቃሚ ነቅቷል',
  'admin.user_verify_link_resent': 'የማረጋገጫ አገናኝ እንደገና ተልኳል',
  'admin.user_reset_link_sent': 'የይለፍ ቃል ማስተካከያ አገናኝ ተልኳል',
  'admin.user_signed_out': 'ተጠቃሚው ከሁሉም መሣሪያ ወጥቷል',
  'admin.user_removed': 'ተጠቃሚ ተወግዷል',
  'admin.session_terminated': 'ክፍለ ጊዜ ተጠናቋል',
  'admin.settings_updated': 'ቅንብሮች ተቀይረዋል',
  'admin.settings_email_test': 'የኢሜይል ሙከራ',
  'admin.maintenance_enabled': 'ጥገና ተጀምሯል',
  'admin.maintenance_disabled': 'ጥገና ተጠናቋል',
  'admin.announcement_created': 'ማስታወቂያ ተፈጥሯል',
  'admin.announcement_updated': 'ማስታወቂያ ተቀይሯል',
  'admin.announcement_published': 'ማስታወቂያ ታውቋል',
  'admin.announcement_archived': 'ማስታወቂያ ተመዝግቧል',
  'admin.announcement_duplicated': 'ማስታወቂያ ተቀድቷል',
  'user.push_subscribed': 'ማሳወቂያ ተከፍቷል',
  'user.push_unsubscribed': 'ማሳወቂያ ተዘግቷል',
  'export.users': 'የተጠቃሚዎች ማውጣት',
  'export.sessions': 'የክፍለ ጊዜዎች ማውጣት',
  'export.audit_logs': 'የኦዲት መዝገብ ማውጣት',
  'export.announcements': 'የማስታወቂያ ማውጣት',
  'export.system_analytics': 'የስርዓት ትንተና ማውጣት',
};

const TARGET_TYPE_LABEL = {
  user: 'ተጠቃሚ',
  session: 'ክፍለ ጊዜ',
  settings: 'ቅንብሮች',
  announcement: 'ማስታወቂያ',
  export: 'ማውጣት',
  notification: 'ማሳወቂያ',
};

const actionLabel = (action) => ACTION_LABEL[action] || action;

const stateFilter = {
  active: { state: { $in: ['online', 'away'] } },
  online: { state: 'online' },
  away: { state: 'away' },
  expired: { state: 'expired' },
  terminated: { state: 'terminated' },
};

const sessionStateExpression = {
  $switch: {
    branches: [
      { case: { $eq: ['$status', 'revoked'] }, then: 'terminated' },
      { case: { $lte: ['$expiresAt', '$$NOW'] }, then: 'expired' },
      {
        case: { $gte: ['$lastSeenAt', { $subtract: ['$$NOW', ONLINE_MS] }] },
        then: 'online',
      },
    ],
    default: 'away',
  },
};

function sessionBase(search) {
  const pipeline = [
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $addFields: { state: sessionStateExpression } },
  ];

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    pipeline.push({
      $match: {
        $or: [
          { 'user.name': rx },
          { 'user.email': rx },
          { ip: rx },
          { browser: rx },
          { os: rx },
          { deviceName: rx },
          { deviceLabel: rx },
          { location: rx },
        ],
      },
    });
  }

  return pipeline;
}

const filterLine = (...parts) => parts.filter(Boolean).join('   ·   ');

const truncationNote = (label, total, shown) =>
  total > shown
    ? `ከ${total.toLocaleString('en-US')} ከሚመሳሰሉ ${label} ውስጥ የመጀመሪያዎቹ ${shown.toLocaleString('en-US')} ብቻ ተካተዋል። ቀሪውን ለማውጣት ማጣሪያውን ያጥብቁ።`
    : null;

function deviceLabel(session) {
  return (
    session.deviceLabel ||
    session.deviceName ||
    [session.browser, session.os].filter(Boolean).join(' · ') ||
    'ያልታወቀ መሣሪያ'
  );
}

const auditedExport = (action, resource, handler) =>
  asyncHandler(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      audit({
        req,
        action,
        status: 'fail',
        targetType: 'export',
        meta: { resource, format: req.valid.query.format, filters: req.valid.query },
      });
      throw err;
    }
  });

async function deliver(req, res, { action, meta, result }) {
  audit({
    req,
    action,
    targetType: 'export',
    meta: {
      ...meta,
      format: result.format,
      rows: result.rowCount,
      truncated: Boolean(meta.truncated),
    },
  });

  res.status(200);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('X-Export-Rows', String(result.rowCount));
  res.setHeader('Cache-Control', 'no-store');
  res.send(result.buffer);
}

export const exportUsers = auditedExport('export.users', 'users', async (req, res) => {
  const { search, role, status, sort, dir, format } = req.valid.query;
  const filter = { deletedAt: null };
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ [sort]: dir === 'asc' ? 1 : -1 })
      .limit(EXPORT_LIMIT + 1)
      .lean(),
    User.countDocuments(filter),
  ]);

  const truncated = users.length > EXPORT_LIMIT;
  const selected = users.slice(0, EXPORT_LIMIT);
  const now = new Date();

  const rows = selected.map((user) => ({
    name: user.name || 'ማዋቀሪያ በመጠባበቅ ላይ',
    email: user.email || '',
    role: ROLE_LABEL[user.role] || user.role,
    status: USER_STATUS_LABEL[user.status] || user.status,
    verified: user.emailVerified ? 'አዎ' : 'አይ',
    twoStep: user.twoStepEnabled ? 'በርቷል' : 'ጠፍቷል',
    locked: user.lockUntil && new Date(user.lockUntil).getTime() > now.getTime() ? 'አዎ' : 'አይ',
    lastLogin: formatEthiopianAmharic(user.lastLoginAt, { time: true }),
    created: formatEthiopianAmharic(user.createdAt),
  }));

  const subtitle =
    filterLine(
      search ? `ፍለጋ፡ "${search}"` : null,
      role ? `ሚና፡ ${ROLE_LABEL[role] || role}` : null,
      status ? `ሁኔታ፡ ${USER_STATUS_LABEL[status] || status}` : null,
    ) || 'ሁሉም መለያዎች';

  const note = truncationNote('መለያዎች', total, rows.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'accounts',
    title: 'የተጠቃሚ መለያዎች',
    subtitle,
    summary: [
      { label: 'የሚመሳሰሉ መለያዎች', value: total.toLocaleString('en-US') },
      { label: 'በፋይሉ ውስጥ ያሉ ረድፎች', value: rows.length.toLocaleString('en-US') },
    ],
    note,
    columns: [
      { key: 'name', header: 'ስም', width: 26 },
      { key: 'email', header: 'ኢሜይል', width: 30 },
      { key: 'role', header: 'ሚና', width: 16 },
      { key: 'status', header: 'ሁኔታ', width: 14 },
      { key: 'verified', header: 'ኢሜይል ተረጋግጧል', width: 18 },
      { key: 'twoStep', header: 'ሁለት ደረጃ', width: 14 },
      { key: 'locked', header: 'ተቆልፏል', width: 12 },
      { key: 'lastLogin', header: 'የመጨረሻ መግቢያ', width: 23 },
      { key: 'created', header: 'የተጨመረበት', width: 18 },
    ],
    rows,
  });

  await deliver(req, res, {
    action: 'export.users',
    meta: { resource: 'users', filters: { search, role, status, sort, dir }, truncated },
    result: file,
  });
});

export const exportSessions = auditedExport('export.sessions', 'sessions', async (req, res) => {
  const { search, role, status, format } = req.valid.query;
  const base = sessionBase(search);
  const roleStages = role ? [{ $match: { 'user.role': role } }] : [];
  const wanted = status !== 'all' ? [{ $match: stateFilter[status] }] : [];

  const [rows, totalRows, stateRows] = await Promise.all([
    Session.aggregate([
      ...base,
      ...roleStages,
      ...wanted,
      { $sort: { lastSeenAt: -1, _id: -1 } },
      { $limit: EXPORT_LIMIT + 1 },
    ]),
    Session.aggregate([...base, ...roleStages, ...wanted, { $count: 'total' }]),
    Session.aggregate([...base, ...roleStages, { $group: { _id: '$state', count: { $sum: 1 } } }]),
  ]);

  const total = totalRows[0]?.total ?? 0;
  const truncated = rows.length > EXPORT_LIMIT;
  const selected = rows.slice(0, EXPORT_LIMIT);

  const stateCounts = { online: 0, away: 0, expired: 0, terminated: 0 };
  for (const row of stateRows) {
    if (row._id && stateCounts[row._id] !== undefined) stateCounts[row._id] = row.count;
  }

  const records = selected.map((session) => ({
    name: session.user?.name || 'ማዋቀሪያ በመጠባበቅ ላይ',
    email: session.user?.email || '',
    role: ROLE_LABEL[session.user?.role] || session.user?.role || '',
    state: SESSION_STATE_LABEL[session.state] || session.state,
    device: deviceLabel(session),
    ip: session.ip || '—',
    place: session.location || 'ያልታወቀ',
    lastActive: formatEthiopianAmharic(session.lastSeenAt, { time: true }),
    started: formatEthiopianAmharic(session.createdAt),
    ended: session.revokedAt ? formatEthiopianAmharic(session.revokedAt, { time: true }) : '',
  }));

  const subtitle =
    filterLine(
      search ? `ፍለጋ፡ "${search}"` : null,
      role ? `ሚና፡ ${ROLE_LABEL[role] || role}` : null,
      status !== 'all' ? `ሁኔታ፡ ${SESSION_STATE_LABEL[status] || status}` : null,
    ) || 'ሁሉም ክፍለ ጊዜዎች';

  const note = truncationNote('ክፍለ ጊዜዎች', total, records.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'sessions',
    title: 'የመግቢያ ክፍለ ጊዜዎች',
    subtitle,
    summary: [
      { label: 'የሚመሳሰሉ ክፍለ ጊዜዎች', value: total.toLocaleString('en-US') },
      { label: 'በፋይሉ ውስጥ ያሉ ረድፎች', value: records.length.toLocaleString('en-US') },
      { label: 'መስመር ላይ', value: stateCounts.online.toLocaleString('en-US') },
      { label: 'ርቀው', value: stateCounts.away.toLocaleString('en-US') },
      {
        label: 'የተጠናቀቁ ወይም ጊዜያቸው ያለፈ',
        value: (stateCounts.expired + stateCounts.terminated).toLocaleString('en-US'),
      },
    ],
    note,
    columns: [
      { key: 'name', header: 'ሰው', width: 22 },
      { key: 'email', header: 'ኢሜይል', width: 27 },
      { key: 'role', header: 'ሚና', width: 14 },
      { key: 'state', header: 'ሁኔታ', width: 12 },
      { key: 'device', header: 'መሣሪያ', width: 24 },
      { key: 'ip', header: 'IP አድራሻ', width: 17 },
      { key: 'place', header: 'ቦታ', width: 20 },
      { key: 'lastActive', header: 'የመጨረሻ እንቅስቃሴ', width: 22 },
      { key: 'started', header: 'የጀመረበት', width: 19 },
      { key: 'ended', header: 'የተጠናቀቀበት', width: 22 },
    ],
    rows: records,
  });

  await deliver(req, res, {
    action: 'export.sessions',
    meta: { resource: 'sessions', filters: { search, role, status }, truncated },
    result: file,
  });
});

export const exportAuditLogs = auditedExport('export.audit_logs', 'audit_logs', async (req, res) => {
  const { search, category, status, range, format } = req.valid.query;
  const now = new Date();
  const since = range === 'all' ? null : new Date(now.getTime() - Number(range) * DAY_MS);

  const criteria = { ...auditCategoryFilter(category) };
  if (since) criteria.createdAt = atOrAfter(since);

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const actors = await User.find({ $or: [{ name: rx }, { email: rx }] })
      .select('_id')
      .limit(2000)
      .lean();

    criteria.$or = [
      { action: rx },
      { targetType: rx },
      { targetId: rx },
      { ip: rx },
      ...(actors.length ? [{ actorId: oneOf(actors.map((actor) => actor._id)) }] : []),
    ];
  }

  const failureCriteria = { ...criteria, status: 'fail' };
  if (status !== 'all') criteria.status = status;

  const [logs, total, failures] = await Promise.all([
    AuditLog.find(criteria)
      .sort({ createdAt: -1, _id: -1 })
      .limit(EXPORT_LIMIT + 1)
      .populate('actorId', 'name email role')
      .lean(),
    AuditLog.countDocuments(criteria),
    AuditLog.countDocuments(failureCriteria),
  ]);

  const truncated = logs.length > EXPORT_LIMIT;
  const selected = logs.slice(0, EXPORT_LIMIT);

  const rows = selected.map((entry) => ({
    time: formatEthiopianAmharic(entry.createdAt, { time: true }),
    category: CATEGORY_LABEL[auditCategory(entry.action)] || 'ሌላ',
    action: actionLabel(entry.action),
    actor: entry.actorId?.name || entry.actorId?.email || 'ሲስተም',
    role: ROLE_LABEL[entry.actorId?.role || entry.actorRole] || entry.actorRole || '',
    outcome: entry.status === 'fail' ? 'አልተሳካም' : 'ተሳክቷል',
    target: [
      entry.targetType ? TARGET_TYPE_LABEL[entry.targetType] || entry.targetType : '',
      entry.targetId,
    ]
      .filter(Boolean)
      .join(' · '),
    ip: entry.ip || '—',
  }));

  const rangeLabel =
    range === 'all'
      ? 'ሁሉም የተመዘገበ ታሪክ'
      : range === '1'
        ? 'ባለፈው 1 ቀን'
        : `ባለፉት ${range} ቀናት`;
  const subtitle =
    filterLine(
      search ? `ፍለጋ፡ "${search}"` : null,
      category !== 'all' ? `ዘርፍ፡ ${CATEGORY_LABEL[category] || category}` : null,
      status !== 'all' ? `ውጤት፡ ${status === 'fail' ? 'አልተሳካም' : 'ተሳክቷል'}` : null,
      rangeLabel,
    ) || rangeLabel;

  const note = truncationNote('ክስተቶች', total, rows.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'audit-log',
    title: 'የኦዲት መዝገብ',
    subtitle,
    summary: [
      { label: 'የሚመሳሰሉ ክስተቶች', value: total.toLocaleString('en-US') },
      { label: 'ያልተሳኩ ክስተቶች', value: failures.toLocaleString('en-US') },
      { label: 'በፋይሉ ውስጥ ያሉ ረድፎች', value: rows.length.toLocaleString('en-US') },
    ],
    note,
    columns: [
      { key: 'time', header: 'ጊዜ', width: 23 },
      { key: 'category', header: 'ዘርፍ', width: 12 },
      { key: 'action', header: 'ተግባር', width: 24 },
      { key: 'actor', header: 'ተጠቃሚ', width: 23 },
      { key: 'role', header: 'ሚና', width: 14 },
      { key: 'outcome', header: 'ውጤት', width: 10 },
      { key: 'target', header: 'ዒላማ', width: 22 },
      { key: 'ip', header: 'IP አድራሻ', width: 17 },
    ],
    rows,
  });

  await deliver(req, res, {
    action: 'export.audit_logs',
    meta: {
      resource: 'audit_logs',
      filters: { search, category, status, range },
      truncated,
    },
    result: file,
  });
});

const AUDIENCE_LABEL = { all: 'All users', role: 'Specific role', user: 'Single user' };
const PRIORITY_LABEL = { normal: 'Normal', high: 'High', critical: 'Critical' };
const ANNOUNCEMENT_STATUS_LABEL = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  expired: 'Expired',
  archived: 'Archived',
};
const TYPE_LABEL = {
  general: 'General',
  academic: 'Academic',
  exam: 'Exam',
  event: 'Event',
  administrative: 'Administrative',
  emergency: 'Emergency',
  holiday: 'Holiday',
  finance: 'Finance',
};

export const exportAnnouncements = auditedExport('export.announcements', 'announcements', async (req, res) => {
  const { search, status, type, priority, format } = req.valid.query;
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (type !== 'all') filter.type = type;
  if (priority !== 'all') filter.priority = priority;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: rx }, { body: rx }];
  }

  const [rows, total] = await Promise.all([
    Announcement.find(filter)
      .sort({ pinned: -1, createdAt: -1 })
      .limit(EXPORT_LIMIT + 1)
      .populate('audienceUser', 'name email role')
      .lean(),
    Announcement.countDocuments(filter),
  ]);

  const truncated = rows.length > EXPORT_LIMIT;
  const selected = rows.slice(0, EXPORT_LIMIT);
  const records = selected.map((row) => ({
    title: row.title,
    type: TYPE_LABEL[row.type] || row.type,
    priority: PRIORITY_LABEL[row.priority] || row.priority,
    status: ANNOUNCEMENT_STATUS_LABEL[row.status] || row.status,
    audience:
      row.audience === 'role'
        ? `${AUDIENCE_LABEL.role}: ${ROLE_LABEL[row.audienceRole] || row.audienceRole || ''}`
        : row.audience === 'user'
          ? `${AUDIENCE_LABEL.user}: ${row.audienceUser?.email || row.audienceUser?.name || ''}`
          : AUDIENCE_LABEL.all,
    recipients: row.recipientCount || 0,
    delivered: row.deliveredCount || 0,
    read: row.readCount || 0,
    readRate: row.recipientCount ? `${Math.round((row.readCount / row.recipientCount) * 100)}%` : '0%',
    email: row.sendEmail ? `${row.emailSentCount || 0} sent / ${row.emailFailedCount || 0} failed` : 'Not requested',
    published: formatEthiopianAmharic(row.publishedAt, { time: true }),
    expires: row.expiresAt ? formatEthiopianAmharic(row.expiresAt, { time: true }) : '',
    created: formatEthiopianAmharic(row.createdAt),
  }));

  const subtitle =
    filterLine(
      search ? `Search "${search}"` : null,
      status !== 'all' ? `Status: ${ANNOUNCEMENT_STATUS_LABEL[status] || status}` : null,
      type !== 'all' ? `Type: ${TYPE_LABEL[type] || type}` : null,
      priority !== 'all' ? `Priority: ${PRIORITY_LABEL[priority] || priority}` : null,
    ) || 'All announcements';

  const file = await buildExport({
    format,
    filenamePrefix: 'announcements',
    title: 'Announcement register',
    subtitle,
    summary: [
      { label: 'Matching announcements', value: total.toLocaleString('en-US') },
      { label: 'Rows in this file', value: records.length.toLocaleString('en-US') },
    ],
    note: truncationNote('announcements', total, records.length),
    columns: [
      { key: 'title', header: 'Title', width: 30 },
      { key: 'type', header: 'Type', width: 16 },
      { key: 'priority', header: 'Priority', width: 12 },
      { key: 'status', header: 'Status', width: 13 },
      { key: 'audience', header: 'Audience', width: 26 },
      { key: 'recipients', header: 'Recipients', width: 12 },
      { key: 'delivered', header: 'Delivered', width: 12 },
      { key: 'read', header: 'Read', width: 10 },
      { key: 'readRate', header: 'Read rate', width: 11 },
      { key: 'email', header: 'Email delivery', width: 20 },
      { key: 'published', header: 'Published', width: 23 },
      { key: 'expires', header: 'Expires', width: 23 },
      { key: 'created', header: 'Created', width: 20 },
    ],
    rows: records,
  });

  await deliver(req, res, {
    action: 'export.announcements',
    meta: { resource: 'announcements', filters: { search, status, type, priority }, truncated },
    result: file,
  });
});

export const exportAnalytics = auditedExport('export.system_analytics', 'system_analytics', async (req, res) => {
  const { days, format } = req.valid.query;
  const now = new Date();
  const since = new Date(now.getTime() - (days - 1) * DAY_MS);
  const onlineSince = new Date(now.getTime() - ONLINE_MS);

  const [users, locked, verified, newUsers, roleRows, statusRows, activeSessions, onlineSessions, terminatedSessions, newSessions, auditTotal, auditFailures, categoryRows, announcementRows] =
    await Promise.all([
      User.countDocuments({ deletedAt: null }),
      User.countDocuments({ deletedAt: null, lockUntil: after(now) }),
      User.countDocuments({ deletedAt: null, emailVerified: true }),
      User.countDocuments({ deletedAt: null, createdAt: atOrAfter(since) }),
      User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Session.countDocuments({ status: 'active', expiresAt: after(now) }),
      Session.countDocuments({ status: 'active', expiresAt: after(now), lastSeenAt: atOrAfter(onlineSince) }),
      Session.countDocuments({ status: 'revoked', revokedAt: atOrAfter(since) }),
      Session.countDocuments({ createdAt: atOrAfter(since) }),
      AuditLog.countDocuments({ createdAt: atOrAfter(since) }),
      AuditLog.countDocuments({ createdAt: atOrAfter(since), status: 'fail' }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
      Announcement.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, recipients: { $sum: '$recipientCount' }, reads: { $sum: '$readCount' } } }]),
    ]);

  const roles = Object.fromEntries(roleRows.map((row) => [row._id, row.count]));
  const statuses = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));
  const categories = { signin: 0, security: 0, admin: 0, settings: 0, announcements: 0, maintenance: 0, account: 0, export: 0, other: 0 };
  for (const row of categoryRows) categories[auditCategory(row._id)] += row.count;
  const announcements = Object.fromEntries(
    announcementRows.map((row) => [row._id, { count: row.count, recipients: row.recipients, reads: row.reads }]),
  );

  const metrics = [
    ['Accounts', 'Total accounts', users],
    ['Accounts', 'Active accounts', statuses.active || 0],
    ['Accounts', 'Awaiting setup', statuses.pending || 0],
    ['Accounts', 'Turned off', statuses.disabled || 0],
    ['Accounts', 'Locked out now', locked],
    ['Accounts', 'Email verified', verified],
    ['Accounts', `New in the last ${days} days`, newUsers],
    ['Accounts', 'Administrators', roles.ADMIN || 0],
    ['Accounts', 'Registrars', roles.REGISTRAR || 0],
    ['Accounts', 'Teachers', roles.TEACHER || 0],
    ['Accounts', 'Accountants', roles.ACCOUNTANT || 0],
    ['Sessions', 'Active sessions now', activeSessions],
    ['Sessions', 'Online in the last 2 minutes', onlineSessions],
    ['Sessions', 'Sessions ended in this range', terminatedSessions],
    ['Sessions', 'Sessions started in this range', newSessions],
    ['Audit', `Audited actions in the last ${days} days`, auditTotal],
    ['Audit', 'Failed actions', auditFailures],
    ['Audit', 'Sign-in events', categories.signin],
    ['Audit', 'Security events', categories.security],
    ['Audit', 'Administration events', categories.admin],
    ['Audit', 'Settings changes', categories.settings],
    ['Audit', 'Announcement changes', categories.announcements],
    ['Audit', 'Maintenance changes', categories.maintenance],
    ['Audit', 'Exports', categories.export],
    ['Announcements', 'Drafts', announcements.draft?.count || 0],
    ['Announcements', 'Scheduled', announcements.scheduled?.count || 0],
    ['Announcements', 'Published', announcements.published?.count || 0],
    ['Announcements', 'Expired', announcements.expired?.count || 0],
    ['Announcements', 'Archived', announcements.archived?.count || 0],
    ['Announcements', 'People reached', Object.values(announcements).reduce((sum, row) => sum + (row.recipients || 0), 0)],
    ['Announcements', 'Read receipts', Object.values(announcements).reduce((sum, row) => sum + (row.reads || 0), 0)],
  ];

  const rows = metrics.map(([section, metric, value]) => ({ section, metric, value: Number(value) || 0 }));

  const file = await buildExport({
    format,
    filenamePrefix: 'system-analytics',
    title: 'System analytics',
    subtitle: `Rolling ${days}-day window, generated from live accounts, sessions, announcements and audit records.`,
    summary: [
      { label: 'Window', value: `${days} days` },
      { label: 'Metrics', value: rows.length.toLocaleString('en-US') },
    ],
    columns: [
      { key: 'section', header: 'Area', width: 20 },
      { key: 'metric', header: 'Metric', width: 48 },
      { key: 'value', header: 'Value', width: 16 },
    ],
    rows,
  });

  await deliver(req, res, {
    action: 'export.system_analytics',
    meta: { resource: 'system_analytics', filters: { days }, truncated: false },
    result: file,
  });
});
