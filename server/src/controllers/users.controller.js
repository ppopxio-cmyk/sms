import crypto from 'node:crypto';
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
import { sendAccountCreated } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';
import { after } from '../utils/mongo.js';

const ONLY_ONE_ADMIN = 'The system has a single administrator account, and it already exists. Pick another role.';

// A password that nobody knows and that no sign-in can ever match. It is what a brand new
// account holds until its owner chooses their own.
const unusableHash = () => argon2.hash(crypto.randomBytes(32).toString('hex'));

// Disabling or removing somebody throws them out on every device, so the administrator
// proves who they are first. A wrong password is written to the audit log.
async function confirmAdminPassword(req, password) {
  const admin = await User.findById(req.user.id).select('+passwordHash');
  if (!admin || !(await argon2.verify(admin.passwordHash, password ?? ''))) {
    audit({ req, action: 'admin.confirm_failed', status: 'fail', targetType: 'user', targetId: req.user.id });
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your password.');
  }
}

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
  locked: !!u.lockUntil && new Date(u.lockUntil).getTime() > Date.now(),
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
  const { search, role, status, page, limit, sort, dir } = req.valid.query;
  const filter = { deletedAt: null };
  if (role) filter.role = role;
  if (status) filter.status = status;

  // Tabs count everybody the current search can see, not just the page on screen. They
  // deliberately ignore the role and status filters so switching tabs does not make the
  // other categories look empty.
  const countFilter = { deletedAt: null };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
    countFilter.$or = [{ name: rx }, { email: rx }];
  }

  const now = new Date();
  const [total, users, roleRows, statusRows, locked] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ [sort]: dir === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.aggregate([{ $match: countFilter }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: countFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments({ ...countFilter, lockUntil: after(now) }),
  ]);

  const byRole = Object.fromEntries(['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT'].map((key) => [key, 0]));
  const byStatus = { pending: 0, active: 0, disabled: 0 };
  for (const row of roleRows) if (row._id) byRole[row._id] = row.count;
  for (const row of statusRows) if (row._id) byStatus[row._id] = row.count;

  res.json({
    users: users.map(toRow),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    counts: {
      all: byRole.ADMIN + byRole.REGISTRAR + byRole.TEACHER + byRole.ACCOUNTANT,
      byRole,
      byStatus,
      locked,
    },
  });
});

export const createUser = asyncHandler(async (req, res) => {
  const { email, role } = req.body;

  if (role === 'ADMIN') throw new AppError(400, 'ONE_ADMIN_ONLY', ONLY_ONE_ADMIN);

  // A removed account keeps its email reserved, so say so instead of failing on the index.
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }

  // Nothing but the address and the role. No password is created here, and none is ever
  // handed to the administrator: the person chooses their own name and password when
  // they open the link that confirms the address.
  const user = await User.create({
    name: '',
    email,
    role,
    passwordHash: await unusableHash(),
    status: 'pending',
    emailVerified: false,
    mustChangePassword: true,
  });

  // Confirming the address is done with a link, so the new account gets one straight
  // away. It stays good for a few hours and only works once. If the send fails the
  // account still exists, and the link can be sent again from this screen.
  const sent = await deliverVerifyLink(user).catch(() => false);
  void sendAccountCreated({ to: user.email, role: user.role });
  audit({ req, action: 'admin.user_created', targetType: 'user', targetId: user._id, meta: { role, verifyLinkSent: sent } });
  res.status(201).json({
    user: toRow(user),
    message: sent
      ? 'Account created, and a link is in their inbox so they can set their name and password.'
      : 'Account created, but the link could not be sent. Use Resend link.',
  });
});

// Editing an account means turning it on or off. It is always confirmed with the
// administrator's own password, because turning it off ends every session at once.
export const updateUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  const { status, password } = req.body;
  const isSelf = String(user._id) === String(req.user.id);

  await confirmAdminPassword(req, password);

  if (isSelf && status === 'disabled') {
    throw new AppError(400, 'SELF_DISABLE', 'You cannot turn off your own account.');
  }
  if (status === 'disabled' && user.role === 'ADMIN') await ensureAnotherAdminStays(user._id);

  const before = { status: user.status };
  user.status = status;
  await user.save();
  forgetUser(user._id);

  const turnedOff = before.status !== 'disabled' && user.status === 'disabled';

  // A turned-off account loses every session at once, and every device stops receiving
  // notices for it. Nothing is emailed: the account is simply off.
  if (turnedOff) {
    await revokeAllForUser(user._id, 'account_disabled');
    await removeAllForUser(user._id).catch(() => {});
  }

  audit({
    req,
    action: turnedOff ? 'admin.user_disabled' : 'admin.user_enabled',
    targetType: 'user',
    targetId: user._id,
    meta: { before, after: { status: user.status } },
  });
  res.json({ user: toRow(user), message: turnedOff ? 'Account turned off, and every device was signed out.' : 'Account turned back on.' });
});

// Sends a fresh confirmation link, for when the first one ran out or was lost. That
// includes an account whose email was confirmed but was never finished.
export const resendUserCode = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.emailVerified && !user.mustChangePassword) {
    throw new AppError(400, 'ALREADY_VERIFIED', 'This email is already confirmed. Send a reset link instead.');
  }
  try {
    await deliverVerifyLink(user);
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') {
      throw new AppError(429, 'WAIT_BEFORE_RESEND', 'A link went out a moment ago. Please wait before sending another.');
    }
    throw err;
  }
  audit({ req, action: 'admin.user_verify_link_resent', targetType: 'user', targetId: user._id });
  res.json({ message: user.mustChangePassword ? 'A new setup link is on its way.' : 'A new confirmation link is on its way.' });
});

// For a person who has confirmed their email but lost access: a single-use link that
// lands straight on the "choose a new password" step and stops working after
// RESET_LINK_TTL_MINUTES.
export const sendResetLink = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (user.status === 'disabled') {
    throw new AppError(400, 'ACCOUNT_DISABLED', 'This account is turned off. Turn it back on first.');
  }
  if (user.mustChangePassword) {
    throw new AppError(400, 'NOT_SET_UP', 'This person has not finished setting up. Send a confirmation link instead.');
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

// Soft delete, as the design plan asks: the account is gone from the list and can never
// sign in again, but the history stays readable. Confirmed with the administrator's own
// password, like turning an account off, and nothing is emailed to the account.
export const removeUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.valid.params.id);
  if (String(user._id) === String(req.user.id)) {
    throw new AppError(400, 'SELF_REMOVE', 'You cannot remove your own account.');
  }
  if (user.role === 'ADMIN') await ensureAnotherAdminStays(user._id);

  await confirmAdminPassword(req, req.body.password);

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
