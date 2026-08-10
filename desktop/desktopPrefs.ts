/**
 * Operator preferences the *main* process has to know before a window exists.
 *
 * The mist opt-in decides whether a Freenet node is spawned at launch, which
 * happens long before the renderer (and its `localStorage`) is alive — so it
 * cannot live where the rest of the app's preferences live. A small JSON file
 * under `userData` is the whole mechanism.
 *
 * The LAN hub settings live here for a second reason as well as that one: the
 * pairing code and the paired tablets have to *survive relaunches*, or every
 * tablet in the shed would need re-pairing each morning. Only the SHA-256 of each
 * device token is stored, so this file is not a set of hub credentials.
 *
 * Imports nothing from `electron` so it stays testable in plain Node; `main.ts`
 * supplies the path. See `Plans/DESKTOP_FREENET_PLUGIN.md` §9, §6.4 and §14.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  LAN_HUB_DEFAULT_PORT,
  isHubId,
  normalizePairingCode,
  type LanHubDevice,
} from './lanHubAuth.ts';
import { APP_LOCAL_PORT_DEFAULT, coerceAppPort } from './localApiPort.ts';

export const DESKTOP_PREFS_FILENAME = 'desktop-prefs.json';

export type DesktopPrefs = {
  /** Start the app-owned Freenet node at launch and show the mist surfaces. */
  mistEnabled: boolean;
  /**
   * Serve the scoped LAN API so other PUF-AM devices on this Wi‑Fi can sync
   * through this one. **Opt-out**: absent means on.
   *
   * It was opt-in until auto-sync, and that was the wrong default for a shed. A
   * laptop that has not been switched on in Settings is invisible: the tablet
   * finds no peer, so the farm goes over Freenet — minutes, and only if a node
   * is up — or nowhere at all, and the operator has no way to tell which of the
   * two machines they were supposed to configure. Serving is also the cheap
   * side: an idle listener costs a socket, while not serving costs the whole
   * Wi‑Fi rung of the sync ladder.
   *
   * It is not an open door. Every `/api/sync/*` path stays behind the paired
   * device token (`lanHubAuth.ts`), pairing needs a code read off this screen,
   * and the only routes reachable without one are health, hub info and pairing
   * itself. An operator who wants it off still turns it off, and that choice is
   * respected — a stored `false` is honoured, only an *absent* value means on.
   */
  lanHubEnabled: boolean;
  /** Preferred LAN port. The listener walks upwards if it is taken. */
  lanHubPort: number;
  /** `XXXX-XXXX` shown in Settings. Minted on first enable, rotatable. */
  lanHubPairingCode: string;
  /** Paired tablets, by token hash. */
  lanHubDevices: LanHubDevice[];
  /**
   * This install's `hubId`, published in `/api/hub/info`.
   *
   * Persisted for the same reason the pairing code is: a tablet recognises the
   * hub it paired with by this value, so one that changed every launch would ask
   * for a pairing code every morning at the gateway address. Not a secret — see
   * the field's note in `shared/sync/hubInfo.ts`.
   */
  lanHubId: string;
  /**
   * Loopback port the renderer is served from — **the origin's identity**.
   *
   * Chromium keys `localStorage` and IndexedDB by origin, and the renderer's
   * origin is `http://127.0.0.1:<this>`. While this was an ephemeral port, every
   * launch was a different origin and therefore a different, empty storage
   * bucket: the mist device session and the IndexedDB farm from yesterday were
   * still on disk and unreachable, so the operator who created the farm had to
   * re-enter their FarmCode and a join ticket at every launch. Persisting the
   * bound port is what makes "open the app and you are in" possible at all.
   *
   * Written back after binding rather than trusted blindly: if something else
   * has taken the saved port the listener walks upward, and the new one is what
   * gets saved.
   */
  appPort: number;
};

export const DESKTOP_PREFS_DEFAULT: DesktopPrefs = {
  mistEnabled: false,
  lanHubEnabled: true,
  lanHubPort: LAN_HUB_DEFAULT_PORT,
  lanHubPairingCode: '',
  lanHubDevices: [],
  lanHubId: '',
  appPort: APP_LOCAL_PORT_DEFAULT,
};

export function desktopPrefsPath(userDataDir: string): string {
  return path.join(userDataDir, DESKTOP_PREFS_FILENAME);
}

function coercePort(raw: unknown): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return LAN_HUB_DEFAULT_PORT;
  return port;
}

/** A device with no usable token hash is unauthenticatable, so it is not a device. */
function coerceDevices(raw: unknown): LanHubDevice[] {
  if (!Array.isArray(raw)) return [];
  const out: LanHubDevice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const device = item as Partial<LanHubDevice>;
    if (typeof device.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(device.tokenHash)) continue;
    if (typeof device.id !== 'string' || !device.id) continue;
    out.push({
      id: device.id,
      name: typeof device.name === 'string' && device.name ? device.name : 'Tablet',
      tokenHash: device.tokenHash,
      pairedAt: typeof device.pairedAt === 'string' ? device.pairedAt : new Date(0).toISOString(),
      ...(typeof device.lastSeenAt === 'string' ? { lastSeenAt: device.lastSeenAt } : {}),
    });
  }
  return out;
}

function normalize(parsed: Partial<DesktopPrefs> | null): DesktopPrefs {
  return {
    mistEnabled: parsed?.mistEnabled === true,
    // Opt-*out*, unlike everything else here: only an explicit `false` turns the
    // hub off, so a prefs file written before this became the default — and a
    // hand-edited one with junk in the field — still serves the Wi‑Fi rung.
    lanHubEnabled: parsed?.lanHubEnabled !== false,
    lanHubPort: coercePort(parsed?.lanHubPort),
    lanHubPairingCode: normalizePairingCode(parsed?.lanHubPairingCode),
    lanHubDevices: coerceDevices(parsed?.lanHubDevices),
    // Minted by `main.ts` on first use rather than here, so a prefs read never
    // has a side effect. A junk value is dropped instead of served.
    lanHubId: isHubId(parsed?.lanHubId) ? parsed.lanHubId : '',
    // A prefs file written before the port was persisted has none, and gets the
    // default — which is the port that install will now keep for good.
    appPort: coerceAppPort(parsed?.appPort),
  };
}

/**
 * Never throws. A missing file is the normal first-launch case, and a corrupt one
 * must degrade to the defaults rather than stop the app booting: mist **off**,
 * because a Freenet node is a process an operator asked for, and the LAN hub
 * **on**, because a laptop that cannot be found is the failure this app was
 * being blamed for.
 */
export function readDesktopPrefs(file: string): DesktopPrefs {
  try {
    return normalize(JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopPrefs> | null);
  } catch {
    return { ...DESKTOP_PREFS_DEFAULT, lanHubDevices: [] };
  }
}

/** Returns the normalised prefs so main can hold exactly what is on disk. */
export function writeDesktopPrefs(file: string, prefs: DesktopPrefs): DesktopPrefs {
  const next = normalize(prefs);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch {
    // An unwritable userData dir costs the operator the preference at next
    // launch, not this session — the caller has already acted on it.
  }
  return next;
}
