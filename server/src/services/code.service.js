import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { VerificationCode } from '../models/VerificationCode.js';
import { AppError } from '../utils/AppError.js';

const MAX_TRIES = 5;
const RESEND_WAIT_MS = 60_000;

const keyed = (userId, purpose, code) =>
  crypto.createHmac('sha256', env.CODE_HMAC_SECRET).update(`${userId}:${purpose}:${code}`).digest('hex');

export async function issueCode(user, purpose) {
  const existing = await VerificationCode.findOne({ userId: user._id, purpose }).select('lastSentAt').lean();
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_WAIT_MS) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', 'Please wait a minute before asking for another code.');
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await VerificationCode.findOneAndUpdate(
    { userId: user._id, purpose },
    {
      codeHash: keyed(user._id, purpose, code),
      attempts: 0,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + env.CODE_TTL_MINUTES * 60_000),
    },
    { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' },
  );
  return code;
}

export async function checkCode(userId, purpose, code) {
  // Count the try first, in one atomic step, so parallel guesses cannot beat the limit.
  const rec = await VerificationCode.findOneAndUpdate({ userId, purpose }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
  if (!rec || rec.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'CODE_EXPIRED', 'That code has expired. Ask for a new one.');
  }
  if (rec.attempts > MAX_TRIES) {
    await rec.deleteOne();
    throw new AppError(429, 'CODE_LOCKED', 'Too many wrong tries. Ask for a new code.');
  }
  const given = Buffer.from(keyed(userId, purpose, code));
  const stored = Buffer.from(rec.codeHash);
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    throw new AppError(400, 'CODE_WRONG', 'That code is not right.');
  }
  await rec.deleteOne(); // a code works once
}
