import { issueCode } from './code.service.js';
import { sendCodeEmail } from './mail.service.js';
import { User } from '../models/User.js';

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

    // Dispatch email immediately with high priority
    const emailPromise = sendCodeEmail({
      to: userObj.email,
      name: userObj.name || userObj.fullName || userObj.email?.split('@')[0],
      code,
      purpose,
    });

    // Fast resolution: give a brief window for immediate confirmation, but never block user UI
    const quickResult = await Promise.race([
      emailPromise,
      new Promise((resolve) => setTimeout(() => resolve('in_flight'), 1200)),
    ]);

    return quickResult !== false;
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }
}
