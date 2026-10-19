/* A minimal service worker. It shows notifications - including ones that arrive while
   the tab is closed - and opens the portal when one is clicked. It caches nothing on
   purpose, so it can never serve a stale page. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'SMS - PORTAL';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'sms-portal',
    data: { url: data.url || '/notifications' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if (client.navigate) await client.navigate(target.href).catch(() => {});
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// The page asks for this when a notice arrives while the tab is already open, so one
// that arrives live looks exactly like one that arrived with the tab closed.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'show-notification') return;

  self.registration.showNotification(data.title || 'SMS - PORTAL', {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'sms-portal',
    data: { url: data.url || '/notifications' },
  });
});
