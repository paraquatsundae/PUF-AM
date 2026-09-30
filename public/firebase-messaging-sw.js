/* Directed-notify web push. Config is posted by the page (public web keys only). */
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

const DB_NAME = 'pufam_notify_sw';
let started = false;

function readConfig() {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly');
      const get = tx.objectStore('kv').get('web');
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

function start(config) {
  if (started || !config || !config.apiKey || !config.messagingSenderId || !config.appId) return;
  started = true;
  firebase.initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    storageBucket: config.storageBucket || undefined,
  });
  firebase.messaging();
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim().then(() => readConfig().then(start)));
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'pufam-notify-config') return;
  start(data.config);
  const port = event.ports && event.ports[0];
  if (port) port.postMessage({ ok: started });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/map';
  event.waitUntil(self.clients.openWindow(url));
});
