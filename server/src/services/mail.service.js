import nodemailer from 'nodemailer';
import { env, gmailApiReady, brevoReady } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { formatEthiopian } from '../utils/ethiopianDate.js';
import { checkGmailApi, sendViaGmailApi } from './gmailTransport.js';
import { SystemSetting } from '../models/SystemSetting.js';

// How the mail leaves the building: Brevo transactional API (HTTPS) is preferred whenever
// BREVO_API_KEY is present, followed by Gmail API over HTTPS, and finally SMTP.
export function getActiveTransport() {
  if (brevoReady) return 'brevo';
  if (gmailApiReady && !gmailApiDisabled) return 'gmail-api';
  return 'smtp';
}

export const MAIL_TRANSPORT = brevoReady ? 'brevo' : gmailApiReady ? 'gmail-api' : 'smtp';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  idleTimeout: 10000,
  connectionTimeout: 5000,
  greetingTimeout: 5000,
  socketTimeout: 10000,
  auth: { user: env.SMTP_USER, pass: env.SMTP_APP_PASSWORD },
});

let gmailApiDisabled = false;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

function layout({ preheader, title, accent, body }) {
  const senderName = env.BREVO_SENDER_NAME || env.MAIL_FROM_NAME || 'Student Management System';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f1f5f9;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 20px 45px -20px rgba(15,23,42,0.18);">

    <!-- Cool Gradient Header -->
    <tr><td style="background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#1e1b4b 45%,#312e81 85%,#4338ca 100%);border-top:4px solid #6366f1;padding:28px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-bottom:10px;">
            <div style="display:inline-block;padding:5px 12px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#e0e7ff;text-transform:uppercase;">🏛️ ${esc(senderName)}</div>
          </td>
        </tr>
      </table>
      <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.4px;margin-top:2px;">${esc(accent)}</div>
    </td></tr>

    <!-- Body Content Card -->
    <tr><td style="padding:34px 32px 30px;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:#0f172a;letter-spacing:-0.4px;">${esc(title)}</h1>
      ${body}
    </td></tr>

    <!-- Elegant Footer -->
    <tr><td style="padding:22px 32px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;font-weight:600;color:#475569;">${esc(senderName)} · Official Notification</p>
            <p style="margin:0;font-size:11px;line-height:1.6;color:#94a3b8;">This is an automated institutional message. If this was not meant for you, no action is needed.</p>
          </td>
        </tr>
      </table>
    </td></tr>

  </table>

  <div style="margin-top:20px;font-size:11px;color:#94a3b8;text-align:center;">Please do not reply directly to this automated mailbox.</div>

</td></tr>
</table>
</body>
</html>`;
}

// An account can exist before its owner has chosen a name, so a greeting must never
// come out empty.
const hi = (name) => esc(name || 'there');

const para = (html, { muted = false, last = false } = {}) =>
  `<p style="margin:0 0 ${last ? '0' : '16px'};font-size:14px;line-height:1.7;color:${muted ? '#64748b' : '#334155'};">${html}</p>`;

function codeBlock(code, minutes) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr><td align="center" style="background:#f5f3ff;background-image:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:2px dashed #a78bfa;border-radius:20px;padding:24px 16px;">
    <div style="font-family:${MONO};font-size:42px;line-height:1;font-weight:800;letter-spacing:10px;text-indent:10px;color:#4338ca;">${esc(code)}</div>
    <div style="margin-top:14px;">
      <span style="display:inline-block;padding:4px 12px;background:#ddd6fe;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5b21b6;">⏱️ EXPIRES IN ${esc(minutes)} MINUTES</span>
    </div>
  </td></tr>
</table>`;
}

// A real button, plus the plain URL underneath: some mail clients strip styles, and
// a verification link that cannot be tapped is a link that cannot be used.
function button(href, label, subline) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 24px;">
  <tr><td align="center">
    <a href="${esc(href)}" style="display:inline-block;background:#4f46e5;background-image:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.2px;padding:15px 36px;border-radius:14px;box-shadow:0 8px 20px -4px rgba(79,70,229,0.45);">${esc(label)}</a>
    ${subline ? `<div style="margin-top:12px;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6366f1;">${esc(subline)}</div>` : ''}
  </td></tr>
</table>
<p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">If the button does not work, copy this address into your browser:<br><span style="font-family:${MONO};color:#4f46e5;font-weight:600;">${esc(href)}</span></p>`;
}

function note(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;">
  <tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:12px;padding:14px 18px;">
    <p style="margin:0;font-size:13px;line-height:1.6;color:#92400e;">${html}</p>
  </td></tr>
</table>`;
}

const row = (k, v) =>
  `<tr><td style="padding:9px 16px 9px 0;font-size:13px;color:#64748b;white-space:nowrap;vertical-align:top;border-bottom:1px solid #edf2f7;">${k}</td><td style="padding:9px 0;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #edf2f7;">${esc(v)}</td></tr>`;

function detailCard(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:6px 20px;margin:18px 0;">
  ${rows}
</table>`;
}

const isRender = Boolean(process.env.RENDER);

async function deliver({ to, subject, html, text, priority = 'normal' }) {
  const isHighPriority = priority === 'high' || /code|verification|sign-in|reset|security|confirm/i.test(subject);

  // 1. Brevo Transactional REST API (HTTPS port 443)
  const sendBrevo = async () => {
    if (!brevoReady) return false;
    const senderEmail = env.BREVO_SENDER_EMAIL || env.SMTP_USER;
    const senderName = env.BREVO_SENDER_NAME || env.MAIL_FROM_NAME || 'Student Management System';

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || undefined,
        tags: [isHighPriority ? 'transactional-urgent' : 'transactional-general'],
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.message || `Brevo HTTP ${resp.status}`);
      logger.error({ err: err.message, to, subject }, 'Brevo email delivery error');
      throw err;
    }
    logger.info({ to, subject, messageId: data.messageId, transport: 'brevo' }, 'Email delivered successfully via Brevo');
    return true;
  };

  // 2. SMTP fallback
  const sendSmtp = async () => {
    await transporter.sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
      priority: isHighPriority ? 'high' : 'normal',
      headers: isHighPriority
        ? {
            'X-Priority': '1 (Highest)',
            'X-MSMail-Priority': 'High',
            'Importance': 'high',
            'Priority': 'urgent',
          }
        : {},
    });
    logger.info({ to, subject, transport: 'smtp' }, 'Email delivered successfully via SMTP');
    return true;
  };

  // 3. Gmail API fallback
  const sendGmail = async () => {
    if (!gmailApiReady || gmailApiDisabled) return false;
    try {
      await sendViaGmailApi({ to, subject, html, text });
      logger.info({ to, subject, transport: 'gmail-api' }, 'Email delivered successfully via Gmail API');
      return true;
    } catch (apiErr) {
      logger.error({ err: apiErr.message, to, subject }, 'Gmail API failed');
      throw apiErr;
    }
  };

  // Primary: Brevo API
  if (brevoReady) {
    try {
      return await sendBrevo();
    } catch (brevoErr) {
      logger.warn({ err: brevoErr.message, to, subject }, 'Brevo delivery failed; trying Gmail API / SMTP fallback');
      if (gmailApiReady && !gmailApiDisabled) {
        try {
          return await sendGmail();
        } catch (apiErr) {
          logger.warn({ err: apiErr.message, to, subject }, 'Gmail API fallback failed; trying SMTP');
        }
      }
      try {
        return await sendSmtp();
      } catch (smtpErr) {
        logger.error({ brevoErr: brevoErr.message, smtpErr: smtpErr.message, to, subject }, 'All email delivery transports failed');
        throw new Error(`Email delivery failed: Brevo (${brevoErr.message}), SMTP (${smtpErr.message})`);
      }
    }
  }

  // Secondary: Gmail API over HTTPS (port 443)
  if (gmailApiReady && !gmailApiDisabled) {
    try {
      return await sendGmail();
    } catch (apiErr) {
      logger.warn({ err: apiErr.message, to, subject }, 'Gmail API delivery attempt failed; falling back to SMTP');
      try {
        return await sendSmtp();
      } catch (smtpErr) {
        logger.error({ apiErr: apiErr.message, smtpErr: smtpErr.message, to, subject }, 'Both Gmail API and SMTP delivery failed');
        throw new Error(`Email delivery failed: Gmail API (${apiErr.message}), SMTP (${smtpErr.message})`);
      }
    }
  }

  // Tertiary: SMTP directly
  try {
    return await sendSmtp();
  } catch (smtpErr) {
    logger.error({ err: smtpErr.message, to, subject }, 'SMTP delivery failed');
    throw new Error(`Email delivery failed: SMTP (${smtpErr.message})`);
  }
}

export const verifyMail = async () => {
  if (brevoReady) {
    try {
      const resp = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': env.BREVO_API_KEY },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        return {
          address: env.BREVO_SENDER_EMAIL || env.SMTP_USER,
          transport: 'brevo',
          company: data.companyName,
          credits: data.plan?.[0]?.credits,
        };
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Brevo account verification failed');
    }
  }

  if (gmailApiReady && !gmailApiDisabled) {
    try {
      const check = await checkGmailApi();
      return { address: env.SMTP_USER, scope: check.scope, transport: 'gmail-api' };
    } catch (apiErr) {
      logger.warn({ err: apiErr.message }, 'Gmail API verification failed; testing SMTP');
      await transporter.verify();
      return { address: env.SMTP_USER, transport: 'smtp' };
    }
  }

  await transporter.verify();
  return { address: env.SMTP_USER, transport: 'smtp' };
};

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
    priority: 'high',
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
    priority: 'high',
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
    priority: 'high',
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
    priority: 'high',
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
    priority: 'high',
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

// College centralized branding helper
export async function getCollegeBranding() {
  try {
    const setting = await SystemSetting.findOne({ key: 'global' }).lean();
    const inst = setting?.institution || {};
    return {
      name: inst.name || env.BREVO_SENDER_NAME || env.MAIL_FROM_NAME || 'Ethiopian College of Health Sciences',
      shortName: inst.shortName || 'ECHS',
      email: inst.admissionsEmail || inst.email || env.BREVO_SENDER_EMAIL || 'admissions@college.edu.et',
      phone: inst.admissionsPhone || inst.phone || '+251 11 123 4567',
      website: inst.website || env.CLIENT_ORIGIN || 'https://college.edu.et',
      logoUrl: inst.logoUrl || '',
      primaryColor: inst.primaryColor || '#4f46e5',
      facebook: inst.facebook || 'https://facebook.com',
      telegram: inst.telegram || 'https://t.me',
      youtube: inst.youtube || 'https://youtube.com',
      instagram: inst.instagram || 'https://instagram.com',
      address: inst.address || 'Addis Ababa, Ethiopia',
    };
  } catch {
    return {
      name: env.BREVO_SENDER_NAME || env.MAIL_FROM_NAME || 'Ethiopian College of Health Sciences',
      shortName: 'ECHS',
      email: env.BREVO_SENDER_EMAIL || 'admissions@college.edu.et',
      phone: '+251 11 123 4567',
      website: env.CLIENT_ORIGIN || 'https://college.edu.et',
      logoUrl: '',
      primaryColor: '#4f46e5',
      facebook: 'https://facebook.com',
      telegram: 'https://t.me',
      youtube: 'https://youtube.com',
      instagram: 'https://instagram.com',
      address: 'Addis Ababa, Ethiopia',
    };
  }
}

// Generic institutional email reusable by finance flows (waivers, overdue notices,
// statements). Custom rows/paragraphs come pre-escaped from the caller where needed.
export function sendFinanceNotification({ to, name, subject, title, intro, rows = [], paragraphs = [], footerNote }) {
  const rowsHtml = rows.length ? detailCard(rows.map(([k, v]) => row(k, v)).join('')) : '';
  const paras = paragraphs.map((p, i) => para(p, { muted: i < paragraphs.length - 1 ? false : false }));
  const body = para(`Hi ${hi(name)},<br>${esc(intro || '')}`) + paras.join('') + rowsHtml + (footerNote ? note(footerNote) : '');
  return deliver({
    to,
    subject,
    html: layout({ preheader: intro ? String(intro).slice(0, 140) : subject, title, accent: title, body }),
    text: [intro, ...paragraphs.map((p) => String(p).replace(/<[^>]+>/g, '')), ...rows.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n'),
  });
}

function collegeSocialBlock(b) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;padding-top:16px;border-top:1px dashed #cbd5e1;">
    <tr><td align="center">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;">Connect with the College</p>
      <div>
        ${b.telegram ? `<a href="${esc(b.telegram)}" style="display:inline-block;margin:0 8px;color:#2563eb;text-decoration:none;font-size:12px;font-weight:600;">Telegram</a>` : ''}
        ${b.facebook ? `<a href="${esc(b.facebook)}" style="display:inline-block;margin:0 8px;color:#2563eb;text-decoration:none;font-size:12px;font-weight:600;">Facebook</a>` : ''}
        ${b.youtube ? `<a href="${esc(b.youtube)}" style="display:inline-block;margin:0 8px;color:#2563eb;text-decoration:none;font-size:12px;font-weight:600;">YouTube</a>` : ''}
        ${b.website ? `<a href="${esc(b.website)}" style="display:inline-block;margin:0 8px;color:#2563eb;text-decoration:none;font-size:12px;font-weight:600;">Website</a>` : ''}
      </div>
      <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;">Admissions Office: ${esc(b.email)} · Phone: ${esc(b.phone)}</p>
    </td></tr>
  </table>`;
}

// 1. Application Submitted Confirmation Email
export async function sendApplicationSubmittedEmail({ to, name, applicationNumber, program, department, trackingUrl }) {
  const branding = await getCollegeBranding();
  const trackHref = trackingUrl || `${env.CLIENT_ORIGIN || 'https://college.edu.et'}/application/track?ref=${encodeURIComponent(applicationNumber)}`;

  const body =
    para(`Dear <strong>${hi(name)}</strong>,<br>Thank you for applying to <strong>${esc(branding.name)}</strong>. Your application has been successfully submitted and is now under review by our Admissions Office.`) +
    codeBlock(applicationNumber, 'KEEP THIS TRACKING NUMBER') +
    detailCard(
      row('Tracking reference', applicationNumber) +
      row('Target programme', program || 'Degree / Diploma') +
      row('Department', department || 'Health Sciences') +
      row('Status', 'Under Review') +
      row('Submission date', formatEthiopian(new Date(), { time: true }))
    ) +
    button(trackHref, 'Track Your Application Online', 'Live Status Updates') +
    note('Please monitor your email and check your tracking page periodically. Our Admissions Committee reviews applications within 24 to 48 hours.') +
    collegeSocialBlock(branding);

  return deliver({
    to,
    subject: `Application Submitted · Tracking Reference ${applicationNumber}`,
    html: layout({
      preheader: `Your application ${applicationNumber} is under review`,
      title: 'Application Received Successfully',
      accent: branding.name,
      body,
    }),
    text: `Dear ${name}, your application ${applicationNumber} to ${branding.name} for ${program} (${department}) has been received. Track your application status at: ${trackHref}. Admissions Office: ${branding.phone}`,
  });
}

// 2. Application Approved & Admission Email
export async function sendApplicationApprovedEmail({ to, name, applicationNumber, studentId, program, department, batch, category, admissionDate }) {
  const branding = await getCollegeBranding();

  const body =
    para(`Congratulations, <strong>${hi(name)}</strong>!<br>We are pleased to inform you that your application <strong>${esc(applicationNumber)}</strong> has been officially <strong>APPROVED</strong>. You have been officially admitted to <strong>${esc(branding.name)}</strong>.`) +
    detailCard(
      row('Official Student ID', studentId) +
      row('Tracking reference', applicationNumber) +
      row('Programme', program || 'Degree') +
      row('Department', department || 'Health Sciences') +
      row('Assigned batch', batch || 'First Year') +
      row('Delivery stream', category || 'Regular') +
      row('Admission date', admissionDate ? formatEthiopian(admissionDate) : formatEthiopian(new Date()))
    ) +
    para('<strong>Next Registration Instructions:</strong><br>1. Keep your Official Student ID safe. You will need it for orientation and class registration.<br>2. Visit the Registrar\'s Office with your original high school matriculation / 12th grade certificates for physical verification before classes commence.<br>3. Pay your monthly registration fees through the student portal or designated college payment options.') +
    note('If you have any questions or require campus assistance, contact the Admissions Office.') +
    collegeSocialBlock(branding);

  return deliver({
    to,
    subject: `Congratulations! Official Admission Confirmed · ID: ${studentId}`,
    html: layout({
      preheader: `Official Admission: Student ID ${studentId}`,
      title: 'Official Admission Confirmed',
      accent: branding.name,
      body,
    }),
    text: `Congratulations ${name}! Your application ${applicationNumber} has been approved. Your Official Student ID is ${studentId}. Programme: ${program}. Department: ${department}. Batch: ${batch}. Please report to the Registrar with your original documents before classes begin.`,
  });
}

// 3. Application Rejected Notification Email
export async function sendApplicationRejectedEmail({ to, name, applicationNumber, reason, program, department }) {
  const branding = await getCollegeBranding();

  const body =
    para(`Dear <strong>${hi(name)}</strong>,<br>Thank you for your interest in <strong>${esc(branding.name)}</strong> and for taking the time to submit your application for the <strong>${esc(program || 'academic programme')}</strong> in <strong>${esc(department || 'Admissions')}</strong>.`) +
    detailCard(
      row('Tracking reference', applicationNumber) +
      row('Programme applied', program || 'Health Sciences') +
      row('Status', 'Application Rejected') +
      row('Review date', formatEthiopian(new Date()))
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
      <tr><td style="background:#fff1f2;border-left:4px solid #e11d48;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9f1239;text-transform:uppercase;letter-spacing:1px;">Official Committee Decision Note:</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#881337;font-style:italic;">"${esc(reason || 'Requirements not met for the current intake cycle.')}"</p>
      </td></tr>
    </table>` +
    para('While we are unable to offer you admission for this specific intake, we encourage you to review the eligibility criteria and consider re-applying in upcoming academic registration windows.') +
    note(`If you believe this decision was made in error or wish to submit additional documentation, please contact the Admissions Office at <strong>${esc(branding.email)}</strong> or phone <strong>${esc(branding.phone)}</strong>.`) +
    collegeSocialBlock(branding);

  return deliver({
    to,
    subject: `Admissions Decision Update · Reference ${applicationNumber}`,
    html: layout({
      preheader: `Admission update regarding reference ${applicationNumber}`,
      title: 'Admissions Decision Notification',
      accent: branding.name,
      body,
    }),
    text: `Dear ${name}, regarding your application ${applicationNumber} for ${program}: the admissions committee has marked your application as not approved. Reason: ${reason}. For inquiries, contact ${branding.email} or ${branding.phone}.`,
  });
}
