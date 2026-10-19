import webpush from 'web-push';
import { env } from '../config/env.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { logger } from '../utils/logger.js';

// The browser's push service is what makes a notification arrive while the tab is
// closed. The keys are generated once (scripts/generate-env.js) and never leave the
// server, so the client only ever sees the public one.
let ready = false;
try {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  ready = true;
} catch (err) {
  logger.error({ err: err.message }, 'push notifications are unavailable: check VAPID keys');
}

export const pushReady = () => ready;
export const publicKey = () => env.VAPID_PUBLIC_KEY;

export async function saveSubscription(userId, { endpoint, keys, deviceKey, userAgent }) {
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      deviceKey: deviceKey ?? undefined,
      userAgent: (userAgent || '').slice(0, 300),
      lastSeenAt: new Date(),
    },
    { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' },
  );
  return true;
}

export const removeSubscription = (userId, endpoint) =>
  PushSubscription.deleteOne({ userId, endpoint });

export const removeForDevice = (userId, deviceKey) =>
  PushSubscription.deleteMany({ userId, deviceKey });

export const removeAllForUser = (userId) => PushSubscription.deleteMany({ userId });

// A 404 or 410 means the browser threw the subscription away; the row goes with it.
export async function sendToUser(userId, payload, { exceptDeviceKey } = {}) {
  if (!ready) return 0;
  const subs = await PushSubscription.find({ userId }).lean();
  let sent = 0;
  for (const sub of subs) {
    if (exceptDeviceKey && sub.deviceKey === exceptDeviceKey) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 600 },
      );
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        logger.warn({ err: err.message }, 'a push notification could not be delivered');
      }
    }
  }
  return sent;
}
