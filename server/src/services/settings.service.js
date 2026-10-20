import { SystemSetting } from '../models/SystemSetting.js';
import { logger } from '../utils/logger.js';

// The settings document is read by every API call while maintenance mode is on, so a
// tiny in-process cache keeps that check cheap. Every write clears it immediately.
const CACHE_MS = 5_000;
let cache = { at: 0, settings: null };
let loading = null;

const BOOLEAN = ['maintenanceMode', 'allowAdminRecovery', 'announcementEmails', 'securityAlerts', 'inApp', 'emailAnnouncements', 'dailyDigest', 'maintenanceAlerts', 'requireTwoStep', 'singleSession'];

export async function loadSettings() {
  let doc = await SystemSetting.findOne({ key: 'global' });
  if (!doc) {
    try {
      doc = await SystemSetting.create({ key: 'global' });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      doc = await SystemSetting.findOne({ key: 'global' });
    }
  }
  return doc;
}

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.settings && Date.now() - cache.at < CACHE_MS) return cache.settings;
  if (loading) return loading;

  loading = (async () => {
    try {
      const doc = await loadSettings();
      cache = { at: Date.now(), settings: doc };
      return doc;
    } catch (err) {
      logger.error({ err: err.message }, 'system settings could not be read');
      if (cache.settings) return cache.settings;
      throw err;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function invalidateSettingsCache() {
  cache = { at: 0, settings: null };
}

export function maintenanceState(settings) {
  const system = settings?.system ?? {};
  const until = system.maintenanceUntil ? new Date(system.maintenanceUntil) : null;
  const expired = Boolean(until && until.getTime() <= Date.now());
  return {
    enabled: Boolean(system.maintenanceMode) && !expired,
    message: system.maintenanceMessage || 'The college portal is being updated. Please try again shortly.',
    until: until && !expired ? until : null,
    expired,
    allowAdminRecovery: system.allowAdminRecovery !== false,
  };
}

// A plain object for the browser. No credentials, connection strings or environment
// values are ever added here; SMTP/Gmail secrets stay in the server environment.
export function publicSettings(settings) {
  const doc = settings?.toObject ? settings.toObject() : settings;
  const safe = {
    institution: { ...(doc?.institution ?? {}) },
    security: { ...(doc?.security ?? {}) },
    email: { ...(doc?.email ?? {}) },
    notifications: { ...(doc?.notifications ?? {}) },
    localization: { ...(doc?.localization ?? {}) },
    system: { ...(doc?.system ?? {}) },
    updatedAt: doc?.updatedAt ?? null,
    maintenanceChangedAt: doc?.maintenanceChangedAt ?? null,
  };
  safe.maintenance = maintenanceState(safe);
  return safe;
}

// Only known sections and known keys are copied from a request. Unknown keys are
// ignored instead of being written into the database, and booleans are coerced only
// when they arrive as JSON booleans.
const SECTION_FIELDS = {
  institution: ['name', 'shortName', 'email', 'phone', 'website', 'address', 'city', 'region', 'country', 'establishedYear', 'motto'],
  security: ['idleMinutes', 'absoluteDays', 'lockoutAttempts', 'lockoutMinutes', 'minPasswordLength', 'requireTwoStep', 'singleSession'],
  email: ['announcementEmails', 'securityAlerts', 'replyTo', 'footer', 'batchSize'],
  notifications: ['inApp', 'emailAnnouncements', 'dailyDigest', 'maintenanceAlerts'],
  localization: ['language', 'calendar', 'timezone', 'dateFormat', 'weekStart', 'currency'],
  system: ['schoolYear', 'term', 'timeFormat', 'maintenanceMessage', 'maintenanceUntil', 'allowAdminRecovery'],
};

export function applySettingsPatch(settings, patch = {}) {
  const changed = {};
  for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
    if (!patch[section] || typeof patch[section] !== 'object') continue;
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(patch[section], field)) continue;
      let value = patch[section][field];
      if (BOOLEAN.includes(field) && typeof value !== 'boolean') continue;
      if (field === 'maintenanceUntil') value = value ? new Date(value) : null;
      settings[section][field] = value;
      changed[`${section}.${field}`] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return changed;
}

export async function getMaintenanceState() {
  try {
    const settings = await getSettings();
    return maintenanceState(settings);
  } catch {
    // A database outage must not look like normal operation for a request that only
    // needs to know whether the portal is open. Let the route fail naturally instead.
    return { enabled: false, message: '', until: null, expired: false, allowAdminRecovery: true };
  }
}
