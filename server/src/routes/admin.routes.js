import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  idParamSchema, createUserSchema, updateUserSchema, removeUserSchema, listUsersQuerySchema,
} from '../validators/auth.schemas.js';
import {
  overviewQuerySchema, listSessionsQuerySchema, listAuditQuerySchema,
  exportUsersQuerySchema, exportSessionsQuerySchema, exportAuditQuerySchema,
} from '../validators/admin.schemas.js';
import {
  getOverview, listSessions, terminateSession, listAuditLogs,
} from '../controllers/admin.controller.js';
import {
  exportUsers, exportSessions, exportAuditLogs,
} from '../controllers/export.controller.js';
import {
  listUsers, createUser, updateUser, resendUserCode, signOutUser, removeUser, sendResetLink,
} from '../controllers/users.controller.js';
import { exportLimiter } from '../middleware/rateLimit.js';

const r = Router();

r.use(authenticate, requirePasswordChanged);

r.get('/overview', requirePermission('dashboard:view'), validate(overviewQuerySchema, 'query'), getOverview);
r.get('/audit-logs/export', exportLimiter, requirePermission('audit:read'), validate(exportAuditQuerySchema, 'query'), exportAuditLogs);
r.get('/audit-logs', requirePermission('audit:read'), validate(listAuditQuerySchema, 'query'), listAuditLogs);

r.get('/sessions/export', exportLimiter, requirePermission('sessions:view-all'), validate(exportSessionsQuerySchema, 'query'), exportSessions);
r.get('/sessions', requirePermission('sessions:view-all'), validate(listSessionsQuerySchema, 'query'), listSessions);
r.delete('/sessions/:id', requirePermission('sessions:terminate'), validate(idParamSchema, 'params'), terminateSession);

// Managing accounts and roles is the administrator's job. The permission list keeps
// it that way; nobody else can reach any of these routes.
r.get('/users/export', exportLimiter, requirePermission('users:manage'), validate(exportUsersQuerySchema, 'query'), exportUsers);
r.get('/users', requirePermission('users:manage'), validate(listUsersQuerySchema, 'query'), listUsers);
r.post('/users', requirePermission('users:manage'), validate(createUserSchema), createUser);
// Editing an account is turning it on or off; removing it keeps the record but hides
// it. Both ask for the administrator's own password in the body.
r.patch(
  '/users/:id',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  updateUser,
);
r.post(
  '/users/:id/resend-verification',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  resendUserCode,
);
// For somebody who confirmed their email but lost access: a link, not a password we
// hand out. Once the email is confirmed, only that person can choose a password.
r.post(
  '/users/:id/reset-link',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  sendResetLink,
);
r.post('/users/:id/sign-out', requirePermission('users:manage'), validate(idParamSchema, 'params'), signOutUser);
r.delete(
  '/users/:id',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(removeUserSchema),
  removeUser,
);

export default r;
