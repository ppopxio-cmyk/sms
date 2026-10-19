import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  registerSchema, emailOnlySchema, verifyEmailSchema, loginSchema,
  loginVerifySchema, ticketSchema, idParamSchema,
} from '../validators/auth.schemas.js';
import {
  register, verifyEmail, resendVerification, login, loginVerify, loginResend,
  refresh, logout, me, heartbeat, listMySessions, revokeMySession,
} from '../controllers/auth.controller.js';

const r = Router();

r.post('/register', authLimiter, validate(registerSchema), register);
r.post('/verify-email', codeLimiter, validate(verifyEmailSchema), verifyEmail);
r.post('/resend-verification', codeLimiter, validate(emailOnlySchema), resendVerification);

r.post('/login', authLimiter, validate(loginSchema), login);
r.post('/login/verify', codeLimiter, validate(loginVerifySchema), loginVerify);
r.post('/login/resend', codeLimiter, validate(ticketSchema), loginResend);

r.post('/refresh', refresh);
r.post('/logout', logout);

r.get('/me', authenticate, me);
r.post('/heartbeat', authenticate, heartbeat);
r.get('/sessions', authenticate, listMySessions);
r.delete('/sessions/:id', authenticate, validate(idParamSchema, 'params'), revokeMySession);

export default r;
