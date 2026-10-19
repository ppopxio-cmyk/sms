import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { VerificationCode } from '../models/VerificationCode.js';
import { AppError } from '../utils/AppError.js';
import { resendWaitMessage } from './code.service.js';
import { signTicket, readTicket } from './token.service.js';

// Confirming an email is done with a link, not a six-digit code. The link is a signed
// ticket that carries a random id (jti); the hash of that id sits in the
// VerificationCode row, which is what makes the link single use and what remembers
// when it was last sent, so the same two-minute wait applies as for codes.
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

  await record.deleteOne();
  return payload;
}

// Used by an administrator's "send reset link". Nothing is stored: the ticket dies
// with the password version like every other reset ticket.
export const issueResetLink = (user) =>
  signTicket(user._id, 'password-reset', `${env.RESET_LINK_TTL_MINUTES}m`, { v: passwordVersion(user) });
