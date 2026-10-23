import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { revokeSession } from '../services/session.service.js';
import { audit } from '../services/audit.service.js';
import {
  AUDIT_CATEGORIES,
  auditCategory,
  auditCategoryExpression,
} from '../services/auditCategory.service.js';
import { after, atOrAfter } from '../utils/mongo.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ONLINE_MS = 2 * 60 * 1000;
const TZ = 'Africa/Addis_Ababa';

const emptyRoleCounts = () => Object.fromEntries(ROLES.map((role) => [role, 0]));
const emptyStateCounts = () => ({ all: 0, active: 0, online: 0, away: 0, expired: 0, terminated: 0 });
const emptyCategoryCounts = () => Object.fromEntries(AUDIT_CATEGORIES.map((key) => [key, 0]));

const dayKey = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

// A live session is online, away or expired. A revoked one is terminated. The state is
// computed in the database so filtering and tab counts always describe the same rows.
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
          { country: rx },
          { countryCode: rx },
          { city: rx },
          { region: rx },
        ],
      },
    });
  }

  return pipeline;
}

const stateFilter = {
  active: { state: { $in: ['online', 'away'] } },
  online: { state: 'online' },
  away: { state: 'away' },
  expired: { state: 'expired' },
  terminated: { state: 'terminated' },
};

const toSessionRow = (s, currentSid) => ({
  id: s._id,
  current: String(s._id) === String(currentSid),
  user: {
    id: s.user?._id,
    name: s.user?.name,
    email: s.user?.email,
    role: s.user?.role,
  },
  ip: s.ip,
  browser: s.browser,
  os: s.os,
  deviceType: s.deviceType,
  deviceName: s.deviceName,
  deviceLabel: s.deviceLabel,
  deviceModelSource: s.deviceModelSource,
  location: s.location || 'Unknown location',
  locationSource: s.locationSource || (s.location ? 'legacy' : 'none'),
  country: s.country || '',
  countryCode: s.countryCode || '',
  city: s.city || '',
  region: s.region || '',
  detectionStatus: s.detectionStatus || (s.location ? 'legacy' : 'unavailable'),
  detectedAt: s.detectedAt ?? null,
  state: s.state,
  online: s.state === 'online',
  createdAt: s.createdAt,
  lastSeenAt: s.lastSeenAt,
  expiresAt: s.expiresAt,
  revokedAt: s.revokedAt ?? null,
  revokeReason: s.revokeReason ?? null,
});

export const listSessions = asyncHandler(async (req, res) => {
  const { search, role, status, page, limit } = req.valid.query;
  const base = sessionBase(search);
  const roleStages = role ? [{ $match: { 'user.role': role } }] : [];
  const wanted = status !== 'all' ? [{ $match: stateFilter[status] }] : [];

  const [rows, totalRows, stateRows, roleRows] = await Promise.all([
    Session.aggregate([
      ...base,
      ...roleStages,
      ...wanted,
      { $sort: { lastSeenAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    Session.aggregate([...base, ...roleStages, ...wanted, { $count: 'total' }]),
    Session.aggregate([...base, ...roleStages, { $group: { _id: '$state', count: { $sum: 1 } } }]),
    Session.aggregate([...base, { $group: { _id: '$user.role', count: { $sum: 1 } } }]),
  ]);

  const counts = emptyStateCounts();
  for (const row of stateRows) {
    if (row._id && counts[row._id] !== undefined) counts[row._id] = row.count;
  }
  counts.all = counts.online + counts.away + counts.expired + counts.terminated;
  counts.active = counts.online + counts.away;

  const byRole = emptyRoleCounts();
  for (const row of roleRows) {
    if (row._id && byRole[row._id] !== undefined) byRole[row._id] = row.count;
  }

  const total = totalRows[0]?.total ?? 0;

  res.json({
    sessions: rows.map((row) => toSessionRow(row, req.user.sid)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: { ...counts, byRole },
  });
});

export const terminateSession = asyncHandler(async (req, res) => {
  const now = new Date();
  const session = await Session.findOne({
    _id: req.valid.params.id,
    status: 'active',
    expiresAt: after(now),
  });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That session was not found or has already ended.');

  await revokeSession(session._id, { by: req.user.id, reason: 'admin_terminated' });
  audit({
    req,
    action: 'admin.session_terminated',
    targetType: 'session',
    targetId: session._id,
    meta: { userId: String(session.userId) },
  });
  res.json({ message: 'Session ended. That person is signed out.' });
});

// One read for the administrator's home screen. Everything is a real count or a real
// daily group; nothing is padded with made-up numbers. An empty school shows zeroes.
export const getOverview = asyncHandler(async (req, res) => {
  const { days } = req.valid.query;
  const now = new Date();
  // Start at midnight in Addis so "14 days" on the chart and the totals below cover the
  // same window. Ethiopia has no daylight saving, so a fixed +03:00 offset is exact.
  const firstDay = dayKey(new Date(now.getTime() - (days - 1) * DAY_MS));
  const since = new Date(`${firstDay}T00:00:00+03:00`);
  const onlineSince = new Date(now.getTime() - ONLINE_MS);
  const liveQuery = { status: 'active', expiresAt: after(now) };
  const live = { status: 'active', expiresAt: { $gt: now } };

  const [
    roleRows,
    locked,
    verified,
    newUsers,
    activeSessions,
    onlineSessions,
    signedInIds,
    terminated,
    newSessions,
    deviceRows,
    auditTotal,
    dailyRows,
    moduleRows,
    recentRows,
    loginSuccess,
    loginFailed,
  ] = await Promise.all([
    User.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
    ]),
    User.countDocuments({ deletedAt: null, lockUntil: after(now) }),
    User.countDocuments({ deletedAt: null, emailVerified: true }),
    User.countDocuments({ deletedAt: null, createdAt: atOrAfter(since) }),
    Session.countDocuments(liveQuery),
    Session.countDocuments({ ...liveQuery, lastSeenAt: atOrAfter(onlineSince) }),
    Session.distinct('userId', liveQuery),
    Session.countDocuments({ status: 'revoked', revokedAt: atOrAfter(since) }),
    Session.countDocuments({ createdAt: atOrAfter(since) }),
    Session.aggregate([
      { $match: live },
      { $group: { _id: { $ifNull: ['$deviceType', 'unknown'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    AuditLog.countDocuments({ createdAt: atOrAfter(since) }),
    AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
    ]),
    AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $project: { module: { $arrayElemAt: [{ $split: ['$action', '.'] }, 0] }, status: 1 } },
      { $group: { _id: '$module', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('actorId', 'name email role')
      .lean(),
    AuditLog.countDocuments({ action: 'auth.login', status: 'success', createdAt: atOrAfter(since) }),
    AuditLog.countDocuments({ action: 'auth.login_failed', status: 'fail', createdAt: atOrAfter(since) }),
  ]);

  const roles = ROLES.map((role) => ({ role, total: 0, active: 0, pending: 0, disabled: 0 }));
  const byRole = new Map(roles.map((row) => [row.role, row]));
  const statusTotals = { active: 0, pending: 0, disabled: 0 };

  for (const row of roleRows) {
    const target = byRole.get(row._id?.role);
    if (!target) continue;
    target.total += row.count;
    if (row._id?.status && target[row._id.status] !== undefined) target[row._id.status] += row.count;
    if (row._id?.status && statusTotals[row._id.status] !== undefined) statusTotals[row._id.status] += row.count;
  }

  const totalStaff = statusTotals.active + statusTotals.pending + statusTotals.disabled;

  const keys = Array.from({ length: days }, (_, index) =>
    dayKey(new Date(now.getTime() - (days - 1 - index) * DAY_MS)),
  );
  const dailyMap = new Map(keys.map((date) => [date, { date, success: 0, fail: 0, total: 0 }]));
  for (const row of dailyRows) {
    const bucket = dailyMap.get(row._id?.day);
    if (!bucket) continue;
    const key = row._id?.status === 'fail' ? 'fail' : 'success';
    bucket[key] += row.count;
    bucket.total += row.count;
  }

  const failedActions = dailyRows
    .filter((row) => row._id?.status === 'fail')
    .reduce((sum, row) => sum + row.count, 0);

  const attempts = loginSuccess + loginFailed;
  const recent = recentRows.map((row) => ({
    id: row._id,
    action: row.action,
    category: auditCategory(row.action),
    actor: row.actorId
      ? { id: row.actorId._id, name: row.actorId.name, email: row.actorId.email, role: row.actorId.role }
      : null,
    actorRole: row.actorRole,
    targetType: row.targetType,
    targetId: row.targetId,
    status: row.status,
    ip: row.ip,
    createdAt: row.createdAt,
  }));

  res.json({
    generatedAt: now,
    days,
    staff: {
      total: totalStaff,
      ...statusTotals,
      locked,
      verified,
      new: newUsers,
      roles,
    },
    sessions: {
      active: activeSessions,
      online: onlineSessions,
      away: Math.max(0, activeSessions - onlineSessions),
      signedIn: signedInIds.length,
      terminated,
      new: newSessions,
      devices: deviceRows.map((row) => ({ type: row._id || 'unknown', count: row.count })),
    },
    signins: {
      success: loginSuccess,
      failed: loginFailed,
      rate: attempts ? Math.round((loginSuccess / attempts) * 100) : null,
    },
    activity: {
      total: auditTotal,
      failed: failedActions,
      daily: [...dailyMap.values()],
      modules: moduleRows.map((row) => ({ key: row._id || 'other', count: row.count })),
      recent,
    },
  });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const { search, category, status, role, range, page, limit } = req.valid.query;
  const now = new Date();
  const since = range === 'all' ? null : new Date(now.getTime() - Number(range) * DAY_MS);

  const base = [];
  if (since) base.push({ $match: { createdAt: { $gte: since } } });
  base.push(
    { $lookup: { from: 'users', localField: 'actorId', foreignField: '_id', as: 'actor' } },
    { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        category: auditCategoryExpression,
        actorName: { $ifNull: ['$actor.name', '$actor.email'] },
        effectiveRole: { $ifNull: ['$actor.role', '$actorRole'] },
      },
    },
  );

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    base.push({
      $match: {
        $or: [
          { action: rx },
          { targetType: rx },
          { targetId: rx },
          { ip: rx },
          { location: rx },
          { country: rx },
          { city: rx },
          { region: rx },
          { actorName: rx },
          { 'actor.email': rx },
        ],
      },
    });
  }

  const statusStages = status === 'all' ? [] : [{ $match: { status } }];
  const categoryStages = category === 'all' ? [] : [{ $match: { category } }];
  const roleStages = role === 'all' ? [] : [{ $match: { effectiveRole: role } }];

  const project = {
    $project: {
      id: '$_id',
      _id: 0,
      action: 1,
      category: 1,
      targetType: 1,
      targetId: 1,
      status: 1,
      ip: 1,
      location: 1,
      country: 1,
      countryCode: 1,
      city: 1,
      region: 1,
      detectionStatus: 1,
      detectedAt: 1,
      meta: 1,
      createdAt: 1,
      actorRole: 1,
      actor: { id: '$actor._id', name: '$actor.name', email: '$actor.email', role: '$actor.role' },
    },
  };

  const [rows, totalRows, categoryRows, statusRows, roleRows] = await Promise.all([
    AuditLog.aggregate([
      ...base,
      ...roleStages,
      ...statusStages,
      ...categoryStages,
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      project,
    ]),
    AuditLog.aggregate([...base, ...roleStages, ...statusStages, ...categoryStages, { $count: 'total' }]),
    AuditLog.aggregate([...base, ...roleStages, ...statusStages, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    AuditLog.aggregate([...base, ...roleStages, ...categoryStages, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    AuditLog.aggregate([...base, ...statusStages, ...categoryStages, { $group: { _id: '$effectiveRole', count: { $sum: 1 } } }]),
  ]);

  const categories = emptyCategoryCounts();
  for (const row of categoryRows) {
    if (row._id && categories[row._id] !== undefined) categories[row._id] = row.count;
  }

  const statuses = { success: 0, fail: 0 };
  for (const row of statusRows) {
    if (row._id && statuses[row._id] !== undefined) statuses[row._id] = row.count;
  }

  const roles = emptyRoleCounts();
  for (const row of roleRows) {
    if (row._id && roles[row._id] !== undefined) roles[row._id] = row.count;
  }

  const total = totalRows[0]?.total ?? 0;
  const logs = rows.map((row) => ({
    ...row,
    actor: row.actor?.id
      ? { id: row.actor.id, name: row.actor.name, email: row.actor.email, role: row.actor.role }
      : null,
  }));

  res.json({
    logs,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    range,
    counts: {
      all: Object.values(categories).reduce((sum, value) => sum + value, 0),
      categories,
      statuses,
      roles,
    },
  });
});
