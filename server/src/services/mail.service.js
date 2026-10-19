import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { formatEthiopian } from '../utils/ethiopianDate.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD },
});

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

function layout({ preheader, title, accent, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#eef2f7;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7;">
<tr><td align="center" style="padding:40px 16px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 40px -26px rgba(15,23,42,.45);">

    <tr><td style="background:#4f46e5;background-image:linear-gradient(135deg,#4f46e5 0%,#7c3aed 48%,#0ea5e9 100%);padding:26px 32px;">
      <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2.6px;text-transform:uppercase;color:rgba(255,255,255,.72);">${esc(env.MAIL_FROM_NAME)}</div>
      <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin-top:8px;font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-.2px;">${esc(accent)}</div>
    </td></tr>

    <tr><td style="padding:32px;">
      <h1 style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:700;color:#0f172a;letter-spacing:-.3px;">${esc(title)}</h1>
      ${body}
    </td></tr>

    <tr><td style="padding:18px 32px 24px;background:#f8fafc;border-top:1px solid #eef2f7;">
      <p style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:12px;line-height:1.65;color:#64748b;">This message was sent automatically. If it was not meant for you, you can safely ignore it.</p>
    </td></tr>

  </table>

  <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin-top:18px;font-size:11px;color:#94a3b8;">Please do not reply to this email.</div>

</td></tr>
</table>
</body>
</html>`;
}

const para = (html, { muted = false, last = false } = {}) =>
  `<p style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0 0 ${last ? '0' : '16px'};font-size:15px;line-height:1.65;color:${muted ? '#64748b' : '#334155'};">${html}</p>`;

function codeBlock(code, minutes) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 24px;">
  <tr><td align="center" style="background:#eef2ff;background-image:linear-gradient(135deg,#eef2ff,#e0f2fe);border:1px dashed #c7d2fe;border-radius:18px;padding:22px 16px;">
    <div style="font-family:${MONO};font-size:40px;line-height:1;font-weight:700;letter-spacing:12px;text-indent:12px;color:#3730a3;">${esc(code)}</div>
    <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin-top:12px;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#6366f1;">expires in ${esc(minutes)} minutes</div>
  </td></tr>
</table>`;
}

function note(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
  <tr><td style="background:#fff7ed;border-left:3px solid #fb923c;border-radius:10px;padding:14px 16px;">
    <p style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;font-size:13px;line-height:1.6;color:#9a3412;">${html}</p>
  </td></tr>
</table>`;
}

const row = (k, v) =>
  `<tr><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 16px 9px 0;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;">${k}</td><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 0;font-size:13px;font-weight:600;color:#0f172a;">${esc(v)}</td></tr>`;

function detailCard(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e8eef5;border-radius:16px;padding:6px 18px;margin:0 0 20px;">
  ${rows}
</table>`;
}

async function deliver({ to, subject, html, text }) {
  try {
    await transporter.sendMail({ from: `"${env.MAIL_FROM_NAME}" <${env.SMTP_USER}>`, to, subject, html, text });
    return true;
  } catch (err) {
    logger.error({ err: err.message, subject }, 'email could not be sent');
    return false;
  }
}

export const verifyMail = () => transporter.verify();

const COPY = {
  email_verify: { subject: 'Confirm your email address', accent: 'Email confirmation', title: 'Confirm your email', intro: 'Use this code to finish setting up your account.' },
  login_2fa: { subject: 'Your sign-in code', accent: 'Sign-in verification', title: 'Here is your sign-in code', intro: 'Someone is signing in to your account. Enter this code to continue.' },
  password_reset: { subject: 'Reset your password', accent: 'Password reset', title: 'Reset your password', intro: 'Use this code to choose a new password.' },
};

export function sendCodeEmail({ to, name, code, purpose }) {
  const c = COPY[purpose];
  const body =
    para(`Hi ${esc(name)},<br>${esc(c.intro)}`) +
    codeBlock(code, env.CODE_TTL_MINUTES) +
    note(`Never share this code. Our staff will never ask you for it. If you did not request it, ignore this email.`);
  return deliver({
    to,
    subject: c.subject,
    html: layout({ preheader: `Your code is ${code}`, title: c.title, accent: c.accent, body }),
    text: `${c.intro} Your code: ${code}. It works for ${env.CODE_TTL_MINUTES} minutes. Do not share it with anyone.`,
  });
}

export function sendLoginAlert({ to, name, ip, browser, os, location, at }) {
  const body =
    para(`Hi ${esc(name)},<br>You just signed in to your account. If this was you, no action is needed.`) +
    detailCard(
      row('When', formatEthiopian(at, { time: true })) + row('Browser', browser) + row('System', os) + row('Place', location) + row('IP address', ip),
    ) +
    note('If this was not you, reset your password right away and tell an administrator.');
  return deliver({
    to,
    subject: 'New sign-in to your account',
    html: layout({ preheader: 'We noticed a new sign-in', title: 'You signed in', accent: 'New sign-in', body }),
    text: `You signed in on ${formatEthiopian(at, { time: true })} from ${browser} on ${os} (${ip}). If this was not you, reset your password.`,
  });
}

export function sendPasswordChanged({ to, name }) {
  const body =
    para(`Hi ${esc(name)},<br>Your password was just changed, and you were signed out on every device for safety.`) +
    note('If you did not do this, contact an administrator immediately.');
  return deliver({
    to,
    subject: 'Your password was changed',
    html: layout({ preheader: 'Your password was changed', title: 'Password changed', accent: 'Security notice', body }),
    text: 'Your password was changed and you were signed out everywhere. If this was not you, contact an administrator.',
  });
}
