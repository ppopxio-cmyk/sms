import { Router } from 'express';
import { authLimiter, codeLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import {
  emailOnlySchema, verifyEmailSchema, loginSchema, loginVerifySchema, ticketSchema,
  setupAccountSchema, changePasswordSchema, sessionConfirmSchema, idParamSchema, twoStepSchema,
  deletePasswordSchema, deleteAccountSchema, googleSignInSchema,
} from '../validators/auth.schemas.js';
import {
  verifyEmail, setupAccount, resendVerification, login, loginVerify, loginResend,
  googleConfig, googleSignIn,
  refresh, logout, me, heartbeat, changePassword, listMySessions,
  requestSessionCode, terminateMySession, setTwoStep, requestDeleteCode, deleteAccount,
} from '../controllers/auth.controller.js';

const r = Router();

// There is no self-registration on purpose: an administrator creates every account.
r.post('/verify-email', codeLimiter, validate(verifyEmailSchema), verifyEmail);
// Finishing that new account - its own name and password - right after the link is used.
r.post('/setup-account', authLimiter, validate(setupAccountSchema), setupAccount);
r.post('/resend-verification', codeLimiter, validate(emailOnlySchema), resendVerification);

r.post('/login', authLimiter, validate(loginSchema), login);
r.post('/login/verify', codeLimiter, validate(loginVerifySchema), loginVerify);
r.post('/login/resend', codeLimiter, validate(ticketSchema), loginResend);

// Signing in with Google. The browser needs the public client id to draw the button, and
// it is the same value the server checks every token against.
r.get('/google/config', googleConfig);
r.post('/google', authLimiter, validate(googleSignInSchema), googleSignIn);

r.post('/refresh', refresh);
r.post('/logout', logout);

r.get('/me', authenticate, me);
r.post('/change-password', authLimiter, authenticate, validate(changePasswordSchema), changePassword);
r.post('/two-step', authLimiter, authenticate, requirePasswordChanged, validate(twoStepSchema), setTwoStep);
r.post('/delete-account/code', authLimiter, authenticate, requirePasswordChanged, validate(deletePasswordSchema), requestDeleteCode);
r.post('/delete-account', authLimiter, authenticate, requirePasswordChanged, validate(deleteAccountSchema), deleteAccount);
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
