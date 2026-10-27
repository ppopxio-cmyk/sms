import { env } from '../config/env.js';
import { issueVerifyLink, issueResetLink } from './link.service.js';
import { sendVerifyLinkEmail, sendResetLinkEmail } from './mail.service.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const clientUrl = (path) => `${env.CLIENT_ORIGIN.replace(/\/+$/, '')}${path}`;

// A failed email send is surfaced to the user as a recoverable 503 so they can retry from
// the sign-in or reset page. We keep the explicit throw so the controller can distinguish
// "mail is down now" from "resend is still on cooldown" (which comes back as 429).
const MAIL_FAILED = () =>
  new AppError(503, 'MAIL_FAILED', 'The email could not be sent just now. Check the mail settings and try again.');

export async function deliverVerifyLink(user) {
  const token = await issueVerifyLink(user);
  const sent = await sendVerifyLinkEmail({
    to: user.email,
    name: user.name,
    url: clientUrl(`/verify-email?token=${encodeURIComponent(token)}`),
    hours: env.VERIFY_LINK_TTL_HOURS,
  });
  if (!sent) {
    logger.warn({ to: user.email }, 'Verify link email could not be sent');
    throw MAIL_FAILED();
  }
  return true;
}

export async function deliverResetLink(user) {
  const token = issueResetLink(user);
  const sent = await sendResetLinkEmail({
    to: user.email,
    name: user.name,
    url: clientUrl(`/forgot-password?token=${encodeURIComponent(token)}`),
    minutes: env.RESET_LINK_TTL_MINUTES,
  });
  if (!sent) {
    logger.warn({ to: user.email }, 'Reset link email could not be sent');
    throw MAIL_FAILED();
  }
  return true;
}
