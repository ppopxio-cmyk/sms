import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { searchQuerySchema } from '../validators/auth.schemas.js';
import { search } from '../controllers/search.controller.js';

const r = Router();

r.use(authenticate, requirePasswordChanged);

// The header only asks once typing has paused, and never for a single letter, so this stays
// cheap. There is no filter here to forget: what may be seen is decided by the role.
r.get('/', validate(searchQuerySchema, 'query'), search);

export default r;
