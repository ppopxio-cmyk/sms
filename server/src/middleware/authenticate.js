import { verifyAccess } from '../services/token.service.js';
import { isSessionActive } from '../services/session.service.js';
import { AppError } from '../utils/AppError.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'NO_TOKEN', 'Please sign in.');

    let payload;
    try {
      payload = verifyAccess(token);
    } catch (err) {
      const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      throw new AppError(401, code, 'Please sign in again.');
    }

    if (!(await isSessionActive(payload.sid, payload.sub))) {
      throw new AppError(401, 'SESSION_ENDED', 'This session was ended. Please sign in again.');
    }
    req.user = { id: payload.sub, role: payload.role, sid: payload.sid };
    next();
  } catch (err) {
    next(err);
  }
}
