import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const serverEnv = fileURLToPath(new URL('../.env', import.meta.url));
const clientEnv = fileURLToPath(new URL('../../client/.env', import.meta.url));

if (fs.existsSync(serverEnv)) {
  console.log('server/.env already exists. Delete it first if you really want new keys (everyone will be signed out).');
  process.exit(1);
}

const secret = () => crypto.randomBytes(48).toString('hex');
const vapid = webpush.generateVAPIDKeys();

const lines = [
  'NODE_ENV=development',
  'PORT=5000',
  'CLIENT_ORIGIN=http://localhost:5173',
  'TRUST_PROXY=0',
  '',
  '# You fill these three yourself',
  'MONGODB_URI=',
  'SMTP_USER=',
  'SMTP_APP_PASSWORD=',
  'MAIL_FROM_NAME=School Management System',
  '',
  '# Generated for you, do not share',
  `JWT_ACCESS_SECRET=${secret()}`,
  `CODE_HMAC_SECRET=${secret()}`,
  `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  'VAPID_SUBJECT=mailto:haile12michaell@gmail.com',
  '',
  '# Tuning',
  'ACCESS_TOKEN_TTL=10m',
  'REFRESH_TTL_DAYS=7',
  'REFRESH_ABSOLUTE_DAYS=30',
  'CODE_TTL_MINUTES=5',
  'MAX_DEVICES_USER=3',
  'MAX_DEVICES_ADMIN=2',
];

fs.writeFileSync(serverEnv, lines.join(os.EOL) + os.EOL, { mode: 0o600 });
console.log('Created server/.env');

if (fs.existsSync(fileURLToPath(new URL('../../client/', import.meta.url)))) {
  if (!fs.existsSync(clientEnv)) {
    const clientLines = ['VITE_API_URL=/api', `VITE_VAPID_PUBLIC_KEY=${vapid.publicKey}`];
    fs.writeFileSync(clientEnv, clientLines.join(os.EOL) + os.EOL);
    console.log('Created client/.env (public values only)');
  } else {
    console.log('client/.env already exists, left it alone.');
  }
}

console.log('Next: open server/.env and fill MONGODB_URI, SMTP_USER and SMTP_APP_PASSWORD.');
