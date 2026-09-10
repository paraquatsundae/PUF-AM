/**
 * Per-farm "Freenet pack enabled" flag — the network pack's plugin setting.
 *
 * Decision 6 of Plans/FREENET_NETWORK_PACK.md: the pack is enabled per farm,
 * like a crop pack, and the node is per device. A Freenet-native farm keeps its
 * farm meta on the device, so the flag lives beside it in localStorage under
 * `pufam.networkPacks.v1.{farmId}` (Plans/NAMING.md §5). A cloud farm will
 * carry the same flag on its Firestore farm doc when hybrid lands (§3); until
 * then this store is only consulted for Freenet-native farms.
 *
 * Default when nothing is recorded: **enabled**. The farm was created by
 * choosing Freenet on the start screen, which is the operator's answer — the
 * flag only exists so they can turn the node *off* for a farm without leaving it.
 *
 * Pure: no React. `subscribe` lets the reconciler hook re-read after a toggle
 * without a page reload, and covers `storage` events from another tab.
 */

const KEY_PREFIX = 'pufam.networkPacks.v1.';

export type NetworkPackFlags = {
  freenet_host?: { enabled: boolean; changedAt: string };
};

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function key(farmId: string): string {
  return `${KEY_PREFIX}${farmId}`;
}

export function readNetworkPackFlags(farmId: string): NetworkPackFlags {
  const raw = ls()?.getItem(key(farmId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as NetworkPackFlags) : {};
  } catch {
    return {};
  }
}

/** True unless the operator has switched the pack off for this farm. */
export function isFreenetHostEnabled(farmId: string | null | undefined): boolean {
  if (!farmId) return false;
  return readNetworkPackFlags(farmId).freenet_host?.enabled !== false;
}

/** Whether the operator ever touched the toggle — the tile words the default differently. */
export function hasFreenetHostChoice(farmId: string): boolean {
  return readNetworkPackFlags(farmId).freenet_host !== undefined;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function setFreenetHostEnabled(farmId: string, enabled: boolean): void {
  const flags = readNetworkPackFlags(farmId);
  flags.freenet_host = { enabled, changedAt: new Date().toISOString() };
  ls()?.setItem(key(farmId), JSON.stringify(flags));
  for (const fn of listeners) fn();
}

/** Notified after any `setFreenetHostEnabled` in this tab, and on cross-tab `storage` events. */
export function subscribeFreenetHostEnabled(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(KEY_PREFIX)) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
