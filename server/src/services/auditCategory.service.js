import { not } from '../utils/mongo.js';

// Audit actions are stored as machine names ("admin.user_created"). The category is
// derived from that prefix so an export and the on-screen tabs always agree, including
// for actions added after this file was written.
export const AUDIT_CATEGORIES = ['signin', 'security', 'admin', 'settings', 'announcements', 'maintenance', 'account', 'export', 'other'];

const SIGNIN_RE = /^auth\.(login|logout|login_failed|email_verified|account_setup)/;
const MAINTENANCE_RE = /^admin\.maintenance/;
const SETTINGS_RE = /^admin\.settings/;
const ANNOUNCEMENT_RE = /^admin\.announcement/;

export function auditCategory(action = '') {
  if (SIGNIN_RE.test(action)) return 'signin';
  if (MAINTENANCE_RE.test(action)) return 'maintenance';
  if (SETTINGS_RE.test(action)) return 'settings';
  if (ANNOUNCEMENT_RE.test(action)) return 'announcements';
  if (/^export\./.test(action)) return 'export';
  if (/^admin\./.test(action)) return 'admin';
  if (/^auth\./.test(action)) return 'security';
  if (/^(user|notification)/.test(action)) return 'account';
  return 'other';
}

// The database expression used by the audit list. Keep it in step with auditCategory
// above: the list groups in Mongo, the feed labels in JavaScript.
export const auditCategoryExpression = {
  $switch: {
    branches: [
      {
        case: {
          $regexMatch: {
            input: '$action',
            regex: '^auth\\.(login|logout|login_failed|email_verified|account_setup)',
          },
        },
        then: 'signin',
      },
      { case: { $regexMatch: { input: '$action', regex: '^admin\\.maintenance' } }, then: 'maintenance' },
      { case: { $regexMatch: { input: '$action', regex: '^admin\\.settings' } }, then: 'settings' },
      { case: { $regexMatch: { input: '$action', regex: '^admin\\.announcement' } }, then: 'announcements' },
      { case: { $regexMatch: { input: '$action', regex: '^export\\.' } }, then: 'export' },
      { case: { $regexMatch: { input: '$action', regex: '^admin\\.' } }, then: 'admin' },
      { case: { $regexMatch: { input: '$action', regex: '^auth\\.' } }, then: 'security' },
      { case: { $regexMatch: { input: '$action', regex: '^(user|notification)' } }, then: 'account' },
    ],
    default: 'other',
  },
};

// A plain Mongo filter for exports. The audit list uses the aggregation expression above,
// but a normal find() is enough when there is no actor-name search to join.
export function auditCategoryFilter(category) {
  if (!category || category === 'all') return {};
  if (category === 'signin') return { action: SIGNIN_RE };
  if (category === 'export') return { action: /^export\./ };
  if (category === 'maintenance') return { action: MAINTENANCE_RE };
  if (category === 'settings') return { action: SETTINGS_RE };
  if (category === 'announcements') return { action: ANNOUNCEMENT_RE };
  // "admin" means administration that is not one of the three dedicated screens.
  if (category === 'admin') {
    return {
      $and: [{ action: /^admin\./ }, { action: not(MAINTENANCE_RE) }, { action: not(SETTINGS_RE) }, { action: not(ANNOUNCEMENT_RE) }],
    };
  }
  if (category === 'account') return { action: /^(user|notification)/ };
  if (category === 'security') {
    return {
      $and: [{ action: /^auth\./ }, { action: not(SIGNIN_RE) }],
    };
  }

  return {
    $nor: [
      { action: SIGNIN_RE },
      { action: /^export\./ },
      { action: MAINTENANCE_RE },
      { action: SETTINGS_RE },
      { action: ANNOUNCEMENT_RE },
      { action: /^admin\./ },
      { action: /^auth\./ },
      { action: /^(user|notification)/ },
    ],
  };
}
