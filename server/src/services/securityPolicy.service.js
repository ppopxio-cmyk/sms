import { AppError } from '../utils/AppError.js';
import { getSettings } from './settings.service.js';

// These are the same defaults the settings document ships with. They are repeated here
// so authentication keeps working if the settings document cannot be read during a
// database blip; the portal must not become impossible to sign in to because a policy
// lookup failed.
const DEFAULTS = {
  idleMinutes: 2880,
  absoluteDays: 30,
  lockoutAttempts: 3,
  lockoutMinutes: 15,
  minPasswordLength: 8,
  requireTwoStep: false,
  singleSession: false,
};

const whole = (value, min, max, fallback) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fallback;

// One place turns the stored settings into the small policy the login and session code
// needs. Bounds match the settings schema and validator, so a hand-edited database
// cannot make the portal unusable (for example by asking for a 1-character password).
export async function securityPolicy() {
  try {
    const settings = await getSettings();
    const security = settings?.security ?? {};
    return {
      idleMinutes: whole(security.idleMinutes, 5, 2880, DEFAULTS.idleMinutes),
      absoluteDays: whole(security.absoluteDays, 1, 365, DEFAULTS.absoluteDays),
      lockoutAttempts: whole(security.lockoutAttempts, 3, 20, DEFAULTS.lockoutAttempts),
      lockoutMinutes: whole(security.lockoutMinutes, 1, 1440, DEFAULTS.lockoutMinutes),
      minPasswordLength: whole(security.minPasswordLength, 8, 64, DEFAULTS.minPasswordLength),
      requireTwoStep: Boolean(security.requireTwoStep),
      singleSession: Boolean(security.singleSession),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function enforcePasswordPolicy(password) {
  const { minPasswordLength } = await securityPolicy();
  if (typeof password !== 'string' || password.length < minPasswordLength) {
    throw new AppError(
      400,
      'PASSWORD_TOO_SHORT',
      `Use at least ${minPasswordLength} characters for your password.`,
    );
  }
}

// Email preferences are checked at the point a message would be sent. A missing
// preference object means the account predates preferences, and the safe default there
// is to send security mail.
export function wantsSecurityEmail(user, settings) {
  if (settings?.email?.securityAlerts === false) return false;
  return user?.preferences?.emailSecurity !== false;
}

export function wantsInAppNotice(user, settings) {
  if (settings?.notifications?.inApp === false) return false;
  return user?.preferences?.inAppNotifications !== false;
}
