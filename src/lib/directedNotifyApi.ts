/**
 * Register this browser for directed alerts, and ask the server to deliver one.
 * The server decides push vs email. This file never holds an SMTP password.
 */
import { apiFetch, apiUrl } from './apiBase';
import { isByoFirebase } from './byoFirebaseConfig';

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

function urlBase64ToBytes(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function notifyPushStatus(): Promise<'ready' | 'needs-permission' | 'unsupported' | 'not-configured'> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported';
  }
  const res = await apiFetch(apiUrl('/api/auth/notify-config'));
  const data = await readJson(res);
  if (!res.ok || typeof data.vapidKey !== 'string' || !data.vapidKey) return 'not-configured';
  if (Notification.permission === 'granted') return 'ready';
  if (Notification.permission === 'denied') return 'unsupported';
  return 'needs-permission';
}

/** Ask (or reuse) notification permission and store this browser's token. */
export async function enableNotifyDevice(): Promise<'ready' | 'unsupported' | 'not-configured' | 'denied'> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return 'unsupported';
  }
  const res = await apiFetch(apiUrl('/api/auth/notify-config'));
  const data = await readJson(res);
  const vapidKey = typeof data.vapidKey === 'string' ? data.vapidKey : '';
  if (!res.ok || !vapidKey) return 'not-configured';

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToBytes(vapidKey),
  });
  const json = subscription.toJSON();
  const save = await apiFetch(apiUrl('/api/auth/notify-device'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: json }),
  });
  if (!save.ok) {
    const body = await readJson(save);
    throw new Error(typeof body.error === 'string' ? body.error : 'Could not save this device.');
  }
  return 'ready';
}
