import argon2 from 'argon2';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { revokeAllForUser, deleteAllForUser } from '../services/session.service.js';
import { forgetDevicesForUser } from '../services/device.service.js';
import { forgetUser } from '../services/user.service.js';
import { removeAllForUser } from '../services/push.service.js';
import { deliverVerifyLink, deliverResetLink } from '../services/linkDelivery.js';
import { sendAccountCreated, sendAccountDisabled, sendTempPassword } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';

const ONLY_ONE_ADMIN = 'The system has a single administrator account, and it already exists. Pick another role.';

// Never return the password hash, the lock state or anything else the screen does
// not need.
const toRow = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  emailVerified: !!u.emailVerified,
  twoStepEnabled: !!u.twoStepEnabled,
  mustChangePassword: !!u.mustChangePassword,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt,
});

async function loadUser(id) {
  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'That account was not found.');
  return user;
}

// Turning off or removing the only administrator would leave nobody able to manage
// accounts, so it is refused with a plain explanation.
async function ensureAnotherAdminStays(userId) {
  const admins = await User.find({ role: 'ADMIN', status: 'active', deletedAt: null }).select('_id').lean();
  if (admins.filter((a) => String(a._id) !== String(userId)).length === 0) {
    throw new AppError(400, 'LAST_ADMIN', 'This is the only administrator. Add another one first, then change this account.');
  }
}

export const listUsers = asyncHandler(async (req, res) => {
  const { search, role, status, page, limit } = req.valid.query;
  const filter = { deletedAt: null };
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  res.json({ users: users.map(toRow), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body;

  if (role === 'ADMIN') throw new AppError(400, 'ONE_ADMIN_ONLY', ONLY_ONE_ADMIN);

  // A removed account keeps its email reserved, so say so instead of failing on the index.
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }

  const user = await User.create({
    name,
    email,
    role,
    passwordHash: await argon2.hash(password),
    status: 'pending',
    emailVerified: false,
    mustChangePassword: true,
  });

  // Confirming the address is done with a link, so the new account gets one straight
  // away. It stays good for a few hours and only works once. If the send fails the
  // account still exists, and the confirmation link can be sent again from this screen.
  const sent = await deliverVerifyLink(user).catch(() => false);
  void sendAccountCreated({ to: user.email, name: user.name, role: user.role });
  audit({ req, action: 'admin.user_created', targetType: 'user', targetId: user._id, meta: { role, verifyLinkSent: sent } });
  res.status(201).json({
    user: toRow(user),
    message: sent
      ? 'Account created, and a confirmation link is in their inbox.'
      : 'Account created, but the confirmation link could not be sent. Use Resend link.',
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  const { name, role, status, twoStepEnabled } = req.body;
  const isSelf = String(user._id) === String(req.user.id);

  if (isSelf && role !== undefined && role !== user.role) {
    throw new AppError(400, 'SELF_ROLE', 'You cannot change your own role.');
  }
  // Promoting somebody to administrator is refused for the same reason as creating a
  // second one: the system is built around a single administrator.
  if (role === 'ADMIN' && user.role !== 'ADMIN') {
    throw new AppError(400, 'ONE_ADMIN_ONLY', ONLY_ONE_ADMIN);
  }
  if (isSelf && status === 'disabled') {
    throw new AppError(400, 'SELF_DISABLE', 'You cannot turn off your own account.');
  }
  if (status === 'disabled' && user.role === 'ADMIN') await ensureAnotherAdminStays(user._id);

  const before = { name: user.name, role: user.role, status: user.status, twoStepEnabled: user.twoStepEnabled };
  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (twoStepEnabled !== undefined) user.twoStepEnabled = twoStepEnabled;
  if (status !== undefined) user.status = status;
  await user.save();
  forgetUser(user._id);

  const turnedOff = before.status !== 'disabled' && user.status === 'disabled';
  const roleChanged = before.role !== user.role;

  // The role inside an access token is up to ten minutes old, so a change of role or
  // a turned-off account ends every session at once (build guide, phase 4).
  if (turnedOff || roleChanged) {
    await revokeAllForUser(user._id, turnedOff ? 'account_disabled' : 'role_changed');
  }
  // A turned-off account must stop receiving notices on every device.
  if (turnedOff) {
    await removeAllForUser(user._id).catch(() => {});
    void sendAccountDisabled({ to: user.email, name: user.name });
  }

  audit({
    req,
    action: turnedOff ? 'admin.user_disabled' : 'admin.user_updated',
    targetType: 'user',
    targetId: user._id,
    meta: { before, after: { name: user.name, role: user.role, status: user.status, twoStepEnabled: user.twoStepEnabled } },
  });
  res.json({ user: toRow(user) });
});

// Sends a fresh confirmation link, for when the first one ran out or was lost.
export const resendUserCode = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.emailVerified) {
    throw new AppError(400, 'ALREADY_VERIFIED', 'This email is already confirmed. Send a reset link instead.');
  }
  const sent = await deliverVerifyLink(user);
  if (!sent) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', 'A link went out a moment ago. Please wait before sending another.');
  }
  audit({ req, action: 'admin.user_verify_link_resent', targetType: 'user', targetId: user._id });
  res.json({ message: 'A new confirmation link is on its way.' });
});

// Handing out a fresh temporary password, for when the first one was lost. Only for an
// account that has not confirmed its email yet: once the email is confirmed, the person
// owns their password and an administrator must not be able to set it.
export const setTempPassword = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.emailVerified) {
    throw new AppError(
      409,
      'ALREADY_VERIFIED',
      'This person confirmed their email and chose their own password. Send them a reset link instead.',
    );
  }

  user.passwordHash = await argon2.hash(req.body.password);
  user.mustChangePassword = true;
  user.passwordChangedAt = new Date();
  user.failedLogins = 0;
  user.lockUntil = undefined;
  await user.save();
  forgetUser(user._id);

  await deleteAllForUser(user._id);
  void sendTempPassword({ to: user.email, name: user.name });
  audit({ req, action: 'admin.user_temp_password', targetType: 'user', targetId: user._id });
  res.json({ user: toRow(user), message: 'Temporary password set. Every device was signed out.' });
});

// For a person who has confirmed their email but lost access: a single-use link that
// lands straight on the "choose a new password" step and stops working after
// RESET_LINK_TTL_MINUTES.
export const sendResetLink = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.status === 'disabled') {
    throw new AppError(400, 'ACCOUNT_DISABLED', 'This account is turned off. Turn it back on first.');
  }
  if (!user.emailVerified) {
    throw new AppError(400, 'NOT_VERIFIED', 'This email is not confirmed yet. Send a new confirmation link instead.');
  }

  await deliverResetLink(user);
  audit({ req, action: 'admin.user_reset_link_sent', targetType: 'user', targetId: user._id });
  res.json({ message: 'A reset link is on its way. It works for 30 minutes.' });
});

export const signOutUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  const ended = await deleteAllForUser(user._id);
  await removeAllForUser(user._id).catch(() => {});
  audit({ req, action: 'admin.user_signed_out', targetType: 'user', targetId: user._id, meta: { sessionsEnded: ended } });
  res.json({ message: ended ? 'Every device was signed out.' : 'That account had no active sessions.' });
});

// Soft delete, as the design plan asks: the account stops working, the history stays.
export const removeUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (String(user._id) === String(req.user.id)) {
    throw new AppError(400, 'SELF_REMOVE', 'You cannot remove your own account.');
  }
  if (user.role === 'ADMIN') await ensureAnotherAdminStays(user._id);

  user.deletedAt = new Date();
  user.status = 'disabled';
  await user.save();
  forgetUser(user._id);

  await deleteAllForUser(user._id);
  await forgetDevicesForUser(user._id);
  await removeAllForUser(user._id).catch(() => {});
  audit({ req, action: 'admin.user_removed', targetType: 'user', targetId: user._id, meta: { role: user.role } });
  res.json({ message: 'That account was removed.' });
});
