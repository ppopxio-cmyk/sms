import argon2 from 'argon2';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ensureDeviceId, describeRequest } from '../utils/device.js';
import { REFRESH_COOKIE, refreshCookieOptions, clearRefreshOptions } from '../utils/cookies.js';
import { signAccess, signTicket, readTicket, sha256 } from '../services/token.service.js';
import { checkCode } from '../services/code.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { createSession, rotateSession, revokeSession } from '../services/session.service.js';
import { sendLoginAlert } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';

// Used when the email does not exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = await argon2.hash('not-a-real-password');
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

export const safeUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: u.emailVerified,
  twoStepEnabled: u.twoStepEnabled,
});

async function startSession(req, res, user) {
  const deviceId = ensureDeviceId(req, res);
  const info = await describeRequest(req);
  const { session, refresh } = await createSession({ user, deviceId, info });
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions(session.expiresAt.getTime() - Date.now()));
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date(), failedLogins: 0, $unset: { lockUntil: 1 } });
  void sendLoginAlert({ to: user.email, name: user.name, ...info, at: new Date() });
  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.login', targetType: 'session', targetId: session._id, meta: { browser: info.browser, os: info.os } });
  return { accessToken: signAccess(user, session._id), user: safeUser(user), session: { id: session._id } };
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in.');
  }
  // The role is never taken from the request. Self-registered accounts start as TEACHER with no data access.
  const user = await User.create({ name, email, passwordHash: await argon2.hash(password) });
  await sendCode(user, 'email_verify');
  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.register', targetType: 'user', targetId: user._id });
  res.status(201).json({ message: 'Account created. We sent a 6-digit code to your email.', email: user.email });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw new AppError(400, 'CODE_WRONG', 'That code is not right.');
  await checkCode(user._id, 'email_verify', code);
  user.emailVerified = true;
  if (user.status === 'pending') user.status = 'active';
  await user.save();
  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.email_verified', targetType: 'user', targetId: user._id });
  res.json({ message: 'Email confirmed. You can sign in now.' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && !user.emailVerified) await sendCode(user, 'email_verify');
  res.json({ message: 'If that email still needs confirming, we sent a new code.' });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  if (user?.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many wrong attempts. Try again in about 15 minutes, or reset your password.');
  }

  const passwordOk = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !passwordOk) {
    if (user) {
      const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLogins: 1 } }, { returnDocument: 'after' });
      if (updated.failedLogins >= LOCK_AFTER) {
        await User.updateOne({ _id: user._id }, { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) });
      }
    }
    audit({ req, actorId: user?._id, action: 'auth.login_failed', status: 'fail', meta: { email } });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'That email or password is not right.');
  }

  if (user.status === 'disabled') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is turned off. Please contact the administrator.');
  }

  if (!user.emailVerified) {
    await sendCode(user, 'email_verify');
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email first. We sent you a code.', { email: user.email });
  }

  if (user.twoStepEnabled) {
    await sendCode(user, 'login_2fa');
    return res.json({ requires2fa: true, ticket: signTicket(user._id, 'login-2fa', '5m') });
  }

  res.json(await startSession(req, res, user));
});

export const loginVerify = asyncHandler(async (req, res) => {
  const payload = readTicket(req.body.ticket, 'login-2fa');
  const user = await User.findById(payload.sub);
  if (!user || user.status === 'disabled') {
    throw new AppError(401, 'TICKET_INVALID', 'That step has expired. Please start again.');
  }
  await checkCode(user._id, 'login_2fa', req.body.code);
  res.json(await startSession(req, res, user));
});

export const loginResend = asyncHandler(async (req, res) => {
  const payload = readTicket(req.body.ticket, 'login-2fa');
  const user = await User.findById(payload.sub);
  if (user && user.status !== 'disabled') await sendCode(user, 'login_2fa');
  res.json({ message: 'We sent a new code.' });
});

// The page calls this every time it starts. This is what keeps people signed in after a refresh.
export const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw new AppError(401, 'NO_SESSION', 'Please sign in.');
  try {
    const { session, refresh: next } = await rotateSession(raw);
    const user = await User.findById(session.userId);
    if (!user || user.status === 'disabled') {
      await revokeSession(session._id, { reason: 'account_unavailable' });
      throw new AppError(401, 'NO_SESSION', 'Please sign in.');
    }
    if (next) res.cookie(REFRESH_COOKIE, next, refreshCookieOptions(session.expiresAt.getTime() - Date.now()));
    res.json({ accessToken: signAccess(user, session._id), user: safeUser(user) });
  } catch (err) {
    if (err instanceof AppError && err.status === 401) res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    const session = await Session.findOne({ refreshHash: sha256(raw) });
    if (session) {
      await revokeSession(session._id, { by: session.userId, reason: 'logout' });
      audit({ req, actorId: session.userId, action: 'auth.logout', targetType: 'session', targetId: session._id });
    }
  }
  res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'This session was ended. Please sign in again.');
  res.json({ user: safeUser(user) });
});

// authenticate already refreshes lastSeenAt (at most once a minute), which is what makes "active now" work.
export const heartbeat = (req, res) => res.status(204).end();

export const listMySessions = asyncHandler(async (req, res) => {
  const now = Date.now();
  const rows = await Session.find({ userId: req.user.id, status: 'active' }).sort({ lastSeenAt: -1 }).lean();
  res.json({
    sessions: rows
      .filter((s) => s.expiresAt.getTime() > now)
      .map((s) => ({
        id: s._id,
        browser: s.browser,
        os: s.os,
        deviceType: s.deviceType,
        location: s.location,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: String(s._id) === req.user.sid,
      })),
  });
});

export const revokeMySession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.valid.params.id, userId: req.user.id, status: 'active' });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That session was not found.');
  await revokeSession(session._id, { by: req.user.id, reason: 'signed_out_from_list' });
  audit({ req, action: 'auth.session_signed_out', targetType: 'session', targetId: session._id });
  res.json({ message: 'That device was signed out.' });
});
