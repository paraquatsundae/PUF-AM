/**
 * Local “remember this device” helpers for invite-PIN auth.
 * Firebase Auth persistence (IndexedDB) keeps the session; these keys
 * only help the login form when a re-auth is needed.
 */

const DISPLAY_NAME_KEY = 'pufom.auth.lastDisplayName';
const REMEMBERED_KEY = 'pufom.auth.deviceRemembered';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function getLastDisplayName(): string {
  return storage()?.getItem(DISPLAY_NAME_KEY)?.trim() ?? '';
}

export function markDeviceRemembered(displayName: string): void {
  const s = storage();
  if (!s) return;
  const name = displayName.trim();
  if (name) s.setItem(DISPLAY_NAME_KEY, name);
  s.setItem(REMEMBERED_KEY, '1');
}

/** Clears the remembered-device flag on logout; keeps last name for prefill. */
export function clearDeviceRememberedFlag(): void {
  storage()?.removeItem(REMEMBERED_KEY);
}

export function isDeviceMarkedRemembered(): boolean {
  return storage()?.getItem(REMEMBERED_KEY) === '1';
}
