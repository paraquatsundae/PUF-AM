/**
 * Local “remember this device” helpers for invite-PIN auth.
 * Firebase Auth persistence (IndexedDB) keeps the session across reloads —
 * these keys only help the login form when a re-auth is needed (session wiped).
 */

const DISPLAY_NAME_KEY = 'pufom.auth.lastDisplayName';
const REMEMBERED_KEY = 'pufom.auth.deviceRemembered';
const FARM_ID_KEY = 'pufom.auth.lastFarmId';
const FARM_NAME_KEY = 'pufom.auth.lastFarmName';

export type RememberedFarm = {
  farmId: string;
  farmName: string;
};

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

export function getLastFarm(): RememberedFarm | null {
  const s = storage();
  if (!s) return null;
  const farmId = s.getItem(FARM_ID_KEY)?.trim() || '';
  const farmName = s.getItem(FARM_NAME_KEY)?.trim() || '';
  if (!farmId) return null;
  return { farmId, farmName: farmName || 'Your farm' };
}

export function markDeviceRemembered(
  displayName: string,
  farm?: { farmId?: string; farmName?: string } | null
): void {
  const s = storage();
  if (!s) return;
  const name = displayName.trim();
  if (name) s.setItem(DISPLAY_NAME_KEY, name);
  s.setItem(REMEMBERED_KEY, '1');
  const farmId = farm?.farmId?.trim();
  if (farmId) {
    s.setItem(FARM_ID_KEY, farmId);
    const farmName = farm?.farmName?.trim();
    if (farmName) s.setItem(FARM_NAME_KEY, farmName);
  }
}

/** Clears the remembered-device flag on logout; keeps last name + farm for welcome-back. */
export function clearDeviceRememberedFlag(): void {
  storage()?.removeItem(REMEMBERED_KEY);
}

/** Full reset when user taps “Not you?” on welcome-back. */
export function clearRememberedLoginHints(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(REMEMBERED_KEY);
  s.removeItem(FARM_ID_KEY);
  s.removeItem(FARM_NAME_KEY);
  // Keep display name — still useful as prefill for a new join.
}

export function isDeviceMarkedRemembered(): boolean {
  return storage()?.getItem(REMEMBERED_KEY) === '1';
}

/** True when we can show PIN-only welcome-back (name + farm known, session gone). */
export function canShowWelcomeBack(): boolean {
  return Boolean(getLastDisplayName() && getLastFarm());
}
