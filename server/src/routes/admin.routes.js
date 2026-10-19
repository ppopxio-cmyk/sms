import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import {
  idParamSchema, createUserSchema, updateUserSchema, tempPasswordSchema, listUsersQuerySchema,
} from '../validators/auth.schemas.js';
import { listSessions, terminateSession } from '../controllers/admin.controller.js';
import {
  listUsers, createUser, updateUser, resendUserCode, setTempPassword, signOutUser, removeUser, sendResetLink,
} from '../controllers/users.controller.js';

const r = Router();

r.use(authenticate, requirePasswordChanged);

r.get('/sessions', requirePermission('sessions:view-all'), listSessions);
r.delete('/sessions/:id', requirePermission('sessions:terminate'), validate(idParamSchema, 'params'), terminateSession);

// Managing accounts and roles is the administrator's job. The permission list keeps
// it that way; nobody else can reach any of these routes.
r.get('/users', requirePermission('users:manage'), validate(listUsersQuerySchema, 'query'), listUsers);
r.post('/users', requirePermission('users:manage'), validate(createUserSchema), createUser);
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
r.post(
  '/users/:id/password',
  requirePermission('users:manage'),
  validate(idParamSchema, 'params'),
  validate(tempPasswordSchema),
  setTempPassword,
);
r.post('/users/:id/sign-out', requirePermission('users:manage'), validate(idParamSchema, 'params'), signOutUser);
r.delete('/users/:id', requirePermission('users:manage'), validate(idParamSchema, 'params'), removeUser);

export default r;
