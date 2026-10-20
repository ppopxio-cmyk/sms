import { Notification } from '../models/Notification.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signTicket, readTicket } from '../services/token.service.js';
import * as live from '../services/stream.service.js';
import { publicKey, pushReady, saveSubscription, removeSubscription } from '../services/push.service.js';
import { toPayload } from '../services/notification.service.js';
import { deviceFingerprint, deviceKey, ensureDeviceId } from '../utils/device.js';
import { audit } from '../services/audit.service.js';
import { markAnnouncementRead, markAnnouncementReadMany } from '../services/announcement.service.js';

const unreadFor = (userId) => Notification.countDocuments({ userId, readAt: null });

// A person only ever sees and clears their own notices: every query is filtered by the
// id that comes from their access token, never from the request.
export const list = asyncHandler(async (req, res) => {
  const { unread, page, limit } = req.valid.query;
  const filter = { userId: req.user.id };
  if (unread === '1') filter.readAt = null;

  const [total, unreadCount, rows] = await Promise.all([
    Notification.countDocuments(filter),
    unreadFor(req.user.id),
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);

  res.json({
    notifications: rows.map(toPayload),
    total,
    unread: unreadCount,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const unreadCount = asyncHandler(async (req, res) => {
  res.json({ unread: await unreadFor(req.user.id) });
});

export const markRead = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const notice = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user.id },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();

  if (!notice) throw new AppError(404, 'NOT_FOUND', 'That notification was not found.');

  // The announcement screen shows a real read percentage, so opening the notice also
  // stamps the person's receipt on the announcement itself.
  if (notice.type === 'announcement' && notice.meta?.announcementId) {
    await markAnnouncementRead(notice.meta.announcementId, req.user.id).catch(() => {});
  }
  res.json({ unread: await unreadFor(req.user.id) });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const pending = await Notification.find({ userId: req.user.id, readAt: null, type: 'announcement' })
    .select('meta')
    .lean();
  const announcementIds = [
    ...new Set(
      pending
        .map((notice) => notice.meta?.announcementId)
        .filter(Boolean),
    ),
  ];

  await Notification.updateMany({ userId: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
  if (announcementIds.length) {
    await markAnnouncementReadMany(announcementIds, req.user.id).catch(() => {});
  }
  res.json({ unread: 0 });
});

export const remove = asyncHandler(async (req, res) => {
  const { deletedCount } = await Notification.deleteOne({ _id: req.valid.params.id, userId: req.user.id });
  if (!deletedCount) throw new AppError(404, 'NOT_FOUND', 'That notification was not found.');
  res.json({ unread: await unreadFor(req.user.id) });
});

export const clearAll = asyncHandler(async (req, res) => {
  const { deletedCount } = await Notification.deleteMany({ userId: req.user.id });
  res.json({ removed: deletedCount, unread: 0 });
});

// EventSource cannot send an Authorization header, so the stream is opened with a
// short one-purpose ticket instead of the access token. It is bound to the person and
// to the session that asked for it, and it stops working after a minute.
export const streamTicket = asyncHandler(async (req, res) => {
  res.json({ ticket: signTicket(req.user.id, 'notifications-stream', '60s', { sid: req.user.sid }) });
});

export const stream = asyncHandler(async (req, res) => {
  const payload = readTicket(String(req.query.ticket || ''), 'notifications-stream');

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells nginx not to buffer the stream, which would hold notices until the tab closed.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const key = live.addClient(payload.sub, res, payload.sid);
  res.write(': connected\n\n');

  const close = () => live.removeClient(key);
  req.on('close', close);
  req.on('end', close);
});

export const pushStatus = asyncHandler(async (req, res) => {
  res.json({ publicKey: publicKey(), ready: pushReady() });
});

export const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  const key = deviceKey(deviceFingerprint(req), ensureDeviceId(req, res));
  await saveSubscription(req.user.id, {
    endpoint,
    keys,
    deviceKey: key,
    userAgent: req.get('user-agent'),
  });
  audit({ req, action: 'user.push_subscribed', targetType: 'user', targetId: req.user.id, meta: { deviceKey: key } });
  res.json({ message: 'Notifications are on for this browser.' });
});

export const unsubscribe = asyncHandler(async (req, res) => {
  await removeSubscription(req.user.id, req.body.endpoint);
  audit({ req, action: 'user.push_unsubscribed', targetType: 'user', targetId: req.user.id });
  res.json({ message: 'Notifications are off for this browser.' });
});
