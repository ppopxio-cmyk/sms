import { env } from '../config/env.js';

// Sending through the Gmail API instead of SMTP. Both do the same job, but the API rides
// on HTTPS (port 443), which is the point: hosting platforms that block the SMTP ports
// (25, 465, 587) still let HTTPS through, so this is what makes production email work.
//
// Nothing here needs a library. Node's fetch talks to Google, and the MIME message the
// API wants is assembled by hand — the templates in mail.service.js are unchanged.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export const isConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);

// An access token lasts about an hour. It is kept in memory only, refreshed a minute
// early, and shared: two emails sent at the same moment wait on one refresh, not two.
let cached = null;
let refreshing = null;

async function requestToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`Google did not accept the refresh token (${reason}).`);
  }

  const seconds = Number(data.expires_in) || 3600;
  return {
    token: data.access_token,
    scope: data.scope || '',
    expiresAt: Date.now() + Math.max(60, seconds - 60) * 1000,
  };
}

function accessToken(force = false) {
  if (!force && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.token);

  if (!refreshing) {
    refreshing = requestToken()
      .then((fresh) => {
        cached = fresh;
        return fresh.token;
      })
      .finally(() => {
        refreshing = null;
      });
  }

  return refreshing;
}

// Long lines are not allowed in a mail body, so every base64 run is folded at 76.
const fold = (value) => value.replace(/(.{76})/g, '$1\r\n');
const toBase64 = (value) => fold(Buffer.from(String(value), 'utf8').toString('base64'));
// A header may only carry ASCII; anything else travels as an encoded word.
const headerValue = (value) =>
  /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : String(value).replace(/[\r\n]+/g, ' ');

export function buildMessage({ to, subject, html, text }) {
  const boundary = `sms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${env.SMTP_USER.split('@')[1] || 'sms.local'}>`;

  const lines = [
    `From: ${headerValue(env.MAIL_FROM_NAME)} <${env.SMTP_USER}>`,
    `To: ${to}`,
    `Subject: ${headerValue(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64(html),
    `--${boundary}--`,
    '',
  ];

  return lines.join('\r\n');
}

async function post(raw, force) {
  const token = await accessToken(force);

  return fetch(SEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}

export async function sendViaGmailApi({ to, subject, html, text }) {
  const raw = Buffer.from(buildMessage({ to, subject, html, text }), 'utf8').toString('base64url');

  // A token that expired between the check and the call is the one failure worth retrying
  // silently, so a stale access token never costs somebody their email.
  let res = await post(raw, false);
  if (res.status === 401) res = await post(raw, true);

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Gmail refused the message (HTTP ${res.status}).`);
  }

  return true;
}

// Used by `npm run test:mail`: proves the credentials work before anything else runs.
export async function checkGmailApi() {
  const fresh = await requestToken();
  return { address: env.SMTP_USER, scope: fresh.scope };
}
