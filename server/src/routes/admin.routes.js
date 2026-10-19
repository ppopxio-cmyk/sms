import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParamSchema } from '../validators/auth.schemas.js';
import { listSessions, terminateSession } from '../controllers/admin.controller.js';

const r = Router();

r.use(authenticate);
r.get('/sessions', requirePermission('sessions:view-all'), listSessions);
r.delete('/sessions/:id', requirePermission('sessions:terminate'), validate(idParamSchema, 'params'), terminateSession);

export default r;
