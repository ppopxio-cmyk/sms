import { getMaintenanceState } from '../services/settings.service.js';

const ALLOWED_PREFIXES = ['/api/auth', '/api/health', '/api/status'];

// Maintenance mode is enforced here, not in the sidebar. Authentication, health checks
// and the admin recovery surface stay open; every other API answers 503 with a stable
// code the browser can recognise. Existing sessions are untouched, so switching the
// portal back on does not sign anybody out.
export async function maintenanceGuard(req, res, next) {
  const path = String(req.originalUrl || req.url || '').split('?')[0];

  if (ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

  const state = await getMaintenanceState();
  if (!state.enabled) return next();

  // Admin recovery is deliberately allowed through to the normal authentication and
  // role checks. A non-admin who reaches /api/admin still receives 403 there.
  if (state.allowAdminRecovery && path.startsWith('/api/admin')) return next();

  const body = {
    error: {
      code: 'MAINTENANCE',
      message: state.message,
    },
    code: 'MAINTENANCE',
    message: state.message,
    maintenance: {
      enabled: true,
      until: state.until,
    },
  };

  if (state.until) {
    const seconds = Math.max(1, Math.ceil((new Date(state.until).getTime() - Date.now()) / 1000));
    res.setHeader('Retry-After', String(seconds));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(503).json(body);
}
