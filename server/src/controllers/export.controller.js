import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { formatEthiopianAmharic } from '../utils/ethiopianDate.js';
import { audit } from '../services/audit.service.js';
import { auditCategory, auditCategoryFilter } from '../services/auditCategory.service.js';
import { buildExport, EXPORT_LIMIT } from '../services/export.service.js';

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
  'user.push_subscribed': 'ማሳወቂያ ተከፍቷል',
  'user.push_unsubscribed': 'ማሳወቂያ ተዘግቷል',
  'export.users': 'የተጠቃሚዎች ማውጣት',
  'export.sessions': 'የክፍለ ጊዜዎች ማውጣት',
  'export.audit_logs': 'የኦዲት መዝገብ ማውጣት',
};

const TARGET_TYPE_LABEL = {
  user: 'ተጠቃሚ',
  session: 'ክፍለ ጊዜ',
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
  if (since) criteria.createdAt = { $gte: since };

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
      ...(actors.length ? [{ actorId: { $in: actors.map((actor) => actor._id) } }] : []),
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
