import { getMaintenanceState } from '../services/settings.service.js';
import { verifyAccess } from '../services/token.service.js';
import { isSessionActive, revokeSession } from '../services/session.service.js';

// Only the doors needed to sign in, finish an invitation, recover a password or clear a
// cookie stay open. The personal `/api/auth/me`, `/sessions`, `/heartbeat` and profile
// endpoints are not public: an ordinary account must be refused there too.
const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/verify-email',
  '/api/auth/setup-account',
  '/api/auth/resend-verification',
  '/api/auth/forgot-password',
  '/api/auth/verify-reset-code',
  '/api/auth/reset-password',
  '/api/health',
  '/api/status',
];

function readAccess(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return verifyAccess(header.slice(7));
  } catch {
    return null;
  }
}

// The guard runs before the normal route authentication. During a closure an
// administrator still has to be able to read their notifications, open settings and
// repair the portal, so a valid Admin bearer token is checked here too. Everybody else
// is stopped at the edge. A non-admin token is also revoked on its first request, which
// signs out people who were already inside when the portal closed.
async function isAdminRecovery(payload, state) {
  if (!state.allowAdminRecovery || !payload || payload.role !== 'ADMIN') return false;
  return isSessionActive(payload.sid, payload.sub);
}

export async function maintenanceGuard(req, res, next) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];

  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

  const state = await getMaintenanceState();
  if (!state.enabled) return next();

  const payload = readAccess(req);
  if (await isAdminRecovery(payload, state)) return next();

  if (payload?.sid && payload.role !== 'ADMIN') {
    await revokeSession(payload.sid, { reason: 'maintenance_mode' }).catch(() => {});
  }

  const body = {
    error: {
      code: 'MAINTENANCE',
      message: state.message,
    },
    code: 'MAINTENANCE',
    message: state.message,
    maintenance: {
      enabled: true,
      message: state.message,
      until: state.until,
      allowAdminRecovery: state.allowAdminRecovery,
    },
  };

  if (state.until) {
    const seconds = Math.max(1, Math.ceil((new Date(state.until).getTime() - Date.now()) / 1000));
    res.setHeader('Retry-After', String(seconds));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(503).json(body);
}
