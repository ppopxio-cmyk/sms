import { api } from './api';

// Turning notifications on is always something the person chooses: the permission is
// only ever asked for after the button is pressed, never when the page loads.
// With the tab open a notice is shown by the page itself; with the tab closed the
// browser's push service delivers it to the service worker.

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

let cachedKey = null;

function urlBase64ToBytes(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

// The server is the one place the public key lives, so the browser and the sender can
// never end up with two different keys.
async function serverKey() {
  if (cachedKey) return cachedKey;
  const { data } = await api.get('/notifications/push/status');
  if (!data?.publicKey) throw new Error('Notifications are not available right now.');
  cachedKey = urlBase64ToBytes(data.publicKey);
  return cachedKey;
}

const usesKey = (subscription, key) => {
  const current = subscription?.options?.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
};

export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser cannot show notifications.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Your browser is still blocking notifications for this site.');
  }

  const key = await serverKey();
  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with an older key cannot be delivered to, so it is replaced.
  if (subscription && !usesKey(subscription, key)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }

  // Only the three fields the API knows about: toJSON() also carries expirationTime,
  // and the validator refuses anything it was not told about.
  const json = subscription.toJSON();
  await api.post('/notifications/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await api.post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
  return true;
}

// 'on' | 'off' | 'blocked' | 'unsupported' - what the switch should show.
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission !== 'granted') return 'off';
  try {
    const registration = await navigator.serviceWorker.ready;
    return (await registration.pushManager.getSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export async function showLocalNotification({ title, body, url, tag }) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'show-notification', title, body, url, tag });
  } catch {
    // the bell and the list still update; only the pop-up is missed
  }
}
