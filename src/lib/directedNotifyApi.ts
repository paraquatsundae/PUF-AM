/**
 * Register this browser for directed alerts, and ask the server to deliver one.
 * The server decides push vs email. This file never holds an SMTP password.
 */
import { getToken, getMessaging, isSupported } from 'firebase/messaging';
import { apiFetch, apiUrl } from './apiBase';
import { firebaseApp } from '../firebase';
import { isByoFirebase } from './byoFirebaseConfig';

const DB_NAME = 'pufam_notify_sw';

export type DirectedNotifyResult = {
  channel: 'push' | 'email' | 'unreachable' | 'skipped';
  message: string;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function deliverDirectedNotify(input: {
  farmId: string;
  targetUid: string;
  note: string;
  kind: 'highlight' | 'issue';
}): Promise<DirectedNotifyResult> {
  if (isByoFirebase() || !input.targetUid || input.targetUid.startsWith('name:')) {
    return { channel: 'skipped', message: '' };
  }
  const res = await apiFetch(apiUrl('/api/auth/notify-directed'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not send the notification.');
  }
  const channel = data.channel === 'push' || data.channel === 'email' ? data.channel : 'unreachable';
  return {
    channel,
    message: typeof data.message === 'string' ? data.message : '',
  };
}

function writeSwConfig(config: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(config, 'web');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function waitForWorker(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  if (reg.active) return reg.active;
  const worker = reg.installing || reg.waiting;
  if (!worker) return null;
  await new Promise<void>((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
    if (worker.state === 'activated') resolve();
  });
  return reg.active || worker;
}

export async function notifyPushStatus(): Promise<'ready' | 'needs-permission' | 'unsupported' | 'not-configured'> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (!(await isSupported().catch(() => false))) return 'unsupported';
  const res = await apiFetch(apiUrl('/api/auth/notify-config'));
  const data = await readJson(res);
  if (!res.ok || typeof data.vapidKey !== 'string' || !data.vapidKey) return 'not-configured';
  if (Notification.permission === 'granted') return 'ready';
  if (Notification.permission === 'denied') return 'unsupported';
  return 'needs-permission';
}

/** Ask (or reuse) notification permission and store this browser's token. */
export async function enableNotifyDevice(): Promise<'ready' | 'unsupported' | 'not-configured' | 'denied'> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (!(await isSupported().catch(() => false))) return 'unsupported';
  const res = await apiFetch(apiUrl('/api/auth/notify-config'));
  const data = await readJson(res);
  const vapidKey = typeof data.vapidKey === 'string' ? data.vapidKey : '';
  if (!res.ok || !vapidKey) return 'not-configured';

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const options = firebaseApp.options;
  const config = {
    apiKey: String(options.apiKey || ''),
    authDomain: String(options.authDomain || ''),
    projectId: String(options.projectId || ''),
    messagingSenderId: String(options.messagingSenderId || ''),
    appId: String(options.appId || ''),
    storageBucket: String(options.storageBucket || ''),
  };
  if (!config.messagingSenderId) return 'not-configured';
  await writeSwConfig(config);

  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const worker = await waitForWorker(reg);
  if (worker) {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const timer = window.setTimeout(resolve, 1500);
      channel.port1.onmessage = () => {
        window.clearTimeout(timer);
        resolve();
      };
      worker.postMessage({ type: 'pufam-notify-config', config }, [channel.port2]);
    });
  }

  const token = await getToken(getMessaging(firebaseApp), {
    vapidKey,
    serviceWorkerRegistration: reg,
  });
  if (!token) return 'unsupported';
  const save = await apiFetch(apiUrl('/api/auth/notify-device'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!save.ok) {
    const body = await readJson(save);
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not save this device.');
  }
  return 'ready';
}
