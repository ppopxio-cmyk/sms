import argon2 from 'argon2';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signTicket, readTicket } from '../services/token.service.js';
import { checkCode } from '../services/code.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { passwordVersion as version } from '../services/link.service.js';
import { revokeAllForUser } from '../services/session.service.js';
import { forgetUser } from '../services/user.service.js';
import { notifyPasswordChanged } from '../services/notification.service.js';
import { sendPasswordChanged } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';
import { getSettings } from '../services/settings.service.js';
import { enforcePasswordPolicy, wantsSecurityEmail } from '../services/securityPolicy.service.js';

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && user.status !== 'disabled') {
    await sendCode(user, 'password_reset');
    audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.password_reset_requested', targetType: 'user', targetId: user._id });
  }
  res.json({ message: 'If that email has an account, we sent a 6-digit code. It works for 5 minutes.' });
});

export const verifyResetCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email });
  if (!user || user.status === 'disabled') throw new AppError(400, 'CODE_WRONG', 'That code is not right.');
  await checkCode(user._id, 'password_reset', code);
  res.json({ resetToken: signTicket(user._id, 'password-reset', '10m', { v: version(user) }) });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body;
  const payload = readTicket(resetToken, 'password-reset');
  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.status === 'disabled' || version(user) !== payload.v) {
    throw new AppError(401, 'TICKET_INVALID', 'That step has expired. Please start again.');
  }
  if (await argon2.verify(user.passwordHash, newPassword)) {
    throw new AppError(400, 'SAME_PASSWORD', 'Pick a password that is different from your current one.');
  }
  await enforcePasswordPolicy(newPassword);

  user.passwordHash = await argon2.hash(newPassword);
  user.passwordChangedAt = new Date();
  user.failedLogins = 0;
  user.lockUntil = undefined;
  user.emailVerified = true;
  user.mustChangePassword = false;
  if (user.status === 'pending') user.status = 'active';
  await user.save();
  forgetUser(user._id);

  await revokeAllForUser(user._id, 'password_reset');
  const settings = await getSettings().catch(() => null);
  if (wantsSecurityEmail(user, settings)) {
    void sendPasswordChanged({ to: user.email, name: user.name });
  }
  void notifyPasswordChanged({ user }).catch(() => {});
  audit({ req, actorId: user._id, actorRole: user.role, action: 'auth.password_reset_done', targetType: 'user', targetId: user._id });
  res.json({ message: 'Password changed. Please sign in with your new password.' });
});
