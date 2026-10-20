import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Session } from '../models/Session.js';
import { KnownDevice } from '../models/KnownDevice.js';
import { AppError } from '../utils/AppError.js';
import { deviceKey } from '../utils/device.js';
import { newRefreshToken, sha256 } from './token.service.js';
import { audit } from './audit.service.js';
import { securityPolicy } from './securityPolicy.service.js';
import { atOrAfter } from '../utils/mongo.js';

const DAY = 24 * 60 * 60 * 1000;
const CACHE_MS = 30_000;
const GRACE_MS = 10_000;
const cache = new Map(); // sessionId -> { userId, until, touched }

export const forgetSession = (id) => cache.delete(String(id));
export const deviceLimitFor = (role) => (role === 'ADMIN' ? env.MAX_DEVICES_ADMIN : env.MAX_DEVICES_USER);

// Called on every request. Fast path = memory, slow path = one indexed lookup.
export async function isSessionActive(sid, userId) {
  const key = String(sid);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now && hit.userId === String(userId)) {
    if (now - hit.touched > 60_000) {
      hit.touched = now;
      Session.updateOne({ _id: key }, { lastSeenAt: new Date() }).catch(() => {});
    }
    return true;
  }
  if (!mongoose.isValidObjectId(key)) return false;
  const [s, policy] = await Promise.all([
    Session.findById(key).select('userId status expiresAt absoluteExpiresAt lastSeenAt').lean(),
    securityPolicy(),
  ]);
  const idleMs = policy.idleMinutes * 60_000;
  const lastSeen = s?.lastSeenAt?.getTime?.() ?? 0;
  const idle = Boolean(lastSeen && now - lastSeen > idleMs);
  const timedOut = Boolean(
    s && (s.expiresAt?.getTime?.() <= now || s.absoluteExpiresAt?.getTime?.() <= now),
  );
  const ok = !!s && s.status === 'active' && !timedOut && !idle && String(s.userId) === String(userId);

  // An idle browser is ended explicitly, so the administrator's session list shows a
  // real reason instead of a row that merely looks old.
  if (idle && s?.status === 'active' && String(s.userId) === String(userId)) {
    await revokeSession(s._id, { reason: 'idle_timeout' });
  }

  if (ok) cache.set(key, { userId: String(userId), until: now + CACHE_MS, touched: now });
  else cache.delete(key);
  return ok;
}

export async function createSession({ user, deviceId, fingerprint, info }) {
  const now = Date.now();
  const key = deviceKey(fingerprint, deviceId);
  const policy = await securityPolicy();

  // A single-session policy means the new sign-in replaces every older browser before
  // the device limit is counted, so switching the rule on can never strand somebody at
  // "too many devices" on their next login.
  if (policy.singleSession) await deleteAllForUser(user._id);

  const live = (await Session.find({ userId: user._id, status: 'active' }).select('deviceId fingerprint expiresAt').lean()).filter(
    (s) => s.expiresAt.getTime() > now,
  );
  const limit = deviceLimitFor(user.role);
  // Count other browsers, never this one, so signing in again on the same browser
  // is always allowed and simply takes that browser's slot back.
  const otherDevices = new Set(live.map((s) => deviceKey(s.fingerprint, s.deviceId)).filter((k) => k !== key));
  if (otherDevices.size >= limit) {
    throw new AppError(
      403,
      'DEVICE_LIMIT',
      `You are already signed in on ${limit} devices. Sign out of one of them, or ask the admin to end one for you.`,
    );
  }
  // Signing in again on the same browser replaces its old session instead of using a new slot.
  await deleteSessionRows(
    live.filter((s) => deviceKey(s.fingerprint, s.deviceId) === key).map((s) => s._id),
  );
  const refresh = newRefreshToken();
  // A name the person gave this browser last time belongs on the new row too, otherwise
  // signing in again would forget it.
  const known = await KnownDevice.findOne({ userId: user._id, key }).select('deviceLabel').lean();
  const absoluteExpiresAt = new Date(now + policy.absoluteDays * DAY);
  const session = await Session.create({
    userId: user._id,
    deviceId,
    fingerprint: fingerprint ?? undefined,
    refreshHash: sha256(refresh),
    ...info,
    deviceLabel: known?.deviceLabel,
    // The normal refresh window can never outlive the administrator's absolute limit.
    expiresAt: new Date(Math.min(now + env.REFRESH_TTL_DAYS * DAY, absoluteExpiresAt.getTime())),
    absoluteExpiresAt,
  });
  return { session, refresh };
}

// Deleting, not revoking. A signed-out session should hold no slot and leave no row
// behind; the audit log is where the history of it lives.
export async function deleteSessionRows(ids) {
  await Promise.all(
    ids.map(async (id) => {
      await Session.deleteOne({ _id: id });
      forgetSession(id);
    }),
  );
  return ids.length;
}

// Everything belonging to one browser for one person.
export async function deleteDeviceSessions(userId, { deviceId, fingerprint }) {
  const key = deviceKey(fingerprint, deviceId);
  const rows = await Session.find({ userId }).select('deviceId fingerprint').lean();
  return deleteSessionRows(rows.filter((s) => deviceKey(s.fingerprint, s.deviceId) === key).map((s) => s._id));
}

export async function deleteAllForUser(userId) {
  const rows = await Session.find({ userId }).select('_id').lean();
  return deleteSessionRows(rows.map((s) => s._id));
}

// Used when a password changes: the device making the change stays signed in.
export async function deleteAllForUserExcept(userId, keepSessionId) {
  const rows = await Session.find({ userId }).select('_id').lean();
  return deleteSessionRows(rows.filter((s) => String(s._id) !== String(keepSessionId)).map((s) => s._id));
}

export async function revokeSession(id, { by, reason } = {}) {
  await Session.updateOne({ _id: id }, { status: 'revoked', revokedAt: new Date(), revokedBy: by ?? null, revokeReason: reason });
  forgetSession(id);
}

export async function revokeAllForUser(userId, reason) {
  const list = await Session.find({ userId, status: 'active' }).select('_id').lean();
  await Promise.all(list.map((s) => revokeSession(s._id, { reason })));
}

// Swap the refresh token for a new one. Returns { session, refresh }.
// refresh is null when we are inside the grace window (the other tab already got the new cookie).
export async function rotateSession(rawToken) {
  const hash = sha256(rawToken);
  const next = newRefreshToken();
  const now = new Date();
  const policy = await securityPolicy();
  const staleBefore = new Date(now.getTime() - policy.idleMinutes * 60_000);

  // One atomic step: only one request can win with a given token. The idle cutoff is
  // part of the filter, so a refresh token from a browser that has been closed for too
  // long cannot quietly start a new session.
  const session = await Session.findOneAndUpdate(
    { refreshHash: hash, status: 'active', lastSeenAt: atOrAfter(staleBefore) },
    { $set: { prevRefreshHash: hash, refreshHash: sha256(next), rotatedAt: now, lastSeenAt: now } },
    { returnDocument: 'after' },
  );

  if (!session) {
    const stale = await Session.findOne({ refreshHash: hash, status: 'active' })
      .select('_id lastSeenAt')
      .lean();
    if (stale && (!stale.lastSeenAt || stale.lastSeenAt < staleBefore)) {
      await revokeSession(stale._id, { reason: 'idle_timeout' });
      throw new AppError(401, 'SESSION_EXPIRED', 'Your session ended after a period of inactivity. Please sign in again.');
    }
  }

  if (session) {
    if (session.expiresAt <= now || session.absoluteExpiresAt <= now) {
      await revokeSession(session._id, { reason: 'expired' });
      throw new AppError(401, 'SESSION_EXPIRED', 'Your session ended. Please sign in again.');
    }
    session.expiresAt = new Date(Math.min(now.getTime() + env.REFRESH_TTL_DAYS * DAY, session.absoluteExpiresAt.getTime()));
    await session.save();
    return { session, refresh: next };
  }

  // Not the current token. Was it the one we just replaced?
  const old = await Session.findOne({ prevRefreshHash: hash });
  if (old && old.status === 'active') {
    if (old.rotatedAt && now - old.rotatedAt < GRACE_MS && old.expiresAt > now) {
      return { session: old, refresh: null };
    }
    await revokeSession(old._id, { reason: 'refresh_reuse' });
    audit({ actorId: old.userId, action: 'auth.refresh_reuse', targetType: 'session', targetId: old._id, status: 'fail' });
  }
  throw new AppError(401, 'NO_SESSION', 'Please sign in.');
}
