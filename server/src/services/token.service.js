import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const ISSUER = 'sms-api';
const sign = (payload, options) => jwt.sign(payload, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', issuer: ISSUER, ...options });

export const signAccess = (user, sessionId) =>
  sign({ role: user.role, sid: String(sessionId) }, { subject: String(user._id), audience: 'sms-access', expiresIn: env.ACCESS_TOKEN_TTL });

export const verifyAccess = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: 'sms-access' });

// Short-lived one-purpose tickets: 'login-2fa' and 'password-reset'.
// A ticket can never be used as an access token, because the audience differs.
export const signTicket = (userId, purpose, expiresIn, extra = {}) =>
  sign({ purpose, ...extra }, { subject: String(userId), audience: 'sms-ticket', expiresIn });

export function readTicket(token, purpose) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: 'sms-ticket' });
    if (payload.purpose !== purpose) throw new Error('wrong purpose');
    return payload;
  } catch {
    throw new AppError(401, 'TICKET_INVALID', 'That step has expired. Please start again.');
  }
}

export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
