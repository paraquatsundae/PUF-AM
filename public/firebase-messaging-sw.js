/* Directed alerts. The page subscribes with the server's public key; this worker shows the banner. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'PUF-AM';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const url = typeof payload.url === 'string' && payload.url ? payload.url : '/map';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/map';
  event.waitUntil(self.clients.openWindow(url));
});
