import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const make = (windowMs, limit) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a little and try again.')),
  });

export const globalLimiter = make(60_000, 300);
export const authLimiter = make(15 * 60_000, 20); // login, register, reset
export const codeLimiter = make(15 * 60_000, 15); // code checks and resends
export const exportLimiter = make(60_000, 8); // file generation is deliberately heavier

export const uploadLimiter = make(60_000, 20); // photo and document uploads
