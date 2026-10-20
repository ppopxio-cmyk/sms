import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

// Cloudflare Turnstile answers one question: was this request sent by a person using a
// browser, or by a script? The widget on the page leaves a short-lived token in a header,
// and the only way to know whether it is genuine is to ask Cloudflare, with the secret.
//
// The secret never leaves the server. When it is absent the check is skipped, which is what
// local development and a not-yet-configured deployment need; production logs a warning.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const HEADER = 'cf-turnstile-response';

export const turnstileEnabled = Boolean(env.TURNSTILE_SECRET_KEY);

if (!turnstileEnabled && env.NODE_ENV === 'production') {
  logger.warn('Turnstile is not configured: the sign-in, reset and resend screens are unguarded.');
}

export async function turnstile(req, res, next) {
  if (!turnstileEnabled) return next();

  const token = String(req.get(HEADER) || '').trim();
  if (!token) {
    return next(new AppError(400, 'CAPTCHA_REQUIRED', 'Please complete the "I am human" check, then try again.'));
  }

  let data;
  try {
    const body = new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: req.ip || '',
    });
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    data = await response.json();
  } catch (err) {
    // Cloudflare being unreachable is not the visitor's fault, and locking the whole school
    // out over it would be worse than letting this one request through. It is logged.
    logger.warn({ err: err.message }, 'the human check could not be reached; letting this request through');
    return next();
  }

  if (!data?.success) {
    const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].join(',') : 'unknown';
    logger.warn({ codes }, 'the human check did not pass');
    return next(new AppError(400, 'CAPTCHA_FAILED', 'That check did not pass. Please try it again.'));
  }

  return next();
}
