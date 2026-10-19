import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import {
  emailOnlySchema, verifyEmailSchema, loginSchema, loginVerifySchema, ticketSchema,
  changePasswordSchema, sessionConfirmSchema, idParamSchema,
} from '../validators/auth.schemas.js';
import {
  verifyEmail, resendVerification, login, loginVerify, loginResend,
  refresh, logout, me, heartbeat, changePassword, listMySessions,
  requestSessionCode, terminateMySession,
} from '../controllers/auth.controller.js';

const r = Router();

// There is no self-registration on purpose: an administrator creates every account.
r.post('/verify-email', codeLimiter, validate(verifyEmailSchema), verifyEmail);
r.post('/resend-verification', codeLimiter, validate(emailOnlySchema), resendVerification);

r.post('/login', authLimiter, validate(loginSchema), login);
r.post('/login/verify', codeLimiter, validate(loginVerifySchema), loginVerify);
r.post('/login/resend', codeLimiter, validate(ticketSchema), loginResend);

r.post('/refresh', refresh);
r.post('/logout', logout);

r.get('/me', authenticate, me);
r.post('/change-password', authLimiter, authenticate, validate(changePasswordSchema), changePassword);
r.post('/heartbeat', authenticate, requirePasswordChanged, heartbeat);
r.get('/sessions', authenticate, requirePasswordChanged, listMySessions);
r.post(
  '/sessions/:id/code',
  authenticate,
  requirePasswordChanged,
  codeLimiter,
  validate(idParamSchema, 'params'),
  requestSessionCode,
);
r.post(
  '/sessions/:id/terminate',
  authenticate,
  requirePasswordChanged,
  codeLimiter,
  validate(idParamSchema, 'params'),
  validate(sessionConfirmSchema),
  terminateMySession,
);

export default r;
