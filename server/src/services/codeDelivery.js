import { issueCode } from './code.service.js';
import { sendCodeEmail } from './mail.service.js';
import { User } from '../models/User.js';
import { VerificationCode } from '../models/VerificationCode.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

// Returns true when a code was sent, false when the resend wait is still running.
export async function sendCode(user, purpose) {
  let userObj = user;
  if (typeof user === 'string') {
    const found = (await User.findById(user).lean()) || (await User.findOne({ email: user.toLowerCase() }).lean());
    if (found) userObj = found;
    else userObj = { _id: user, email: user };
  }

  // 1. Issue code in database
  let code;
  try {
    code = await issueCode(userObj, purpose);
  } catch (err) {
    if (err.code === 'WAIT_BEFORE_RESEND') return false;
    throw err;
  }

  // 2. Dispatch email immediately
  try {
    const sent = await sendCodeEmail({
      to: userObj.email,
      name: userObj.name || userObj.fullName || userObj.email?.split('@')[0],
      code,
      purpose,
    });

    if (!sent) {
      logger.warn({ to: userObj.email, purpose }, 'Verification code email could not be sent by mail service');
      // CRITICAL FIX: If email could not be sent, remove the code from the database
      // so the user is NOT locked out for 2 minutes by WAIT_BEFORE_RESEND!
      await VerificationCode.deleteOne({ userId: userObj._id, purpose }).catch(() => {});
      throw new AppError(
        503,
        'MAIL_DELIVERY_FAILED',
        'Could not send verification email. Please check that the email service is configured correctly.',
      );
    }

    return true;
  } catch (err) {
    // If sending failed, clean up the verification code so the user is not locked out
    await VerificationCode.deleteOne({ userId: userObj._id, purpose }).catch(() => {});
    if (err instanceof AppError) throw err;
    logger.error({ err: err.message, to: userObj.email, purpose }, 'Failed to deliver verification code');
    throw new AppError(
      503,
      'MAIL_DELIVERY_FAILED',
      `Could not send verification email: ${err.message || 'Mail service error'}`,
    );
  }
}
