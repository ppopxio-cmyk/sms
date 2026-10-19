import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.CLIENT_ORIGIN) {
    return next(new AppError(403, 'BAD_ORIGIN', 'That request was blocked.'));
  }
  if (req.get('x-requested-with') !== 'sms-web') {
    return next(new AppError(403, 'CSRF_BLOCKED', 'That request was blocked.'));
  }
  next();
}
