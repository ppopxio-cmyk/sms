import { verifyAccess } from '../services/token.service.js';
import { isSessionActive } from '../services/session.service.js';
import { userFlags } from '../services/user.service.js';
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

    // A disabled or removed account loses access on the next request, not when the
    // token happens to run out. The check is cached for 30 seconds and cleared the
    // moment an administrator turns somebody off.
    const flags = await userFlags(payload.sub);
    if (!flags || flags.status === 'disabled' || flags.deleted) {
      throw new AppError(401, 'SESSION_ENDED', 'This account is not available. Please contact the administrator.');
    }

    req.user = { id: payload.sub, role: payload.role, sid: payload.sid, mustChangePassword: flags.mustChangePassword };
    next();
  } catch (err) {
    next(err);
  }
}

// An account created by an administrator starts with a temporary password. Until its
// owner chooses their own, everything except signing out, changing that password, and
// reading their own account is closed.
export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Choose your own password before you carry on.'));
  }
  next();
}
