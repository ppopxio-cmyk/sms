import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import {
  emailOnlySchema, verifyEmailSchema, loginSchema, loginVerifySchema, ticketSchema,
  setupAccountSchema, changePasswordSchema, sessionConfirmSchema, sessionNameSchema, idParamSchema, twoStepSchema,
  deletePasswordSchema, deleteAccountSchema, profileSchema, preferencesSchema,
} from '../validators/auth.schemas.js';
import {
  verifyEmail, setupAccount, resendVerification, login, loginVerify, loginResend,
  refresh, logout, me, heartbeat, changePassword, listMySessions, renameMySession,
  requestSessionCode, terminateMySession, setTwoStep, requestDeleteCode, deleteAccount,
  updateProfile, updatePreferences, myActivity,
} from '../controllers/auth.controller.js';
import { turnstile } from '../middleware/turnstile.js';

const r = Router();

// There is no self-registration on purpose: an administrator creates every account.
r.post('/verify-email', codeLimiter, validate(verifyEmailSchema), verifyEmail);
// Finishing that new account - its own name and password - right after the link is used.
r.post('/setup-account', authLimiter, validate(setupAccountSchema), setupAccount);
r.post('/resend-verification', codeLimiter, turnstile, validate(emailOnlySchema), resendVerification);

r.post('/login', authLimiter, turnstile, validate(loginSchema), login);
r.post('/login/verify', codeLimiter, validate(loginVerifySchema), loginVerify);
r.post('/login/resend', codeLimiter, validate(ticketSchema), loginResend);

r.post('/refresh', refresh);
r.post('/logout', logout);

r.get('/me', authenticate, me);
r.patch('/profile', authenticate, requirePasswordChanged, validate(profileSchema), updateProfile);
r.patch('/preferences', authenticate, requirePasswordChanged, validate(preferencesSchema), updatePreferences);
r.get('/activity', authenticate, requirePasswordChanged, myActivity);
r.post('/change-password', authLimiter, authenticate, validate(changePasswordSchema), changePassword);
r.post('/two-step', authLimiter, authenticate, requirePasswordChanged, validate(twoStepSchema), setTwoStep);
r.post('/delete-account/code', authLimiter, authenticate, requirePasswordChanged, validate(deletePasswordSchema), requestDeleteCode);
r.post('/delete-account', authLimiter, authenticate, requirePasswordChanged, validate(deleteAccountSchema), deleteAccount);
r.post('/heartbeat', authenticate, requirePasswordChanged, heartbeat);
r.get('/sessions', authenticate, requirePasswordChanged, listMySessions);
r.patch(
  '/sessions/:id/name',
  authenticate,
  requirePasswordChanged,
  validate(idParamSchema, 'params'),
  validate(sessionNameSchema),
  renameMySession,
);
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
