import { issueCode } from './code.service.js';
import { sendCodeEmail } from './mail.service.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

// Returns true when a code was sent, false when the resend wait is still running.
export async function sendCode(user, purpose) {
  try {
    let userObj = user;
    if (typeof user === 'string') {
      const found = (await User.findById(user).lean()) || (await User.findOne({ email: user.toLowerCase() }).lean());
      if (found) userObj = found;
      else userObj = { _id: user, email: user };
    }
    const code = await issueCode(userObj, purpose);

    // Dispatch email immediately with high priority.
    // We await the full send so the caller always knows whether the email actually left.
    // A bare fire-and-forget would make the 429 logic (WAIT_BEFORE_RESEND) unreliable
    // because the controller needs the boolean result to decide whether to allow another resend.
    const sent = await sendCodeEmail({
      to: userObj.email,
      name: userObj.name || userObj.fullName || userObj.email?.split('@')[0],
      code,
      purpose,
    });
    if (!sent) {
      logger.warn({ to: userObj.email, purpose }, 'Verification code email could not be sent');
    }
    return sent !== false;
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }
}
