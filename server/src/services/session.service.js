import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Session } from '../models/Session.js';
import { AppError } from '../utils/AppError.js';
import { newRefreshToken, sha256 } from './token.service.js';
import { audit } from './audit.service.js';

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
  const s = await Session.findById(key).select('userId status expiresAt').lean();
  const ok = !!s && s.status === 'active' && s.expiresAt.getTime() > now && String(s.userId) === String(userId);
  if (ok) cache.set(key, { userId: String(userId), until: now + CACHE_MS, touched: now });
  else cache.delete(key);
  return ok;
}

export async function createSession({ user, deviceId, info }) {
  const now = Date.now();
  const live = (await Session.find({ userId: user._id, status: 'active' }).select('deviceId expiresAt').lean()).filter(
    (s) => s.expiresAt.getTime() > now,
  );
  const limit = deviceLimitFor(user.role);
  const otherDevices = new Set(live.filter((s) => s.deviceId !== deviceId).map((s) => s.deviceId));
  if (otherDevices.size >= limit) {
    throw new AppError(
      403,
      'DEVICE_LIMIT',
      `You are already signed in on ${limit} devices. Sign out of one of them, or ask the admin to end one for you.`,
    );
  }
  // Signing in again on the same browser replaces its old session instead of using a new slot.
  await Promise.all(
    live
      .filter((s) => s.deviceId === deviceId)
      .map(async (s) => {
        await Session.deleteOne({ _id: s._id });
        forgetSession(s._id);
      }),
  );
  const refresh = newRefreshToken();
  const session = await Session.create({
    userId: user._id,
    deviceId,
    refreshHash: sha256(refresh),
    ...info,
    expiresAt: new Date(now + env.REFRESH_TTL_DAYS * DAY),
    absoluteExpiresAt: new Date(now + env.REFRESH_ABSOLUTE_DAYS * DAY),
  });
  return { session, refresh };
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

  // One atomic step: only one request can win with a given token.
  const session = await Session.findOneAndUpdate(
    { refreshHash: hash, status: 'active' },
    { $set: { prevRefreshHash: hash, refreshHash: sha256(next), rotatedAt: now, lastSeenAt: now } },
    { returnDocument: 'after' },
  );

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
