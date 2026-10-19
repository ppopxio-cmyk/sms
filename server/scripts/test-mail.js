import { env } from '../src/config/env.js';
import { verifyMail, sendCodeEmail } from '../src/services/mail.service.js';

try {
  await verifyMail();
  console.log('Gmail login works.');
  const sent = await sendCodeEmail({ to: env.SMTP_USER, name: 'Test', code: '123456', purpose: 'login_2fa' });
  console.log(sent ? `Sample email sent to ${env.SMTP_USER}. Check the inbox and the spam folder.` : 'Sending failed. Read the error above.');
  process.exit(sent ? 0 : 1);
} catch (err) {
  console.error('Gmail login failed:', err.message);
  console.error('Check SMTP_USER and SMTP_APP_PASSWORD (16 letters, no spaces), and that 2-Step Verification is on for that Google account.');
  process.exit(1);
}
