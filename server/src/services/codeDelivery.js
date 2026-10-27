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
    const sent = await sendCodeEmail({
      to: userObj.email,
      name: userObj.name || userObj.fullName || userObj.email?.split('@')[0],
      code,
      purpose,
    });
    return sent !== false;
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }
}
