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

// Environment values copied from a dashboard can carry a trailing newline or a pair of
// quotes. Cloudflare treats those characters as part of the secret, so trim them here
// rather than rejecting every visitor because of an invisible character.
const secret = String(env.TURNSTILE_SECRET_KEY || '')
  .trim()
  .replace(/^(['"])(.*)\1$/, '$2');

// Local development should not depend on a Cloudflare widget that may not allow the
// localhost origin. Production keeps the check. A production build served from localhost
// still has a site key on the client, so the widget is visible, but the API accepts it
// without asking Cloudflare unless NODE_ENV is production.
export const turnstileEnabled = Boolean(secret) && env.NODE_ENV === 'production';

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
      secret,
      response: token,
      // No remoteip. The address this API sees is the proxy in front of it, and a
      // mismatched address can make Cloudflare reject an otherwise valid token. The
      // token itself is already tied to the browser that solved the challenge.
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
    const rawCodes = Array.isArray(data?.['error-codes']) ? data['error-codes'] : ['unknown'];
    const codes = rawCodes.join(',');

    // A bad or missing secret is our configuration mistake, not evidence that this visitor
    // is a bot. Fail open with a loud log so a pasted-wrong key cannot lock the school out.
    if (rawCodes.some((code) => code === 'invalid-input-secret' || code === 'missing-input-secret')) {
      logger.error({ codes }, 'Turnstile secret is invalid; letting this request through until it is fixed');
      return next();
    }

    logger.warn(
      { codes, hostname: data?.hostname || null, action: data?.action || null },
      'the human check did not pass',
    );
    return next(new AppError(400, 'CAPTCHA_FAILED', 'That check did not pass. Please try it again.'));
  }

  return next();
}
