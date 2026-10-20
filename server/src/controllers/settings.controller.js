import argon2 from 'argon2';
import { User } from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/audit.service.js';
import { MAIL_TRANSPORT, sendTestEmail } from '../services/mail.service.js';
import { revokeAllExceptUsers } from '../services/session.service.js';
import { logger } from '../utils/logger.js';
import {
  applySettingsPatch,
  getSettings,
  invalidateSettingsCache,
  maintenanceState,
  publicSettings,
} from '../services/settings.service.js';

const maskEmail = (value = '') => String(value).replace(/^(.).*?(@.*)$/, '$1***$2');

async function adminPasswordOk(req, password) {
  const admin = await User.findById(req.user.id).select('+passwordHash');
  const ok = Boolean(admin && (await argon2.verify(admin.passwordHash, password ?? '')));
  if (!ok) {
    audit({ req, action: 'admin.confirm_failed', status: 'fail', targetType: 'user', targetId: req.user.id });
    throw new AppError(400, 'WRONG_PASSWORD', 'That is not your password.');
  }
  return admin;
}

const mailFacts = () => {
  const from = String(process.env.SMTP_USER || '');
  return {
    transport: MAIL_TRANSPORT,
    sender: from ? maskEmail(from) : null,
    gmailApiConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN,
    ),
    smtpConfigured: Boolean(process.env.SMTP_APP_PASSWORD),
  };
};

export const readSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings({ fresh: true });
  res.json({
    settings: publicSettings(settings),
    mail: mailFacts(),
    generatedAt: new Date(),
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings({ fresh: true });
  const patch = req.body;

  // Recovery access must stay on whenever the portal is closed. Otherwise one switch
  // could lock the only administrator out of the screen needed to reopen it.
  if (settings.system?.maintenanceMode && patch.system?.allowAdminRecovery === false) {
    throw new AppError(400, 'RECOVERY_REQUIRED', 'Admin recovery stays on while maintenance mode is active.');
  }

  const changed = applySettingsPatch(settings, patch);
  if (!Object.keys(changed).length) {
    throw new AppError(400, 'NO_CHANGES', 'Choose at least one setting to save.');
  }
  settings.updatedBy = req.user.id;
  await settings.save();
  invalidateSettingsCache();

  audit({
    req,
    action: 'admin.settings_updated',
    targetType: 'settings',
    targetId: settings._id,
    meta: { changed: Object.keys(changed) },
  });

  res.json({
    settings: publicSettings(settings),
    message: 'Settings saved. The change is already in effect.',
  });
});

export const updateMaintenance = asyncHandler(async (req, res) => {
  const { enabled, message, until, password } = req.body;
  const admin = await adminPasswordOk(req, password);
  const settings = await getSettings({ fresh: true });
  const before = maintenanceState(settings);
  const plannedEnd = until ? new Date(until) : null;
  if (enabled && plannedEnd && plannedEnd <= new Date()) {
    throw new AppError(400, 'MAINTENANCE_UNTIL_PAST', 'Choose a planned end time in the future.');
  }

  settings.system.maintenanceMode = enabled;
  if (message) settings.system.maintenanceMessage = message;
  settings.system.maintenanceUntil = enabled ? plannedEnd : null;
  // Recovery is a safety rail, not a convenience: keep it on for every closure.
  if (enabled) settings.system.allowAdminRecovery = true;
  settings.maintenanceUpdatedBy = admin._id;
  settings.maintenanceChangedAt = new Date();
  await settings.save();
  invalidateSettingsCache();

  // Closing the portal ends every non-admin session immediately. Administrators keep
  // their sessions so the person who closed it can reopen it without being locked out.
  let sessionsEnded = 0;
  let revocationFailed = false;
  if (enabled) {
    try {
      const admins = await User.find({ role: 'ADMIN', deletedAt: null }).select('_id').lean();
      // Keep the caller even if a concurrent role change made the query miss them: the
      // person closing the portal must never revoke the only route back in.
      const keep = admins.map((row) => row._id);
      if (!keep.some((id) => String(id) === String(admin._id))) keep.push(admin._id);
      sessionsEnded = await revokeAllExceptUsers(keep, {
        reason: 'maintenance_mode',
        by: admin._id,
      });
    } catch (err) {
      revocationFailed = true;
      logger.error({ err: err.message }, 'non-admin sessions could not be revoked for maintenance');
    }
  }

  const after = maintenanceState(settings);
  audit({
    req,
    action: enabled ? 'admin.maintenance_enabled' : 'admin.maintenance_disabled',
    targetType: 'settings',
    targetId: settings._id,
    meta: {
      before: { enabled: before.enabled, until: before.until },
      after: { enabled: after.enabled, until: after.until, message: after.message },
      sessionsEnded,
      revocationFailed,
    },
  });

  res.json({
    maintenance: after,
    settings: publicSettings(settings),
    message: enabled
      ? revocationFailed
        ? 'Maintenance mode is on. Non-admin sessions will be refused on their next request; admin recovery still works.'
        : sessionsEnded
          ? `Maintenance mode is on. ${sessionsEnded} other ${sessionsEnded === 1 ? 'session was' : 'sessions were'} signed out; admin recovery still works.`
          : 'Maintenance mode is on. No other sessions were open; admin recovery still works.'
      : 'Maintenance mode is off. The portal is open again.',
  });
});

export const testMail = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user.id);
  if (!admin?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const ok = await sendTestEmail({ to: admin.email, name: admin.name, transport: MAIL_TRANSPORT });
  if (!ok) {
    audit({ req, action: 'admin.settings_email_test', status: 'fail', targetType: 'settings', meta: { transport: MAIL_TRANSPORT } });
    throw new AppError(502, 'MAIL_FAILED', 'The mail service did not accept the test message. Check the server credentials.');
  }
  audit({ req, action: 'admin.settings_email_test', targetType: 'settings', meta: { transport: MAIL_TRANSPORT } });
  res.json({ message: `Test message sent to ${maskEmail(admin.email)}.`, transport: MAIL_TRANSPORT });
});
