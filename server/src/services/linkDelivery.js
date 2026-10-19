import { env } from '../config/env.js';
import { issueVerifyLink, issueResetLink } from './link.service.js';
import { sendVerifyLinkEmail, sendResetLinkEmail } from './mail.service.js';

const clientUrl = (path) => `${env.CLIENT_ORIGIN.replace(/\/+$/, '')}${path}`;

// Returns true when a link went out, false while the wait before another one is still
// running. Callers that must not leak whether an address exists can ignore the result.
export async function deliverVerifyLink(user) {
  try {
    const token = await issueVerifyLink(user);
    void sendVerifyLinkEmail({
      to: user.email,
      name: user.name,
      url: clientUrl(`/verify-email?token=${encodeURIComponent(token)}`),
      hours: env.VERIFY_LINK_TTL_HOURS,
    });
    return true;
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }
}

export async function deliverResetLink(user) {
  const token = issueResetLink(user);
  void sendResetLinkEmail({
    to: user.email,
    name: user.name,
    url: clientUrl(`/forgot-password?token=${encodeURIComponent(token)}`),
    minutes: env.RESET_LINK_TTL_MINUTES,
  });
  return true;
}
