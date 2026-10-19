import { env } from '../config/env.js';
import { issueVerifyLink, issueResetLink } from './link.service.js';
import { sendVerifyLinkEmail, sendResetLinkEmail } from './mail.service.js';
import { AppError } from '../utils/AppError.js';

const clientUrl = (path) => `${env.CLIENT_ORIGIN.replace(/\/+$/, '')}${path}`;

// The send is waited for on purpose. Saying "a link is on its way" when Google refused
// the message is how a broken mail setting stays invisible for a day. True means it
// really was handed over; WAIT_BEFORE_RESEND still comes back as a thrown 429, so a
// caller can tell "too soon" from "the mail server said no".
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
  if (!sent) throw MAIL_FAILED();
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
  if (!sent) throw MAIL_FAILED();
  return true;
}
