import { isAllowedOrigin } from '../utils/origin.js';
import { AppError } from '../utils/AppError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Two independent checks, so a browser trick that defeats one does not defeat both:
//   1. the request must come from our own site (see isAllowedOrigin)
//   2. it must carry a custom header, which a cross-site form post cannot set
//      without a CORS preflight, and CORS only allows origins we trust.
export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();

  const origin = req.get('origin');
  if (!isAllowedOrigin(req, origin)) {
    return next(new AppError(403, 'BAD_ORIGIN', 'That request came from a different address, so it was blocked.'));
  }
  if (req.get('x-requested-with') !== 'sms-web') {
    return next(new AppError(403, 'CSRF_BLOCKED', 'That request was missing a required security header, so it was blocked.'));
  }
  next();
}
