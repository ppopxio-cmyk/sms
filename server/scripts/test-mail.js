import { env } from '../src/config/env.js';
import { MAIL_TRANSPORT, verifyMail, sendCodeEmail } from '../src/services/mail.service.js';

const HINTS = {
  'gmail-api': 'Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN. Run npm run google:token to make a fresh refresh token.',
  smtp: 'Check SMTP_USER and SMTP_APP_PASSWORD (16 letters, no spaces), and that 2-Step Verification is on for that Google account.',
};

console.log(`Sending through: ${MAIL_TRANSPORT}`);

try {
  const checked = await verifyMail();
  if (MAIL_TRANSPORT === 'gmail-api') {
    console.log(`Google accepted the credentials for ${checked.address}.`);
    if (checked.scope) console.log(`Authorised scope: ${checked.scope}`);
  } else {
    console.log('Gmail login works.');
  }

  const sent = await sendCodeEmail({ to: env.SMTP_USER, name: 'Test', code: '123456', purpose: 'login_2fa' });
  console.log(sent ? `Sample email sent to ${env.SMTP_USER}. Check the inbox and the spam folder.` : 'Sending failed. Read the error above.');
  process.exit(sent ? 0 : 1);
} catch (err) {
  console.error(`${MAIL_TRANSPORT} failed:`, err.message);
  console.error(HINTS[MAIL_TRANSPORT]);
  process.exit(1);
}
