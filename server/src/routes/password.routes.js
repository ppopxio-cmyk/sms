import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { emailOnlySchema, verifyResetCodeSchema, resetPasswordSchema } from '../validators/auth.schemas.js';
import { forgotPassword, verifyResetCode, resetPassword } from '../controllers/password.controller.js';
import { turnstile } from '../middleware/turnstile.js';

const r = Router();

r.post('/forgot-password', codeLimiter, turnstile, validate(emailOnlySchema), forgotPassword);
r.post('/verify-reset-code', codeLimiter, validate(verifyResetCodeSchema), verifyResetCode);
r.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);

export default r;
