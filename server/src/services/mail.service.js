import nodemailer from 'nodemailer';
import { env, gmailApiReady } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { formatEthiopian } from '../utils/ethiopianDate.js';
import { checkGmailApi, sendViaGmailApi } from './gmailTransport.js';

// How the mail leaves the building: the Gmail API over HTTPS when the Google values are
// present, otherwise the app password over SMTP. Both send from the same school address.
export const MAIL_TRANSPORT = gmailApiReady ? 'gmail-api' : 'smtp';

const transporter = gmailApiReady
  ? null
  : nodemailer.createTransport({
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

// An account can exist before its owner has chosen a name, so a greeting must never
// come out empty.
const hi = (name) => esc(name || 'there');

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

// A real button, plus the plain URL underneath: some mail clients strip styles, and
// a verification link that cannot be tapped is a link that cannot be used.
function button(href, label, subline) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;">
  <tr><td align="center">
    <a href="${esc(href)}" style="display:inline-block;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#4f46e5;background-image:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:.2px;padding:15px 34px;border-radius:14px;">${esc(label)}</a>
    ${subline ? `<div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin-top:12px;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6366f1;">${esc(subline)}</div>` : ''}
  </td></tr>
</table>
<p style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0 0 18px;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">If the button does not work, copy this address into your browser:<br><span style="font-family:${MONO};color:#4338ca;">${esc(href)}</span></p>`;
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
    if (gmailApiReady) await sendViaGmailApi({ to, subject, html, text });
    else await transporter.sendMail({ from: `"${env.MAIL_FROM_NAME}" <${env.SMTP_USER}>`, to, subject, html, text });
    return true;
  } catch (err) {
    logger.error({ err: err.message, subject, transport: MAIL_TRANSPORT }, 'email could not be sent');
    return false;
  }
}

export const verifyMail = () => (gmailApiReady ? checkGmailApi() : transporter.verify());

const COPY = {
  login_2fa: { subject: 'Your sign-in code', accent: 'Sign-in verification', title: 'Here is your sign-in code', intro: 'Someone is signing in to your account. Enter this code to continue.' },
  password_reset: { subject: 'Reset your password', accent: 'Password reset', title: 'Reset your password', intro: 'Use this code to choose a new password.' },
  session_terminate: { subject: 'Confirm signing a device out', accent: 'Device sign-out', title: 'Confirm this sign-out', intro: 'Use this code to sign the other device out of your account.' },
  account_delete: { subject: 'Confirm deleting your account', accent: 'Account deletion', title: 'Confirm you want to delete your account', intro: 'Use this code to confirm that your account should be deleted. This cannot be undone.' },
  student_delete: { subject: 'Confirm deleting a student record', accent: 'Student record deletion', title: 'Confirm this permanent deletion', intro: 'Use this code to permanently delete the student record you selected. This cannot be undone.' },
  batch_delete: { subject: 'Confirm deleting a batch', accent: 'Batch deletion', title: 'Confirm this batch deletion', intro: 'Use this code to delete the selected batch register. This cannot be undone.' },
  course_marks_submit: { subject: 'Confirm submitting course marks', accent: 'Course marks submission', title: 'Confirm this submission', intro: 'Use this code to submit course marks for registrar review. Submitted marks are locked from further edits.' },
  result_submission: { subject: 'Confirm results submission & stage finalization', accent: 'Stage completion verification', title: 'Confirm stage results finalization', intro: 'Use this code to verify and submit finalized stage results for GPA calculation. Once submitted, this stage results will be approved and sent to GPA.' },
  attendance_finalize: { subject: 'Confirm course attendance finalization', accent: 'Attendance finalization', title: 'Confirm finalizing course attendance', intro: 'Use this code to finalize course attendance and compute attendance marks.' },
};

export function sendCodeEmail({ to, name, code, purpose }) {
  const c = COPY[purpose] || {
    subject: 'Verification code',
    accent: 'Security verification',
    title: 'Your verification code',
    intro: 'Use this verification code to complete your requested action.',
  };
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

export function sendLoginAlert({ to, name, ip, browser, os, location, deviceName, deviceLabel, at }) {
  const device = [deviceLabel || deviceName, [browser, os].filter(Boolean).join(' on ')].filter(Boolean).join(' · ');
  const body =
    para(`Hi ${esc(name)},<br>You just signed in to your account. If this was you, no action is needed.`) +
    detailCard(
      row('When', formatEthiopian(at, { time: true })) +
        row('Device', device) +
        row('Place', location) +
        row('IP address', ip),
    ) +
    note('The place is worked out from the IP address, so it is an estimate and may not always be accurate.') +
    note('If this was not you, reset your password right away and tell an administrator.');
  return deliver({
    to,
    subject: 'New sign-in to your account',
    html: layout({ preheader: 'We noticed a new sign-in', title: 'You signed in', accent: 'New sign-in', body }),
    text: `You signed in on ${formatEthiopian(at, { time: true })} from ${device} at ${location} (${ip}). The place is estimated from the IP address. If this was not you, reset your password.`,
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

// No password ever travels by email, and none is ever handed out. The account is created
// empty: its owner confirms the address and then chooses their own name and password.
export function sendAccountCreated({ to, role }) {
  const body =
    para(`Hi ${hi()},<br>Your school administrator created your account. You are signed up as <strong>${esc(role)}</strong>.`) +
    para('We sent you a separate email with a link to confirm this address. Open that link to choose your full name and your password, then sign in.') +
    note('If you were not expecting this account, tell your administrator.');
  return deliver({
    to,
    subject: 'Your account has been created',
    html: layout({ preheader: 'Your account has been created', title: 'Welcome aboard', accent: 'Account created', body }),
    text: `Your account was created as ${role}. Open the link we emailed you to confirm this address and choose your name and password.`,
  });
}

// Confirming an email is done with a link, never a code: there is nothing to type and
// nothing to read out over the phone. The link works once and stops working after
// VERIFY_LINK_TTL_HOURS.
export function sendVerifyLinkEmail({ to, name, url, hours }) {
  const body =
    para(`Hi ${hi(name)},<br>Tap the button below to confirm this email address, then choose your full name and your password.`) +
    button(url, 'Confirm my email', `the link works for ${hours} hours`) +
    note('If you did not create this account, ignore this email and tell your administrator.');
  return deliver({
    to,
    subject: 'Confirm your email address',
    html: layout({ preheader: 'Confirm your email address', title: 'Confirm your email', accent: 'Email confirmation', body }),
    text: `Confirm your email address by opening this link within ${hours} hours: ${url}`,
  });
}

// Sent by an administrator when somebody with a confirmed email has lost access.
// It lands straight on the "choose a new password" step.
export function sendResetLinkEmail({ to, name, url, minutes }) {
  const body =
    para(`Hi ${hi(name)},<br>An administrator asked us to send you a password reset link. Choose a new password with it.`) +
    button(url, 'Choose a new password', `the link works for ${minutes} minutes`) +
    note('If you did not ask for this, ignore this email. Your password will not change until the link is used.');
  return deliver({
    to,
    subject: 'Reset your password',
    html: layout({ preheader: 'Reset your password', title: 'Choose a new password', accent: 'Password reset', body }),
    text: `Choose a new password with this link within ${minutes} minutes: ${url}`,
  });
}

// Announcements are plain text on purpose. The author types a notice, not a web page,
// so every character is escaped and line breaks are preserved without allowing HTML.
export function sendAnnouncementEmail({ to, name, title, body, priority = 'normal', type = 'general', publishedAt = new Date() }) {
  const safeBody = esc(body).replace(/\r?\n/g, '<br>');
  const tone = priority === 'critical' ? '#be123c' : priority === 'high' ? '#b45309' : '#4338ca';
  const htmlBody =
    para(`Hi ${hi(name)},<br>${safeBody}`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;background:#f8fafc;border:1px solid #e8eef5;border-radius:16px;padding:6px 18px;">
      <tr><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 16px 9px 0;font-size:13px;color:#64748b;white-space:nowrap;">Published</td><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 0;font-size:13px;font-weight:600;color:#0f172a;">${esc(formatEthiopian(publishedAt, { time: true }))}</td></tr>
      <tr><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 16px 9px 0;font-size:13px;color:#64748b;white-space:nowrap;">Category</td><td style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:9px 0;font-size:13px;font-weight:600;color:#0f172a;">${esc(type)}</td></tr>
    </table>`;

  return deliver({
    to,
    subject: title,
    html: layout({
      preheader: body.slice(0, 140),
      title,
      accent: priority === 'critical' ? 'Critical announcement' : priority === 'high' ? 'Important announcement' : 'College announcement',
      body: htmlBody,
    }),
    text: `${title}\n\n${body}\n\nPublished ${formatEthiopian(publishedAt, { time: true })}.`,
  });
}

export function sendStudentAdmissionEmail({ to, name, studentId, program, department, batch, category, admissionDate }) {
  const body =
    para(`Hi ${hi(name)},<br>Your admission has been recorded. Keep this email: it contains your official student number and programme details.`) +
    detailCard(
      row('Student number', studentId) +
        row('Programme', program) +
        row('Department', department) +
        row('Batch', batch || 'To be assigned') +
        row('Delivery stream', category) +
        row('Admission date', admissionDate ? formatEthiopian(admissionDate) : 'Recorded'),
    ) +
    para('Use your student number whenever you contact the registrar, sit an examination, or collect an official document.') +
    note('If any detail above is not correct, contact the registrar before classes begin.');

  return deliver({
    to,
    subject: `Your admission is confirmed · ${studentId}`,
    html: layout({
      preheader: `Student number ${studentId} is now active`,
      title: 'Your admission is confirmed',
      accent: 'Student admission',
      body,
    }),
    text: `Your admission is confirmed. Student number: ${studentId}. Programme: ${program}. Department: ${department}. Batch: ${batch || 'To be assigned'}. Delivery stream: ${category}. Admission date: ${admissionDate ? formatEthiopian(admissionDate) : 'Recorded'}. If any detail is not correct, contact the registrar.`,
  });
}

// Settings can prove the mail path works without ever returning a secret. The test
// message goes only to the signed-in administrator's own address.
export function sendCurriculumOfferingEmail({ to, name, planTitle, programName, courseCount }) {
  const body =
    para(`Hi ${hi(name)},<br>The curriculum plan <strong>${esc(planTitle)}</strong> for <strong>${esc(programName)}</strong> has been published by the Registrar.`) +
    para(`${courseCount} course offering${courseCount === 1 ? '' : 's'} have been assigned to your classes. You can now access and manage them in your teacher portal.`) +
    note('Visit the teacher portal under "Classes" to review your offerings, student registrations and attendance.');
  return deliver({
    to,
    subject: `Course Offerings Assigned: ${programName} (${planTitle})`,
    html: layout({
      preheader: 'New course offerings assigned',
      title: 'Course Offerings Assigned',
      accent: 'Academic Planning',
      body,
    }),
    text: `Hi ${name}, The curriculum plan "${planTitle}" for ${programName} has been published by the Registrar with ${courseCount} course offerings assigned to your classes. Check your portal at teacher/classes.`,
  });
}

export function sendTestEmail({ to, name, transport }) {
  const body =
    para(`Hi ${hi(name)},<br>This is a test from the college portal. If you can read it, the configured mail transport is working.`) +
    detailCard(row('Transport', transport) + row('Sent', formatEthiopian(new Date(), { time: true }))) +
    note('No password, app password, refresh token or other credential is included in this message.');
  return deliver({
    to,
    subject: 'Test email from the college portal',
    html: layout({ preheader: 'Mail delivery is working', title: 'Mail delivery is working', accent: 'Email settings', body }),
    text: `This is a test from the college portal. Transport: ${transport}.`,
  });
}
