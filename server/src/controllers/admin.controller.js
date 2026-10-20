import { Session } from '../models/Session.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { revokeSession } from '../services/session.service.js';
import { audit } from '../services/audit.service.js';

const ONLINE_MS = 2 * 60_000;

export const listSessions = asyncHandler(async (req, res) => {
  const now = Date.now();
  const rows = await Session.find({ status: 'active' })
    .sort({ lastSeenAt: -1 })
    .limit(200)
    .populate('userId', 'name email role')
    .lean();

  const sessions = rows
    .filter((s) => s.userId && s.expiresAt.getTime() > now)
    .map((s) => ({
      id: s._id,
      user: { id: s.userId._id, name: s.userId.name, email: s.userId.email, role: s.userId.role },
      ip: s.ip,
      browser: s.browser,
      os: s.os,
      deviceType: s.deviceType,
      deviceName: s.deviceName,
      deviceLabel: s.deviceLabel,
      deviceModelSource: s.deviceModelSource,
      location: s.location,
      locationSource: s.locationSource,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      online: now - s.lastSeenAt.getTime() < ONLINE_MS,
    }));

  res.json({ sessions, onlineCount: sessions.filter((s) => s.online).length });
});

export const terminateSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.valid.params.id, status: 'active' });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That session was not found or has already ended.');
  await revokeSession(session._id, { by: req.user.id, reason: 'admin_terminated' });
  audit({ req, action: 'admin.session_terminated', targetType: 'session', targetId: session._id, meta: { userId: String(session.userId) } });
  res.json({ message: 'Session ended. That person is signed out.' });
});
