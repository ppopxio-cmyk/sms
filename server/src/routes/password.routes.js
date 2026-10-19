import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { emailOnlySchema, verifyEmailSchema, resetPasswordSchema } from '../validators/auth.schemas.js';
import { forgotPassword, verifyResetCode, resetPassword } from '../controllers/password.controller.js';

const r = Router();

r.post('/forgot-password', codeLimiter, validate(emailOnlySchema), forgotPassword);
r.post('/verify-reset-code', codeLimiter, validate(verifyEmailSchema), verifyResetCode);
r.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);

export default r;
