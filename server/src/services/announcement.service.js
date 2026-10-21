import { Announcement } from '../models/Announcement.js';
import { Notification, NOTIFICATION_TTL_MS } from '../models/Notification.js';
import { User } from '../models/User.js';
import { sendAnnouncementEmail } from './mail.service.js';
import * as stream from './stream.service.js';
import * as push from './push.service.js';
import { logger } from '../utils/logger.js';
import { atOrBefore, oneOf, trusted } from '../utils/mongo.js';
import { getSettings } from './settings.service.js';

const ACTIVE_USER = { deletedAt: null, status: 'active' };
const REGISTRAR_ROLES = new Set(['TEACHER', 'ACCOUNTANT']);

// A Registrar notice may never become a college-wide notice, and it may never reach an
// administrator. This is checked both when the notice is saved and again when its send
// time arrives, because an account can change role between those two moments.
export async function registrarAudienceAllowed(announcement) {
  if (announcement?.audiencePolicy !== 'registrar-restricted') return true;
  if (announcement.audience === 'all') return false;
  if (announcement.audience === 'role') return REGISTRAR_ROLES.has(announcement.audienceRole);
  if (announcement.audience === 'user') {
    const user = await User.findOne({ _id: announcement.audienceUser, ...ACTIVE_USER }).select('role').lean();
    return Boolean(user && REGISTRAR_ROLES.has(user.role));
  }
  return false;
}
const emailJobs = new Set();
const fanoutJobs = new Set();

export function audienceQuery({ audience = 'all', audienceRole, audienceUser } = {}) {
  if (audience === 'role' && audienceRole) return { ...ACTIVE_USER, role: audienceRole };
  if (audience === 'user' && audienceUser) return { ...ACTIVE_USER, _id: audienceUser };
  return ACTIVE_USER;
}

export async function resolveAudience(input) {
  return User.find(audienceQuery(input))
    .select('_id name email role')
    .sort({ name: 1, email: 1 })
    .lean();
}

export async function audiencePreview(input) {
  const users = await resolveAudience(input);
  return {
    count: users.length,
    sample: users.slice(0, 8).map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    })),
  };
}

function notificationPayload(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body || '',
    actorName: doc.actorName || '',
    meta: doc.meta ?? null,
    readAt: doc.readAt ?? null,
    createdAt: doc.createdAt,
  };
}

// Creating the notice rows and the per-person receipts is one distribution step. It is
// idempotent at the announcement level (fanoutAt), and receipt writes only ever add a
// person once because the audience is resolved once.
async function fanoutOnce(announcementId) {
  const announcement = await Announcement.findOne({ _id: announcementId, status: 'published' });
  if (!announcement || announcement.fanoutAt) return null;
  if (!(await registrarAudienceAllowed(announcement))) {
    announcement.status = 'archived';
    announcement.archivedAt = new Date();
    await announcement.save();
    logger.warn({ announcementId: String(announcement._id) }, 'restricted announcement audience failed revalidation');
    return null;
  }

  const [users, author, settings] = await Promise.all([
    resolveAudience({
      audience: announcement.audience,
      audienceRole: announcement.audienceRole,
      audienceUser: announcement.audienceUser,
    }),
    User.findById(announcement.createdBy).select('name email').lean(),
    getSettings().catch(() => null),
  ]);
  // The switch in Settings is the whole-college default. The composer can request email
  // for one notice, but it cannot override an administrator who has turned college
  // announcement email off.
  const emailAllowed = announcement.sendEmail && settings?.email?.announcementEmails !== false;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + NOTIFICATION_TTL_MS);
  const actorName = author?.name || author?.email || 'Administration';
  const preview = announcement.body.length > 300 ? `${announcement.body.slice(0, 297)}...` : announcement.body;

  const docs = users.map((user) => ({
    userId: user._id,
    type: 'announcement',
    title: announcement.title,
    body: preview,
    actorId: announcement.createdBy,
    actorName,
    meta: {
      announcementId: String(announcement._id),
      announcementType: announcement.type,
      priority: announcement.priority,
      pinned: announcement.pinned,
    },
    expiresAt,
  }));

  let notices = [];
  if (docs.length) {
    notices = await Notification.insertMany(docs, { ordered: false });
  }

  // Live tabs get the notice immediately. Push also goes to every subscribed browser,
  // not only when no tab happens to be open: the same person may have a phone with the
  // portal closed while a desktop tab is connected. The shared tag lets the service
  // worker replace the live copy on the device that is already open.
  notices.forEach((notice, index) => {
    const user = users[index];
    stream.sendToUser(user._id, 'notification', notificationPayload(notice));
    void push
      .sendToUser(user._id, {
        kind: 'notification',
        ...notificationPayload(notice),
        tag: `sms-${notice._id}`,
        url: '/notifications',
      })
      .catch(() => {});
  });

  announcement.recipients = users.map((user) => ({ user: user._id, deliveredAt: now }));
  announcement.recipientCount = users.length;
  announcement.deliveredCount = users.length;
  announcement.readCount = 0;
  announcement.fanoutAt = now;
  announcement.emailStatus = emailAllowed && users.length ? 'pending' : 'none';
  await announcement.save();

  if (emailAllowed && users.length) {
    void sendAnnouncementEmails(announcement._id).catch((err) =>
      logger.error({ err: err.message }, 'announcement email job failed'),
    );
  }

  return { recipients: users.length };
}

// The scheduler may retry a partially completed fan-out. This small in-process guard
// keeps the normal publish request and the retry tick from inserting the same notices
// at the same time.
async function fanout(announcementId) {
  const key = String(announcementId);
  if (fanoutJobs.has(key)) return null;
  fanoutJobs.add(key);
  try {
    return await fanoutOnce(announcementId);
  } finally {
    fanoutJobs.delete(key);
  }
}

// Claiming the row in the database makes two administrators pressing Publish at once
// safe: only one request changes draft/scheduled to published.
export async function publishAnnouncement(id, { userId } = {}) {
  const now = new Date();
  const existing = await Announcement.findById(id);
  if (!existing) return { status: 'missing' };
  if (existing.status === 'archived') return { status: 'archived' };
  if (existing.status === 'expired') return { status: 'expired' };
  if (existing.status === 'published') return { status: 'already', announcement: existing };
  if (!(await registrarAudienceAllowed(existing))) {
    existing.status = 'archived';
    existing.archivedAt = now;
    await existing.save();
    return { status: 'invalid_audience', announcement: existing };
  }

  const claimed = await Announcement.findOneAndUpdate(
    { _id: id, status: oneOf(['draft', 'scheduled']) },
    {
      $set: {
        status: 'published',
        publishedAt: now,
        fanoutAt: null,
        recipientCount: 0,
        deliveredCount: 0,
        readCount: 0,
        emailSentCount: 0,
        emailFailedCount: 0,
        emailStatus: 'none',
        recipients: [],
        ...(userId ? { updatedBy: userId } : {}),
      },
    },
    { new: true },
  );

  if (!claimed) {
    const current = await Announcement.findById(id);
    return { status: 'already', announcement: current };
  }

  await fanout(claimed._id);
  return { status: 'published', announcement: await Announcement.findById(id) };
}

export async function publishDueAnnouncements() {
  const now = new Date();
  const due = await Announcement.find(trusted({
    status: 'scheduled',
    $or: [{ publishAt: null }, { publishAt: atOrBefore(now) }],
  }))
    .select('_id')
    .limit(20)
    .lean();

  for (const row of due) {
    try {
      await publishAnnouncement(row._id);
    } catch (err) {
      logger.error({ err: err.message, id: String(row._id) }, 'scheduled announcement could not be published');
    }
  }
  return due.length;
}

export async function expireAnnouncements() {
  const now = new Date();
  const result = await Announcement.updateMany(
    {
      status: oneOf(['scheduled', 'published']),
      expiresAt: trusted({ $ne: null, $lte: now }),
    },
    { $set: { status: 'expired' } },
  );
  return result.modifiedCount ?? 0;
}

export async function markAnnouncementRead(announcementId, userId) {
  const result = await Announcement.updateOne(
    { _id: announcementId, 'recipients.user': userId, 'recipients.readAt': null },
    { $set: { 'recipients.$.readAt': new Date() }, $inc: { readCount: 1 } },
  );
  return result.modifiedCount > 0;
}

export async function markAnnouncementReadMany(announcementIds, userId) {
  if (!announcementIds.length) return 0;
  const result = await Announcement.updateMany(
    { _id: oneOf(announcementIds), 'recipients.user': userId, 'recipients.readAt': null },
    { $set: { 'recipients.$.readAt': new Date() }, $inc: { readCount: 1 } },
  );
  return result.modifiedCount ?? 0;
}

async function sendAnnouncementEmails(announcementId) {
  const jobKey = String(announcementId);
  if (emailJobs.has(jobKey)) return;
  emailJobs.add(jobKey);

  try {
    // The claim covers both a fresh job and a job left in "sending" by a restart. The
    // in-process set above prevents two ticks in this process from racing each other.
    const announcement = await Announcement.findOneAndUpdate(
      { _id: announcementId, emailStatus: oneOf(['pending', 'sending']) },
      { $set: { emailStatus: 'sending' } },
      { new: true },
    );
    if (!announcement) return;

    const users = await User.find({ _id: oneOf(announcement.recipients.map((row) => row.user)) })
      .select('_id name email preferences.emailAnnouncements')
      .lean();
    const byId = new Map(users.map((user) => [String(user._id), user]));
    let sent = 0;
    let failed = 0;

    for (const receipt of announcement.recipients) {
      // A retry after a partial run must not send the same message twice.
      if (receipt.emailSentAt) {
        sent += 1;
        continue;
      }
      const user = byId.get(String(receipt.user));
      if (!user?.email) {
        failed += 1;
        continue;
      }
      if (user.preferences?.emailAnnouncements === false) {
        receipt.emailError = 'Recipient preference is off';
        continue;
      }
      try {
        const ok = await sendAnnouncementEmail({
          to: user.email,
          name: user.name,
          title: announcement.title,
          body: announcement.body,
          priority: announcement.priority,
          type: announcement.type,
          publishedAt: announcement.publishedAt,
        });
        if (ok) {
          sent += 1;
          receipt.emailSentAt = new Date();
          receipt.emailError = '';
        } else {
          failed += 1;
          receipt.emailError = 'Delivery failed';
        }
      } catch (err) {
        failed += 1;
        receipt.emailError = String(err.message || 'Delivery failed').slice(0, 180);
      }
    }

    announcement.emailSentCount = sent;
    announcement.emailFailedCount = failed;
    announcement.emailStatus = sent ? (failed ? 'partial' : 'sent') : failed ? 'failed' : 'none';
    await announcement.save();
  } finally {
    emailJobs.delete(jobKey);
  }
}

// A process restart, a crashed email worker or a publish that reached the database but
// failed before fan-out must not leave an announcement silently stranded. The scheduler
// calls this every tick; every operation is safe to repeat and existing notices are not
// duplicated by the in-process guards above.
export async function resumeAnnouncementJobs() {
  const [unfanned, emails] = await Promise.all([
    Announcement.find({ status: 'published', fanoutAt: null }).select('_id').limit(20).lean(),
    Announcement.find({
      status: oneOf(['published', 'expired']),
      emailStatus: oneOf(['pending', 'sending']),
    })
      .select('_id')
      .limit(5)
      .lean(),
  ]);

  for (const row of unfanned) {
    try {
      await fanout(row._id);
    } catch (err) {
      logger.error({ err: err.message, id: String(row._id) }, 'announcement fan-out could not be resumed');
    }
  }
  for (const row of emails) {
    await sendAnnouncementEmails(row._id).catch((err) =>
      logger.error({ err: err.message, id: String(row._id) }, 'announcement email job could not be resumed'),
    );
  }
}

// A small scheduler runs in the API process. It is deliberately not a second service:
// the school has one server, and the database is the source of truth if the process
// restarts. Both operations are safe to run repeatedly.
export function startAnnouncementScheduler({ intervalMs = 30_000 } = {}) {
  const tick = async () => {
    try {
      await publishDueAnnouncements();
      await expireAnnouncements();
      await resumeAnnouncementJobs();
    } catch (err) {
      logger.error({ err: err.message }, 'announcement scheduler tick failed');
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}
