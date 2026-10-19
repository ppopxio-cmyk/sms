import { issueCode } from './code.service.js';
import { sendCodeEmail } from './mail.service.js';

// Returns true when a code was sent, false when the one-minute wait is still running.
export async function sendCode(user, purpose) {
  try {
    const code = await issueCode(user, purpose);
    void sendCodeEmail({ to: user.email, name: user.name, code, purpose });
    return true;
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }
}
