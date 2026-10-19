import argon2 from 'argon2';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { escapeRegex } from '../utils/text.js';
import { revokeAllForUser, deleteAllForUser } from '../services/session.service.js';
import { forgetDevicesForUser } from '../services/device.service.js';
import { forgetUser } from '../services/user.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { sendAccountCreated, sendAccountDisabled, sendTempPassword } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';

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

  await sendCode(user, 'email_verify');
  void sendAccountCreated({ to: user.email, name: user.name, role: user.role });
  audit({ req, action: 'admin.user_created', targetType: 'user', targetId: user._id, meta: { role } });
  res.status(201).json({ user: toRow(user), message: 'Account created. We emailed a confirmation code.' });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  const { name, role, status, twoStepEnabled } = req.body;
  const isSelf = String(user._id) === String(req.user.id);

  if (isSelf && role !== undefined && role !== user.role) {
    throw new AppError(400, 'SELF_ROLE', 'You cannot change your own role.');
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
  if (turnedOff) void sendAccountDisabled({ to: user.email, name: user.name });

  audit({
    req,
    action: turnedOff ? 'admin.user_disabled' : 'admin.user_updated',
    targetType: 'user',
    targetId: user._id,
    meta: { before, after: { name: user.name, role: user.role, status: user.status, twoStepEnabled: user.twoStepEnabled } },
  });
  res.json({ user: toRow(user) });
});

export const resendUserCode = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.emailVerified) {
    throw new AppError(400, 'ALREADY_VERIFIED', 'This email is already confirmed.');
  }
  const sent = await sendCode(user, 'email_verify');
  if (!sent) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', 'A code went out a moment ago. Please wait before sending another.');
  }
  audit({ req, action: 'admin.user_code_resent', targetType: 'user', targetId: user._id });
  res.json({ message: 'A new confirmation code is on its way.' });
});

// Handing out a fresh temporary password, for when the first one was lost.
export const setTempPassword = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
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

export const signOutUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  const ended = await deleteAllForUser(user._id);
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
  audit({ req, action: 'admin.user_removed', targetType: 'user', targetId: user._id, meta: { role: user.role } });
  res.json({ message: 'That account was removed.' });
});
