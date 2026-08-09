/**
 * Deciding which machine is this device's PUF-AM hub.
 *
 * A packaged APK hosts no Express and no Freenet node, so every `/api/*` call it
 * makes has to leave the tablet. Until this runs there is nowhere to send them:
 * `getApiBaseUrl()` deliberately answers `''` rather than guessing, because the
 * guess it used to make — `10.0.2.2:3000`, the Android *emulator's* alias for the
 * dev machine — is an unroutable address on a real tablet and turned every LAN
 * feature into a bare "Failed to fetch".
 *
 * Order of preference, and why:
 *   1. A hub already chosen (typed in, or restored from a previous session) —
 *      the operator's choice outranks discovery, but it is still probed, because
 *      the shed laptop's DHCP lease changes and a stale hub is worse than none.
 *   2. Native NSD for `_pufom-sync._tcp` — the laptop running `npm run dev`
 *      advertises itself, so the tablet needs no address typed at all.
 *   3. The emulator alias, but only if something actually answers on it. That
 *      keeps the emulator workflow working without inflicting it on hardware.
 *
 * Plan: `Plans/APK_FREENET_PLUGIN.md` — Option A, the shed/LAN hub.
 */

import type { HubInfo } from '../../shared/sync/hubInfo';
import {
  EMULATOR_HOST_BASE,
  getApiBaseUrl,
  isPackagedNativeAndroid,
  normalizeHubBase,
} from './apiBase';
import { getHubToken } from './hubIdentity';
import { fetchHubInfo } from './hubPairing';
import { discoverNsdPeers, nsdBrowseAvailable } from './nsdPeers';
import { setSelectedSyncPeerBase } from './mdnsPeers';

export type SyncHubResolution = {
  /** '' when nothing answered — callers should say so rather than fetch blind. */
  baseUrl: string;
  source: 'existing' | 'nsd' | 'emulator' | 'none';
  /** What the hub said about itself, when it answered the handshake. */
  info?: HubInfo | null;
  /**
   * The hub wants a device token and this tablet has none. Distinct from "no hub"
   * because the fix is a pairing code from the laptop, not a different Wi‑Fi.
   */
  needsPairing?: boolean;
};

/** Liveness check against a candidate hub. Never throws. */
export async function probeHubBase(baseUrl: string, timeoutMs = 2500): Promise<boolean> {
  const base = normalizeHubBase(baseUrl);
  if (!base) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let inFlight: Promise<SyncHubResolution> | null = null;

/**
 * Ask the hub what it is, and whether this tablet may use it.
 *
 * Always after the base is settled, never before: a packaged PUF-AM desktop hub
 * requires a paired device token, and finding that out at discovery time is what
 * lets *Offline & sync* say "enter the pairing code" instead of showing a hub
 * that 401s everything the operator then presses.
 */
async function describe(baseUrl: string, source: SyncHubResolution['source']) {
  const info = await fetchHubInfo(baseUrl);
  return {
    baseUrl,
    source,
    info,
    needsPairing: Boolean(info?.pairingRequired) && !getHubToken(baseUrl),
  } satisfies SyncHubResolution;
}

async function resolve(force: boolean): Promise<SyncHubResolution> {
  // Browser, live-reload APK and Electron are all same-origin already; there is
  // no second machine to find and nothing here should override their base.
  if (!isPackagedNativeAndroid()) {
    return { baseUrl: getApiBaseUrl(), source: 'existing' };
  }

  const current = getApiBaseUrl();
  if (current && !force) {
    if (await probeHubBase(current)) return describe(current, 'existing');
  }

  if (nsdBrowseAvailable()) {
    try {
      const peers = await discoverNsdPeers(3500);
      const peer = peers[0];
      if (peer) {
        setSelectedSyncPeerBase(peer.baseUrl);
        return describe(peer.baseUrl, 'nsd');
      }
    } catch {
      /* NSD is a convenience; the manual address field is the fallback. */
    }
  }

  if (await probeHubBase(EMULATOR_HOST_BASE, 1200)) {
    setSelectedSyncPeerBase(EMULATOR_HOST_BASE);
    return describe(EMULATOR_HOST_BASE, 'emulator');
  }

  // A hub that was chosen once but did not answer is kept as the remembered
  // value — the laptop is probably just asleep, and clearing it would make the
  // operator type the address again for a fault that fixes itself.
  return { baseUrl: current, source: current ? 'existing' : 'none' };
}

/**
 * Idempotent per call-site burst: several cards mount at once on Settings and
 * none of them should each start their own NSD browse.
 */
export function ensureSyncHub(options?: { force?: boolean }): Promise<SyncHubResolution> {
  if (inFlight && !options?.force) return inFlight;
  const run = resolve(Boolean(options?.force)).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** Operator typed an address. Probe before accepting so the error is immediate. */
export async function useManualHub(input: string): Promise<SyncHubResolution> {
  const base = normalizeHubBase(input);
  if (!base) {
    throw new Error('That does not look like an address — try 192.168.1.20:3000.');
  }
  if (!(await probeHubBase(base, 4000))) {
    throw new Error(
      `Nothing answered at ${base}. Check the laptop is on this Wi‑Fi and PUF-AM is running there.`,
    );
  }
  setSelectedSyncPeerBase(base);
  return describe(base, 'existing');
}
