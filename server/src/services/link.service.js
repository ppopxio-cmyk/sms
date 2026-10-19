import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { VerificationCode } from '../models/VerificationCode.js';
import { AppError } from '../utils/AppError.js';
import { resendWaitMessage } from './code.service.js';
import { signTicket, readTicket } from './token.service.js';

// Confirming an email is done with a link, never a code. The row that remembers the link
// stays until it expires (see consumeVerifyLink), so the same two-minute wait applies as
// for codes without a scanner's first visit killing the link.
const VERIFY_PURPOSE = 'email_verify_link';
const RESEND_WAIT_MS = env.CODE_RESEND_WAIT_SECONDS * 1000;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

const LINK_INVALID = 'That link has expired or has already been used. Ask for a new one.';

// A reset link stops working the moment the password changes, because the password
// version moves. Same rule as the code wizard.
export const passwordVersion = (user) => user.passwordChangedAt?.getTime() ?? 0;

export async function issueVerifyLink(user) {
  const existing = await VerificationCode.findOne({ userId: user._id, purpose: VERIFY_PURPOSE })
    .select('lastSentAt')
    .lean();
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_WAIT_MS) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  }

  const jti = crypto.randomBytes(18).toString('base64url');
  const token = signTicket(user._id, 'email-verify', `${env.VERIFY_LINK_TTL_HOURS}h`, {
    email: user.email,
    jti,
  });

  await VerificationCode.findOneAndUpdate(
    { userId: user._id, purpose: VERIFY_PURPOSE },
    {
      codeHash: sha(jti),
      attempts: 0,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + env.VERIFY_LINK_TTL_HOURS * 60 * 60 * 1000),
    },
    { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' },
  );

  return token;
}

export async function consumeVerifyLink(token) {
  let payload;
  try {
    payload = readTicket(token, 'email-verify');
  } catch {
    throw new AppError(400, 'LINK_INVALID', LINK_INVALID);
  }

  const record = await VerificationCode.findOne({ userId: payload.sub, purpose: VERIFY_PURPOSE });
  const usable =
    record && record.codeHash === sha(payload.jti) && record.expiresAt.getTime() > Date.now();
  if (!usable) throw new AppError(400, 'LINK_INVALID', LINK_INVALID);

  // The row is deliberately left in place until it expires. Mail providers and company
  // security scanners open links before the person does, and a link that dies on that
  // first look never works for the one it was meant for. A second click unlocks nothing
  // extra: the address can only be confirmed once, and finishing the account needs the
  // short ticket that only the browser which clicked is given.
  return payload;
}

// Used by an administrator's "send reset link". Nothing is stored: the ticket dies
// with the password version like every other reset ticket.
export const issueResetLink = (user) =>
  signTicket(user._id, 'password-reset', `${env.RESET_LINK_TTL_MINUTES}m`, { v: passwordVersion(user) });

// Once the link in the inbox has been used, the address is confirmed but the account
// still has no name and no password. This short ticket is what lets that same browser
// finish the job. It stops working the moment a password exists, so it cannot be
// replayed by anybody who finds it later.
export const issueSetupTicket = (user) =>
  signTicket(user._id, 'account-setup', `${env.SETUP_TICKET_TTL_MINUTES}m`);

export function consumeSetupTicket(token) {
  try {
    return readTicket(token, 'account-setup');
  } catch {
    throw new AppError(400, 'SETUP_TICKET_INVALID', 'That step took too long. Ask for a new link from the sign-in page.');
  }
}
