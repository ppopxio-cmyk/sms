import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { formatEthiopian } from '../utils/ethiopianDate.js';
import { audit } from '../services/audit.service.js';
import { auditCategory, auditCategoryFilter } from '../services/auditCategory.service.js';
import { buildExport, EXPORT_LIMIT } from '../services/export.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_MS = 2 * 60 * 1000;

const ROLE_LABEL = {
  ADMIN: 'Administrator',
  REGISTRAR: 'Registrar',
  TEACHER: 'Teacher',
  ACCOUNTANT: 'Accountant',
};

const USER_STATUS_LABEL = {
  pending: 'Pending',
  active: 'Active',
  disabled: 'Disabled',
};

const SESSION_STATE_LABEL = {
  online: 'Online',
  away: 'Away',
  expired: 'Expired',
  terminated: 'Ended',
};

const CATEGORY_LABEL = {
  signin: 'Sign in',
  security: 'Security',
  admin: 'Admin',
  account: 'Account',
  export: 'Export',
  other: 'Other',
};

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
    ? `Showing the first ${shown.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} matching ${label}. Narrow the filters to export the rest.`
    : null;

function deviceLabel(session) {
  return (
    session.deviceLabel ||
    session.deviceName ||
    [session.browser, session.os].filter(Boolean).join(' on ') ||
    'Unknown device'
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
    name: user.name || 'Awaiting setup',
    email: user.email || '',
    role: ROLE_LABEL[user.role] || user.role,
    status: USER_STATUS_LABEL[user.status] || user.status,
    verified: user.emailVerified ? 'Yes' : 'No',
    twoStep: user.twoStepEnabled ? 'On' : 'Off',
    locked: user.lockUntil && new Date(user.lockUntil).getTime() > now.getTime() ? 'Yes' : 'No',
    lastLogin: formatEthiopian(user.lastLoginAt, { time: true }),
    created: formatEthiopian(user.createdAt),
  }));

  const subtitle =
    filterLine(
      search ? `Search: "${search}"` : null,
      role ? `Role: ${ROLE_LABEL[role] || role}` : null,
      status ? `Status: ${USER_STATUS_LABEL[status] || status}` : null,
    ) || 'All accounts';

  const note = truncationNote('accounts', total, rows.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'accounts',
    title: 'User accounts',
    subtitle,
    summary: [
      { label: 'Matching accounts', value: total.toLocaleString('en-US') },
      { label: 'Rows in file', value: rows.length.toLocaleString('en-US') },
    ],
    note,
    columns: [
      { key: 'name', header: 'Name', width: 24 },
      { key: 'email', header: 'Email', width: 30 },
      { key: 'role', header: 'Role', width: 15 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'verified', header: 'Email verified', width: 14 },
      { key: 'twoStep', header: 'Two-step', width: 10 },
      { key: 'locked', header: 'Locked', width: 10 },
      { key: 'lastLogin', header: 'Last sign-in', width: 23 },
      { key: 'created', header: 'Added', width: 18 },
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
    name: session.user?.name || 'Awaiting setup',
    email: session.user?.email || '',
    role: ROLE_LABEL[session.user?.role] || session.user?.role || '',
    state: SESSION_STATE_LABEL[session.state] || session.state,
    device: deviceLabel(session),
    ip: session.ip || '—',
    place: session.location || 'Unknown',
    lastActive: formatEthiopian(session.lastSeenAt, { time: true }),
    started: formatEthiopian(session.createdAt),
    ended: session.revokedAt ? formatEthiopian(session.revokedAt, { time: true }) : '',
  }));

  const subtitle =
    filterLine(
      search ? `Search: "${search}"` : null,
      role ? `Role: ${ROLE_LABEL[role] || role}` : null,
      status !== 'all' ? `State: ${SESSION_STATE_LABEL[status] || status}` : null,
    ) || 'All sessions';

  const note = truncationNote('sessions', total, records.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'sessions',
    title: 'Sign-in sessions',
    subtitle,
    summary: [
      { label: 'Matching sessions', value: total.toLocaleString('en-US') },
      { label: 'Rows in file', value: records.length.toLocaleString('en-US') },
      { label: 'Online', value: stateCounts.online.toLocaleString('en-US') },
      { label: 'Away', value: stateCounts.away.toLocaleString('en-US') },
      { label: 'Ended or expired', value: (stateCounts.expired + stateCounts.terminated).toLocaleString('en-US') },
    ],
    note,
    columns: [
      { key: 'name', header: 'Person', width: 22 },
      { key: 'email', header: 'Email', width: 27 },
      { key: 'role', header: 'Role', width: 14 },
      { key: 'state', header: 'State', width: 10 },
      { key: 'device', header: 'Device', width: 24 },
      { key: 'ip', header: 'IP address', width: 17 },
      { key: 'place', header: 'Place', width: 20 },
      { key: 'lastActive', header: 'Last active', width: 22 },
      { key: 'started', header: 'Started', width: 19 },
      { key: 'ended', header: 'Ended', width: 22 },
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
    time: formatEthiopian(entry.createdAt, { time: true }),
    category: CATEGORY_LABEL[auditCategory(entry.action)] || 'Other',
    action: entry.action,
    actor: entry.actorId?.name || entry.actorId?.email || 'System',
    role: ROLE_LABEL[entry.actorId?.role || entry.actorRole] || entry.actorRole || '',
    outcome: entry.status === 'fail' ? 'Failed' : 'Success',
    target: [entry.targetType, entry.targetId].filter(Boolean).join(' · '),
    ip: entry.ip || '—',
  }));

  const rangeLabel =
    range === 'all' ? 'All recorded history' : `Last ${range} ${range === '1' ? 'day' : 'days'}`;
  const subtitle =
    filterLine(
      search ? `Search: "${search}"` : null,
      category !== 'all' ? `Area: ${CATEGORY_LABEL[category] || category}` : null,
      status !== 'all' ? `Outcome: ${status === 'fail' ? 'Failed' : 'Success'}` : null,
      rangeLabel,
    ) || rangeLabel;

  const note = truncationNote('events', total, rows.length);

  const file = await buildExport({
    format,
    filenamePrefix: 'audit-log',
    title: 'Audit log',
    subtitle,
    summary: [
      { label: 'Matching events', value: total.toLocaleString('en-US') },
      { label: 'Failed events', value: failures.toLocaleString('en-US') },
      { label: 'Rows in file', value: rows.length.toLocaleString('en-US') },
    ],
    note,
    columns: [
      { key: 'time', header: 'Time', width: 23 },
      { key: 'category', header: 'Area', width: 12 },
      { key: 'action', header: 'Action', width: 24 },
      { key: 'actor', header: 'Actor', width: 23 },
      { key: 'role', header: 'Role', width: 14 },
      { key: 'outcome', header: 'Outcome', width: 10 },
      { key: 'target', header: 'Target', width: 22 },
      { key: 'ip', header: 'IP address', width: 17 },
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
