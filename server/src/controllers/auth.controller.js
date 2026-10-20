import argon2 from 'argon2';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { KnownDevice } from '../models/KnownDevice.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ensureDeviceId, describeRequest, deviceFingerprint, deviceKey } from '../utils/device.js';
import { REFRESH_COOKIE, refreshCookieOptions, clearRefreshOptions } from '../utils/cookies.js';
import { signAccess, signTicket, readTicket, sha256 } from '../services/token.service.js';
import { checkCode, resendWaitMessage } from '../services/code.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { deliverVerifyLink } from '../services/linkDelivery.js';
import { consumeVerifyLink, consumeSetupTicket, issueSetupTicket } from '../services/link.service.js';
import {
  createSession,
  rotateSession,
  revokeSession,
  deleteSessionRows,
  deleteDeviceSessions,
  deleteAllForUser,
  deleteAllForUserExcept,
} from '../services/session.service.js';
import { isNewDevice, rememberDevice, forgetDevicesForUser } from '../services/device.service.js';
import { forgetUser } from '../services/user.service.js';
import { removeForDevice, removeAllForUser } from '../services/push.service.js';
import { notifySignIn, notifyEmailVerified, notifyPasswordChanged } from '../services/notification.service.js';
import { sendLoginAlert, sendPasswordChanged } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';

// Used when the email does not exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = await argon2.hash('not-a-real-password');
// Three wrong passwords lock the account for fifteen minutes. The message matches the
// wording on the sign-in screen.
const LOCK_AFTER = 3;
const LOCK_MS = 15 * 60_000;

const LINK_INVALID = 'That link has expired or has already been used. Ask for a new one.';

export const safeUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  emailVerified: u.emailVerified,
  twoStepEnabled: u.twoStepEnabled,
  mustChangePassword: !!u.mustChangePassword,
});

async function startSession(req, res, user, { deviceId, fingerprint }) {
  const info = await describeRequest(req);
  const { session, refresh } = await createSession({ user, deviceId, fingerprint, info });
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions(session.expiresAt.getTime() - Date.now()));
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date(), failedLogins: 0, $unset: { lockUntil: 1 } });
  // This browser has now signed in, so the next sign-in from it is not "new".
  void rememberDevice({ userId: user._id, key: deviceKey(fingerprint, deviceId), info }).catch(() => {});
  // A name the person gave this browser is what the alert should say, not the system label.
  const detail = { ...info, deviceLabel: session.deviceLabel };
  void sendLoginAlert({ to: user.email, name: user.name, ...detail, at: new Date() });
  // Open tabs and other devices hear about this at once; the administrator is told when
  // it is somebody else. The browser that just signed in is left out of its own notice.
  void notifySignIn({ user, sid: session._id, deviceKey: deviceKey(fingerprint, deviceId), info: detail }).catch(() => {});
  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.login', targetType: 'session', targetId: session._id, meta: { browser: info.browser, os: info.os } });
  return { accessToken: signAccess(user, session._id), user: safeUser(user), session: { id: session._id } };
}

// Confirming an email uses a link, never a code: the link is a signed ticket that is
// bound to the address and dies the moment it is used, or after VERIFY_LINK_TTL_HOURS.
export const verifyEmail = asyncHandler(async (req, res) => {
  const payload = await consumeVerifyLink(req.body.token);
  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt || (payload.email && payload.email !== user.email)) {
    throw new AppError(400, 'LINK_INVALID', LINK_INVALID);
  }

  const firstTime = !user.emailVerified;
  if (firstTime) {
    user.emailVerified = true;
    if (user.status === 'pending') user.status = 'active';
    await user.save();
    forgetUser(user._id);
    void notifyEmailVerified({ user }).catch(() => {});
    audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.email_verified', targetType: 'user', targetId: user._id });
  }

  // The person just proved they read the mailbox from this browser, so the sign-in
  // that follows counts as a known device and does not ask for a second code.
  const info = await describeRequest(req);
  await rememberDevice({ userId: user._id, key: deviceKey(deviceFingerprint(req), ensureDeviceId(req, res)), info }).catch(() => {});

  // A brand new account still has no name and no password, so confirming the address is
  // only half of it. The browser gets a short ticket to finish the job right here,
  // instead of being sent to the sign-in page it cannot use yet.
  const setupTicket = user.mustChangePassword ? issueSetupTicket(user) : null;

  res.json({
    message: user.mustChangePassword
      ? 'Email confirmed. Now choose your name and password.'
      : firstTime
        ? 'Email confirmed. You can sign in now.'
        : 'This email was already confirmed.',
    email: user.email,
    setupTicket,
  });
});

// The second half of the same flow: the address is already confirmed, so this sets the
// name and the password its owner chose. The ticket is bound to the account and stops
// working the moment a password exists.
export const setupAccount = asyncHandler(async (req, res) => {
  const payload = consumeSetupTicket(req.body.ticket);
  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.deletedAt) throw new AppError(400, 'SETUP_TICKET_INVALID', 'That link is no longer good. Ask for a new one.');
  if (user.status === 'disabled') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is turned off. Please contact the administrator.');
  }
  if (!user.mustChangePassword) {
    throw new AppError(400, 'ALREADY_SET_UP', 'This account is already set up. Please sign in.');
  }

  user.name = req.body.name;
  user.passwordHash = await argon2.hash(req.body.password);
  user.passwordChangedAt = new Date();
  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.mustChangePassword = false;
  user.emailVerified = true;
  if (user.status === 'pending') user.status = 'active';
  await user.save();
  forgetUser(user._id);

  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.account_setup', targetType: 'user', targetId: user._id });
  res.json({ message: 'Your account is ready. Sign in with your new password.', email: user.email });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  // Somebody whose account is set up cannot use a confirm link for anything, so they get
  // nothing. Everybody else does: either the address is still unconfirmed, or it is
  // confirmed but the account was never finished.
  const wantsLink = user && (!user.emailVerified || user.mustChangePassword);
  if (wantsLink && user.status !== 'disabled') await deliverVerifyLink(user).catch(() => {});
  res.json({ message: 'If that email still needs confirming, we sent a new link.' });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  if (user?.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many wrong attempts. Try again in about 15 minutes, or reset your password.');
  }

  // An account that was never finished has no password to compare, so it must not fall
  // through to the wrong-password branch and get locked out. It gets a fresh link
  // instead, which opens the page where the name and password are chosen.
  if (user?.mustChangePassword) {
    if (user.status === 'disabled' || user.deletedAt) {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is turned off. Please contact the administrator.');
    }
    await deliverVerifyLink(user).catch(() => {});
    audit({ req, actorId: user._id, action: 'auth.login_not_set_up', status: 'fail' });
    throw new AppError(403, 'ACCOUNT_NOT_SET_UP', 'Finish setting up your account first. We sent a fresh link to your inbox.', { email: user.email });
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

  if (user.status === 'disabled' || user.deletedAt) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is turned off. Please contact the administrator.');
  }

  if (!user.emailVerified) {
    // A brand new link, unless one went out less than two minutes ago - the older link
    // is still good for hours, so the wait costs nothing.
    await deliverVerifyLink(user).catch(() => {});
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email first. We sent a link to your inbox.', { email: user.email });
  }

  const deviceId = ensureDeviceId(req, res);
  const fingerprint = deviceFingerprint(req);
  const fresh = await isNewDevice(user._id, deviceKey(fingerprint, deviceId));

  // A code is asked for when the account turned 2-step on, or when this browser has
  // never signed in before.
  if (user.twoStepEnabled || fresh) {
    await sendCode(user, 'login_2fa');
    return res.json({
      requires2fa: true,
      reason: user.twoStepEnabled ? 'twoStep' : 'newDevice',
      ticket: signTicket(user._id, 'login-2fa', '5m'),
    });
  }

  res.json(await startSession(req, res, user, { deviceId, fingerprint }));
});

export const loginVerify = asyncHandler(async (req, res) => {
  const payload = readTicket(req.body.ticket, 'login-2fa');
  const user = await User.findById(payload.sub);
  if (!user || user.status === 'disabled' || user.deletedAt) {
    throw new AppError(401, 'TICKET_INVALID', 'That step has expired. Please start again.');
  }
  await checkCode(user._id, 'login_2fa', req.body.code);
  res.json(await startSession(req, res, user, { deviceId: ensureDeviceId(req, res), fingerprint: deviceFingerprint(req) }));
});

export const loginResend = asyncHandler(async (req, res) => {
  const payload = readTicket(req.body.ticket, 'login-2fa');
  const user = await User.findById(payload.sub);
  if (user && user.status !== 'disabled' && !user.deletedAt) await sendCode(user, 'login_2fa');
  res.json({ message: 'We sent a new code.' });
});

// The page calls this every time it starts. This is what keeps people signed in after a refresh.
export const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw new AppError(401, 'NO_SESSION', 'Please sign in.');
  try {
    const { session, refresh: next } = await rotateSession(raw);
    const user = await User.findById(session.userId);
    if (!user || user.status === 'disabled' || user.deletedAt) {
      await revokeSession(session._id, { reason: 'account_unavailable' });
      forgetUser(session.userId);
      throw new AppError(401, 'NO_SESSION', 'Please sign in.');
    }
    if (next) res.cookie(REFRESH_COOKIE, next, refreshCookieOptions(session.expiresAt.getTime() - Date.now()));
    res.json({ accessToken: signAccess(user, session._id), user: safeUser(user) });
  } catch (err) {
    if (err instanceof AppError && err.status === 401) res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
    throw err;
  }
});

// Signing out deletes the session row: the slot is freed and the database keeps no
// stale "still signed in" row. The audit log is the history.
export const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    const session = await Session.findOne({ refreshHash: sha256(raw) });
    if (session) {
      const ended = await deleteDeviceSessions(session.userId, { deviceId: session.deviceId, fingerprint: session.fingerprint });
      // A signed-out browser must stop receiving this person's notices, or the next
      // person on a shared computer would read them on the lock screen.
      await removeForDevice(session.userId, deviceKey(session.fingerprint, session.deviceId)).catch(() => {});
      audit({ req, actorId: session.userId, action: 'auth.logout', targetType: 'session', targetId: session._id, meta: { sessionsEnded: ended } });
    }
  }
  res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || user.deletedAt) throw new AppError(401, 'SESSION_ENDED', 'This session was ended. Please sign in again.');
  res.json({ user: safeUser(user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || user.status === 'disabled' || user.deletedAt) {
    throw new AppError(401, 'SESSION_ENDED', 'This account is not available. Please contact the administrator.');
  }

  // The profile page is the only place a password changes now, and it always has to
  // prove the current one.
  if (!(await argon2.verify(user.passwordHash, currentPassword))) {
    audit({ req, action: 'auth.password_change_failed', status: 'fail', targetType: 'user', targetId: user._id });
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your current password.');
  }
  if (await argon2.verify(user.passwordHash, newPassword)) {
    throw new AppError(400, 'SAME_PASSWORD', 'Pick a password that is different from your current one.');
  }

  user.passwordHash = await argon2.hash(newPassword);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  forgetUser(user._id);

  // Every other device is signed out; the browser making the change stays in.
  const ended = await deleteAllForUserExcept(user._id, req.user.sid);
  void sendPasswordChanged({ to: user.email, name: user.name });
  void notifyPasswordChanged({ user }).catch(() => {});
  audit({ req, action: 'auth.password_changed', targetType: 'user', targetId: user._id, meta: { otherSessionsEnded: ended } });
  res.json({ message: 'Password changed.', user: safeUser(user) });
});

// Two-step verification is the person's own setting, and switching it on or off has to
// prove the current password so a borrowed browser cannot quietly turn it off.
export const setTwoStep = asyncHandler(async (req, res) => {
  const { enabled, currentPassword } = req.body;
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || user.status === 'disabled' || user.deletedAt) {
    throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  }
  if (!(await argon2.verify(user.passwordHash, currentPassword))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your current password.');
  }
  if (user.twoStepEnabled !== enabled) {
    user.twoStepEnabled = enabled;
    await user.save();
    forgetUser(user._id);
    audit({ req, action: enabled ? 'auth.two_step_enabled' : 'auth.two_step_disabled', targetType: 'user', targetId: user._id });
  }
  res.json({ user: safeUser(user), message: enabled ? 'Two-step verification is on.' : 'Two-step verification is off.' });
});

// Deleting your own account asks for the password and then a code sent to the mailbox,
// so a stolen laptop cannot wipe the account. The only administrator cannot delete
// itself: that would leave nobody able to manage the system.
export const requestDeleteCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || user.deletedAt) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  if (user.role === 'ADMIN') {
    throw new AppError(400, 'LAST_ADMIN', 'This is the only administrator account, so it cannot be deleted.');
  }
  if (!(await argon2.verify(user.passwordHash, req.body.password))) {
    audit({ req, action: 'auth.account_delete_failed', status: 'fail', targetType: 'user', targetId: user._id });
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your current password.');
  }

  const sent = await sendCode(user, 'account_delete');
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  audit({ req, action: 'auth.account_delete_code_sent', targetType: 'user', targetId: user._id });
  res.json({ message: 'We emailed you a code to confirm.' });
});

export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || user.deletedAt) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  if (user.role === 'ADMIN') {
    throw new AppError(400, 'LAST_ADMIN', 'This is the only administrator account, so it cannot be deleted.');
  }
  if (!(await argon2.verify(user.passwordHash, req.body.password))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your current password.');
  }
  await checkCode(user._id, 'account_delete', req.body.code);

  // Soft delete, like the administrator's "remove": the account stops working, the
  // audit trail keeps its history.
  user.deletedAt = new Date();
  user.status = 'disabled';
  await user.save();
  forgetUser(user._id);
  await deleteAllForUser(user._id);
  await forgetDevicesForUser(user._id);
  await removeAllForUser(user._id).catch(() => {});

  audit({ req, action: 'auth.account_deleted', targetType: 'user', targetId: user._id });
  res.clearCookie(REFRESH_COOKIE, clearRefreshOptions);
  res.json({ message: 'Your account was deleted.' });
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
        deviceName: s.deviceName,
        deviceLabel: s.deviceLabel,
        deviceModelSource: s.deviceModelSource,
        location: s.location,
        locationSource: s.locationSource,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: String(s._id) === req.user.sid,
      })),
  });
});

// A name a person gives their own browser. The model of a laptop is invisible to every
// website, so this is the only way a row can honestly say "HP EliteBook 830 G8". The name is
// set on every open session for the same browser, and remembered for the next sign-in.
export const renameMySession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.valid.params.id, userId: req.user.id, status: 'active' });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That device is no longer signed in.');

  const label = req.body.label.trim();

  await Session.updateMany({ userId: req.user.id, deviceId: session.deviceId }, { $set: { deviceLabel: label } });
  await KnownDevice.updateOne(
    { userId: req.user.id, key: deviceKey(session.fingerprint, session.deviceId) },
    { $set: { deviceLabel: label } },
  );

  audit({ req, actorId: req.user.id, actorRole: req.user.role, action: 'auth.device_named', targetType: 'session', targetId: session._id });
  res.json({ message: 'Device named.', label });
});

// Signing one of your own devices out asks for a code first, so a borrowed laptop
// cannot quietly kick your other devices off.
export const requestSessionCode = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.valid.params.id, userId: req.user.id, status: 'active' });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That session was not found.');
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');

  const sent = await sendCode(user, 'session_terminate');
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  audit({ req, action: 'auth.session_signout_code_sent', targetType: 'session', targetId: session._id });
  res.json({ message: 'We emailed you a code to confirm this.' });
});

export const terminateMySession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.valid.params.id, userId: req.user.id, status: 'active' });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'That session was not found.');
  await checkCode(req.user.id, 'session_terminate', req.body.code);
  await deleteSessionRows([session._id]);
  audit({ req, action: 'auth.session_signed_out', targetType: 'session', targetId: session._id });
  res.json({ message: 'That device was signed out.' });
});
