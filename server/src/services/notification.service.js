import { Notification, NOTIFICATION_TTL_MS } from '../models/Notification.js';
import { User } from '../models/User.js';
import { Program } from '../models/AcademicStructure.js';
import { logger } from '../utils/logger.js';
import { ownFilter } from './registrar.helpers.js';
import * as stream from './stream.service.js';
import * as push from './push.service.js';

export const toPayload = (doc) => ({
  id: String(doc._id),
  type: doc.type,
  title: doc.title,
  body: doc.body || '',
  actorName: doc.actorName || '',
  meta: doc.meta ?? null,
  readAt: doc.readAt ?? null,
  createdAt: doc.createdAt,
});

// One row per event per person: the bell counts rows, and every person can clear their
// own. Delivery is either a live stream (a tab is open) or a push (no tab is open) -
// never both, so nobody sees the same notice twice on one screen.
async function deliver(entry, { exceptSid, exceptDeviceKey } = {}) {
  try {
    const doc = await Notification.create({
      ...entry,
      expiresAt: new Date(Date.now() + NOTIFICATION_TTL_MS),
    });
    const payload = toPayload(doc);
    const live = stream.sendToUser(doc.userId, 'notification', payload, { exceptSid });
    if (live === 0) {
      await push.sendToUser(
        doc.userId,
        { kind: 'notification', ...payload, tag: `sms-${doc._id}`, url: '/notifications' },
        { exceptDeviceKey },
      );
    }
    return payload;
  } catch (err) {
    // A notice that cannot be stored must never break the action that caused it.
    logger.error({ err: err.message }, 'a notification could not be delivered');
    return null;
  }
}

export async function notifyUser(userId, entry) {
  if (!userId) return null;
  return deliver({ ...entry, userId });
}

export async function notifyAdmins(entry) {
  const admins = await User.find({ role: 'ADMIN', status: 'active', deletedAt: null })
    .select('_id')
    .lean();
  await Promise.all(admins.map((admin) => deliver({ ...entry, userId: admin._id })));
}

export async function notifyUsers(userIds, entry) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return;
  const users = await User.find(ownFilter({ _id: { $in: ids }, status: 'active', deletedAt: null }))
    .select('_id')
    .lean();
  await Promise.all(users.map((user) => deliver({ ...entry, userId: user._id })));
}

export async function notifyRole(role, entry) {
  const users = await User.find({ role, status: 'active', deletedAt: null }).select('_id').lean();
  await Promise.all(users.map((user) => deliver({ ...entry, userId: user._id })));
}

export async function notifyProgramTeachers(programId, entry) {
  try {
    const program = await Program.findById(programId).select('teachers').lean();
    const ids = (program?.teachers || []).map(String);
    if (!ids.length) return;
    const teachers = await User.find(ownFilter({ _id: { $in: ids }, role: 'TEACHER', status: 'active', deletedAt: null }))
      .select('_id')
      .lean();
    await Promise.all(teachers.map((teacher) => deliver({ ...entry, userId: teacher._id })));
  } catch (err) {
    logger.error({ err: err.message, programId: String(programId) }, 'programme teacher notifications could not be delivered');
  }
}

const describe = (info) => {
  const system = [info.browser, info.os].filter(Boolean).join(' on ');
  return [info.deviceLabel || info.deviceName, system].filter(Boolean).join(' · ') || 'an unknown device';
};

// An account can confirm its email before its owner has chosen a name, so a notice must
// never come out with a blank space where a person should be.
const who = (user) => user.name || user.email;

// Somebody signed in. Their other open tabs and devices hear about it, and so does the
// administrator - unless the administrator is the one who signed in.
export async function notifySignIn({ user, sid, deviceKey, info }) {
  const where = `${describe(info)} · ${info.location}`;
  const at = new Date().toISOString();

  await deliver(
    {
      userId: user._id,
      type: 'login',
      title: 'New sign-in to your account',
      body: where,
      actorId: user._id,
      actorName: who(user),
      meta: { browser: info.browser, os: info.os, ip: info.ip, location: info.location, at },
    },
    { exceptSid: sid, exceptDeviceKey: deviceKey },
  );

  if (user.role !== 'ADMIN') {
    await notifyAdmins({
      type: 'user_login',
      title: `${who(user)} signed in`,
      body: `${where} · ${user.email}`,
      actorId: user._id,
      actorName: who(user),
      meta: { email: user.email, role: user.role, browser: info.browser, os: info.os, at },
    });
  }
}

export async function notifyEmailVerified({ user }) {
  await deliver({
    userId: user._id,
    type: 'email_verified',
    title: 'Your email was confirmed',
    body: 'Choose your name and password to finish setting up your account.',
    actorId: user._id,
    actorName: who(user),
  });
  await notifyAdmins({
    type: 'user_verified',
    title: `${who(user)} confirmed their email`,
    body: `${user.email} · ${user.role.toLowerCase()}`,
    actorId: user._id,
    actorName: who(user),
    meta: { email: user.email, role: user.role },
  });
}

export async function notifyPasswordChanged({ user, by = 'user' }) {
  await deliver({
    userId: user._id,
    type: 'password_changed',
    title: 'Your password was changed',
    body: 'Every device was signed out for safety.',
    actorId: user._id,
    actorName: who(user),
  });
  if (user.role !== 'ADMIN') {
    await notifyAdmins({
      type: 'user_password_changed',
      title: `${who(user)} changed their password`,
      body: by === 'admin' ? `Reset from the users screen · ${user.email}` : user.email,
      actorId: user._id,
      actorName: who(user),
      meta: { email: user.email, role: user.role, by },
    });
  }
}
