/**
 * What this device knows about the hubs it uses — the tablet half of the desktop
 * LAN hub (`Plans/DESKTOP_FREENET_PLUGIN.md` §6.4, `Plans/APK_FREENET_PLUGIN.md` §8a).
 *
 * A tablet can point at two shapes of hub, and it cannot tell them apart by
 * address:
 *
 * - a repo checkout running `npm run dev`, which serves every route and wants no
 *   credential;
 * - a packaged **PUF-AM desktop**, whose LAN listener serves a scoped subset and
 *   requires a device token obtained once with a pairing code.
 *
 * So the hub says which it is (`GET /api/hub/info`) and this module remembers the
 * answer alongside the token. Both are cached in `localStorage` because
 * `apiUrl()` has to route the very first request of a cold start synchronously —
 * an async lookup there would mean the first fetch after launch went to the wrong
 * place, which is precisely the class of bug the hub handshake exists to remove.
 *
 * Credentials are stored per hub base, not globally: a tablet that visits two
 * sheds should not lose the first one's pairing by pairing with the second.
 *
 * Deliberately imports nothing from `apiBase.ts` — that module reads *this* one,
 * and a cycle between them would resolve differently depending on which loaded
 * first.
 */

import { type HubInfo, isHubInfo } from '../../shared/sync/hubInfo.ts';

export type { HubInfo };

const STORAGE_KEY = 'pufom_hub_creds';

export type HubCredential = {
  /** Device token from `POST /api/hub/pair`. Absent for a hub that needs none. */
  token?: string;
  /** Last `/api/hub/info` answer, so routing decisions survive a cold start. */
  info?: HubInfo;
  pairedAt?: string;
};

type HubCredentialStore = Record<string, HubCredential>;

/**
 * Storage key for a hub. Only has to be stable and collision-free — the real
 * normalisation for *requests* is `normalizeHubBase()` in `apiBase.ts`, and this
 * must not depend on it (see the module note above).
 */
export function hubKey(base: string): string {
  return base.trim().toLowerCase().replace(/\/+$/, '');
}

function readStore(): HubCredentialStore {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as HubCredentialStore;
  } catch {
    return {};
  }
}

function writeStore(store: HubCredentialStore): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A full or blocked quota costs re-pairing at next launch, not this session.
  }
}

export function getHubCredential(base: string): HubCredential | null {
  const key = hubKey(base);
  if (!key) return null;
  return readStore()[key] ?? null;
}

export function saveHubCredential(base: string, patch: HubCredential): void {
  const key = hubKey(base);
  if (!key) return;
  const store = readStore();
  store[key] = { ...store[key], ...patch };
  writeStore(store);
}

export function forgetHubCredential(base: string): void {
  const key = hubKey(base);
  if (!key) return;
  const store = readStore();
  delete store[key];
  writeStore(store);
}

export function getHubToken(base: string): string {
  return getHubCredential(base)?.token ?? '';
}

export function getHubInfo(base: string): HubInfo | null {
  const info = getHubCredential(base)?.info;
  return isHubInfo(info) ? info : null;
}

/**
 * True when this hub asked for a device token and we have not got one. The
 * distinction from "no hub at all" matters: the operator is one pairing code
 * away, not one Wi‑Fi network away.
 */
export function hubNeedsPairing(base: string): boolean {
  const cred = getHubCredential(base);
  if (!cred?.info) return false;
  return cred.info.pairingRequired && !cred.token;
}
