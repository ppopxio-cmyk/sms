import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  idParamSchema,
  listNotificationsQuerySchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from '../validators/auth.schemas.js';
import {
  list, unreadCount, markRead, markAllRead, remove, clearAll,
  streamTicket, stream, pushStatus, subscribe, unsubscribe,
} from '../controllers/notifications.controller.js';

const r = Router();

// The live stream authenticates itself with a 60-second ticket, because EventSource
// cannot send headers. It is the only route here without a bearer token.
r.get('/stream', stream);

r.use(authenticate, requirePasswordChanged);

r.get('/', validate(listNotificationsQuerySchema, 'query'), list);
r.delete('/', clearAll);

r.get('/unread', unreadCount);
r.post('/read-all', markAllRead);
r.post('/stream-ticket', streamTicket);

r.get('/push/status', pushStatus);
r.post('/push/subscribe', validate(pushSubscribeSchema), subscribe);
r.post('/push/unsubscribe', validate(pushUnsubscribeSchema), unsubscribe);

r.post('/:id/read', validate(idParamSchema, 'params'), markRead);
r.delete('/:id', validate(idParamSchema, 'params'), remove);

export default r;
