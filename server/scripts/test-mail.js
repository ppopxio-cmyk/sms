import 'dotenv/config';
import { env, gmailApiReady } from '../src/config/env.js';
import { sendTestEmail, verifyMail } from '../src/services/mail.service.js';
import { checkGmailApi } from '../src/services/gmailTransport.js';

console.log('=== EMAIL CONFIGURATION TEST ===');
console.log('SMTP_USER:', env.SMTP_USER);
console.log('SMTP_APP_PASSWORD:', env.SMTP_APP_PASSWORD ? 'Configured (length: ' + env.SMTP_APP_PASSWORD.length + ')' : 'NOT SET');
console.log('GOOGLE_CLIENT_ID:', env.GOOGLE_CLIENT_ID ? 'Configured' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'NOT SET');
console.log('GOOGLE_REFRESH_TOKEN:', env.GOOGLE_REFRESH_TOKEN ? 'Configured' : 'NOT SET');
console.log('GMAIL_API_READY:', gmailApiReady);
console.log('');

console.log('1. Testing SMTP transport verification...');
try {
  await verifyMail();
  console.log('   ✅ SMTP connection and authentication verified successfully.');
} catch (err) {
  console.log('   ❌ SMTP verification failed:', err.message);
}

if (gmailApiReady) {
  console.log('\n2. Testing Gmail API OAuth2 token exchange...');
  try {
    const info = await checkGmailApi();
    console.log('   ✅ Gmail API OAuth2 verified successfully for account:', info.address);
  } catch (err) {
    console.log('   ❌ Gmail API failed:', err.message);
  }
}

const targetEmail = process.argv[2] || env.SMTP_USER;
console.log(`\n3. Sending test email to ${targetEmail}...`);
try {
  const result = await sendTestEmail({
    to: targetEmail,
    name: 'Admin / Tester',
    transport: 'Verification test',
  });
  console.log('   Result:', result ? '✅ Test email sent successfully!' : '❌ Failed to deliver test email.');
} catch (err) {
  console.log('   ❌ Exception while sending test email:', err.message);
}

process.exit(0);
