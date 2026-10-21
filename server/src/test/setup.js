// Test configuration sets every required value before the application modules run. The
// values are local and fake; tests use an isolated in-memory MongoDB and never touch the
// development or production database.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sms-teacher-test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'teacher-test-access-secret-0123456789abcdef';
process.env.CODE_HMAC_SECRET = process.env.CODE_HMAC_SECRET || 'teacher-test-code-secret-0123456789abcdef';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
process.env.SMTP_USER = process.env.SMTP_USER || 'teacher-test@example.com';
process.env.SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD || 'test-app-password';
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'test-vapid-public-key';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'test-vapid-private-key';
process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:teacher-test@example.com';
process.env.TURNSTILE_SECRET_KEY = '';
