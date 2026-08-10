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
 *   3. The **farm gateway** — the same hub at a remembered non-LAN address, so a
 *      tablet away from the shed Wi‑Fi still has something that speaks Freenet on
 *      its behalf (`farmGateway.ts`, `Plans/APK_FREENET_PLUGIN.md` §8d).
 *   4. The emulator alias, but only if something actually answers on it. That
 *      keeps the emulator workflow working without inflicting it on hardware.
 *
 * Plan: `Plans/APK_FREENET_PLUGIN.md` — Option A, the shed/LAN hub, and §8d for
 * the gateway rung that gives it reach.
 */

import type { HubInfo } from '../../shared/sync/hubInfo';
import {
  EMULATOR_HOST_BASE,
  getApiBaseUrl,
  isPackagedNativeAndroid,
  normalizeHubBase,
} from './apiBase';
import {
  classifyGatewayAddress,
  forgetFarmGateway,
  gatewayIdentityChanged,
  readFarmGateway,
  sameHubBase,
  saveFarmGateway,
  type FarmGateway,
  type GatewayVerdict,
} from './farmGateway';
import { adoptHubCredentialByHubId, forgetHubCredential, getHubToken } from './hubIdentity';
import { fetchHubInfo } from './hubPairing';
import { discoverNsdPeers, nsdBrowseAvailable } from './nsdPeers';
import { forgetRememberedSyncHub, setSelectedSyncPeerBase } from './mdnsPeers';

export type SyncHubResolution = {
  /** '' when nothing answered — callers should say so rather than fetch blind. */
  baseUrl: string;
  source: 'existing' | 'nsd' | 'gateway' | 'emulator' | 'none';
  /** What the hub said about itself, when it answered the handshake. */
  info?: HubInfo | null;
  /**
   * The hub wants a device token and this tablet has none. Distinct from "no hub"
   * because the fix is a pairing code from the laptop, not a different Wi‑Fi.
   */
  needsPairing?: boolean;
  /**
   * Something answered at the gateway address, and it is not the hub this tablet
   * paired with. The pairing was dropped rather than the token sent on.
   */
  identityChanged?: boolean;
};

/** A gateway is across a VPN or the internet, so give it longer than a LAN hop. */
export const GATEWAY_PROBE_TIMEOUT_MS = 6000;

/**
 * How many *consecutive* failed resolutions a remembered hub survives.
 *
 * One miss is a laptop asleep, and clearing the address for that would make the
 * operator retype it for a fault that fixes itself. But a tablet that moved to a
 * different network kept hammering the old Wi‑Fi's DHCP address on every request,
 * forever — mixed-content noise in the log and a bare "Failed to fetch" in every
 * card. Three misses in a row means the address is dead where this tablet now is,
 * and the honest state is "no hub — scan or type an address", not blind retries.
 */
export const HUB_STRIKE_LIMIT = 3;

const HUB_STRIKES_KEY = 'pufom_hub_probe_strikes';

type HubStrikes = { base: string; count: number };

/**
 * Pure so the drop rule has a test: one more failure against `base`, given what
 * was recorded before. Strikes belong to one address — a *different* remembered
 * hub starts back at one rather than inheriting the old address's misses.
 */
export function nextHubStrikes(prev: HubStrikes | null, base: string): HubStrikes {
  if (prev && prev.base === base) return { base, count: prev.count + 1 };
  return { base, count: 1 };
}

function readHubStrikes(): HubStrikes | null {
  try {
    const raw = localStorage.getItem(HUB_STRIKES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HubStrikes>;
    if (typeof parsed.base !== 'string' || typeof parsed.count !== 'number') return null;
    return { base: parsed.base, count: parsed.count };
  } catch {
    return null;
  }
}

function clearHubStrikes(): void {
  try {
    localStorage.removeItem(HUB_STRIKES_KEY);
  } catch {
    /* ignore */
  }
}

/** @returns true when the strike limit is reached and the hub should be dropped. */
function recordHubStrike(base: string): boolean {
  const strikes = nextHubStrikes(readHubStrikes(), base);
  try {
    localStorage.setItem(HUB_STRIKES_KEY, JSON.stringify(strikes));
  } catch {
    /* ignore */
  }
  return strikes.count >= HUB_STRIKE_LIMIT;
}

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

export type HubLadderRung = 'existing' | 'nsd' | 'gateway' | 'emulator';

/**
 * The order the rungs are tried in — pure, so each one has a test.
 *
 * Two judgement calls are worth stating, because they will look arbitrary later:
 *
 * **A remembered gateway does not outrank LAN discovery**, even though it is the
 * operator's own typed address and rule 1 above says a chosen hub comes first.
 * The gateway is the *same machine* as the hub NSD would find, reached the long
 * way: across a VPN, possibly over cellular, with the shed's upload speed at the
 * far end. When the tablet is standing next to the laptop, going out to the
 * internet and back to reach it would be slower and metered for no gain. So a
 * gateway that happens to be the current base is demoted below discovery, and
 * *only* then does it get its turn.
 *
 * **Everything else keeps its old place.** With no gateway saved this returns
 * exactly the ladder that shipped, which is what makes the change safe for every
 * tablet already in a shed.
 */
export function hubLadderOrder(input: {
  hasExisting: boolean;
  /** The current base *is* the saved gateway, so trying it first would skip LAN. */
  existingIsGateway: boolean;
  hasGateway: boolean;
  nsdAvailable: boolean;
  /** The operator pressed Scan: re-discover rather than trust what is set. */
  force: boolean;
}): HubLadderRung[] {
  const rungs: HubLadderRung[] = [];
  if (input.hasExisting && !input.force && !input.existingIsGateway) rungs.push('existing');
  if (input.nsdAvailable) rungs.push('nsd');
  if (input.hasGateway) rungs.push('gateway');
  rungs.push('emulator');
  return rungs;
}

/**
 * Refuse to keep using a pairing when the machine at the gateway address is not
 * the hub it was minted for.
 *
 * The `hubId` is not a credential (`shared/sync/hubInfo.ts`), so this cannot stop
 * a determined impostor — it stops the ordinary version of the problem: an
 * address reassigned by DHCP, a port forward pointed somewhere else, a second
 * PUF-AM install on the same tailnet. The token is dropped rather than sent, and
 * the operator is asked for a pairing code, which is the honest state.
 */
function guardGatewayIdentity(
  gateway: FarmGateway,
  resolution: SyncHubResolution,
): SyncHubResolution {
  if (!gatewayIdentityChanged(gateway.hubId, resolution.info?.hubId)) return resolution;
  forgetHubCredential(gateway.base);
  return { ...resolution, needsPairing: true, identityChanged: true };
}

async function resolve(force: boolean): Promise<SyncHubResolution> {
  // Browser, live-reload APK and Electron are all same-origin already; there is
  // no second machine to find and nothing here should override their base.
  if (!isPackagedNativeAndroid()) {
    return { baseUrl: getApiBaseUrl(), source: 'existing' };
  }

  const current = getApiBaseUrl();
  const gateway = readFarmGateway();
  const order = hubLadderOrder({
    hasExisting: Boolean(current),
    existingIsGateway: Boolean(current && gateway && sameHubBase(current, gateway.base)),
    hasGateway: Boolean(gateway),
    nsdAvailable: nsdBrowseAvailable(),
    force,
  });

  let existingProbeFailed = false;

  for (const rung of order) {
    if (rung === 'existing') {
      if (await probeHubBase(current)) {
        clearHubStrikes();
        return describe(current, 'existing');
      }
      existingProbeFailed = true;
      continue;
    }

    if (rung === 'nsd') {
      try {
        const peers = await discoverNsdPeers(3500);
        const peer = peers[0];
        if (peer) {
          clearHubStrikes();
          setSelectedSyncPeerBase(peer.baseUrl);
          return describe(peer.baseUrl, 'nsd');
        }
      } catch {
        /* NSD is a convenience; the manual address field is the fallback. */
      }
      continue;
    }

    if (rung === 'gateway') {
      if (!gateway) continue;
      if (!(await probeHubBase(gateway.base, GATEWAY_PROBE_TIMEOUT_MS))) continue;
      clearHubStrikes();
      setSelectedSyncPeerBase(gateway.base);
      return guardGatewayIdentity(gateway, await describe(gateway.base, 'gateway'));
    }

    if (await probeHubBase(EMULATOR_HOST_BASE, 1200)) {
      clearHubStrikes();
      setSelectedSyncPeerBase(EMULATOR_HOST_BASE);
      return describe(EMULATOR_HOST_BASE, 'emulator');
    }
  }

  // A hub that was chosen once but did not answer is kept as the remembered
  // value — the laptop is probably just asleep, and clearing it would make the
  // operator type the address again for a fault that fixes itself. But not
  // forever: each failed resolution is a strike, and at the limit the address is
  // dropped so the operator is *asked* rather than every request fetching into
  // the void at an address from some other network (HUB_STRIKE_LIMIT above).
  if (current && existingProbeFailed && recordHubStrike(current)) {
    clearHubStrikes();
    forgetRememberedSyncHub();
    return { baseUrl: '', source: 'none' };
  }
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

export type FarmGatewayResult = {
  gateway: FarmGateway;
  resolution: SyncHubResolution;
  /** The pairing from the shed Wi‑Fi was reused, so no code is needed. */
  adopted: boolean;
  verdict: GatewayVerdict;
};

/**
 * Operator entered the farm gateway address. One field, once.
 *
 * Order matters and each step is refusable:
 *
 * 1. **Classify.** An address that cannot carry the hub token safely is refused
 *    here, before anything is saved or sent (`farmGateway.ts`).
 * 2. **Probe.** So a typo is an immediate answer rather than a mystery the next
 *    time the tablet leaves the shed.
 * 3. **Handshake**, and reuse the existing pairing if this is the hub already
 *    paired with. That is the step that makes the gateway feel like the same hub
 *    instead of a second one.
 * 4. **Save**, and use it now — the operator just typed it, so the next request
 *    should go there. The ladder decides again on the next resolve, and will
 *    prefer the shed Wi‑Fi when the tablet is on it.
 */
export async function useFarmGateway(input: string): Promise<FarmGatewayResult> {
  const verdict = classifyGatewayAddress(input);
  if (!verdict.ok) throw new Error(verdict.reason);

  if (!(await probeHubBase(verdict.base, GATEWAY_PROBE_TIMEOUT_MS))) {
    throw new Error(
      `Nothing answered at ${verdict.base}. Check PUF-AM is running on that machine with ` +
        'Tablet hub switched on, and that this tablet can reach it — if it is a VPN address, ' +
        'the VPN has to be connected on both ends.',
    );
  }

  clearHubStrikes();
  const info = await fetchHubInfo(verdict.base);
  const adopted = adoptHubCredentialByHubId(verdict.base, info?.hubId);

  const gateway: FarmGateway = {
    base: verdict.base,
    kind: verdict.kind,
    savedAt: new Date().toISOString(),
    ...(info?.hubId ? { hubId: info.hubId } : {}),
    ...(info?.name ? { hubName: info.name } : {}),
  };
  saveFarmGateway(gateway);
  setSelectedSyncPeerBase(verdict.base);

  return {
    gateway,
    adopted,
    verdict,
    resolution: {
      baseUrl: verdict.base,
      source: 'gateway',
      info,
      needsPairing: Boolean(info?.pairingRequired) && !getHubToken(verdict.base),
    },
  };
}

/**
 * After a deliberate pairing at the gateway, the machine there **is** the hub this
 * tablet knows.
 *
 * Without this the identity guard would be a trap rather than a guard: an operator
 * who moved the farm to a new shed PC pairs with it, and the next resolve compares
 * the new hub against the old saved identity, drops the pairing it just made and
 * asks for the code again. Replaced wholesale rather than merged — a hub that
 * publishes no identity leaves none behind, which is the same "unknown is not
 * changed" rule the guard itself uses.
 */
export function rememberGatewayIdentity(info: HubInfo | null): void {
  const gateway = readFarmGateway();
  if (!gateway) return;
  const { hubId: _previous, hubName: _previousName, ...rest } = gateway;
  saveFarmGateway({
    ...rest,
    ...(info?.hubId ? { hubId: info.hubId } : {}),
    ...(info?.name ? { hubName: info.name } : {}),
  });
}

/**
 * Forget the gateway: stop routing there, and stop restoring it at cold start.
 *
 * **The pairing is deliberately kept.** Credentials are per hub base and a tablet
 * that visits two sheds keeps both, which is a rule this must not quietly bend:
 * a gateway address can legitimately *be* a hub the tablet also uses on the Wi‑Fi
 * (an operator may save the LAN address), and unpairing on removal would then cost
 * them the shed pairing as a side effect of tidying up a field. Dropping a pairing
 * has its own action (`unpairHub`), and re-adding a gateway is instant because the
 * token is still there.
 */
export function clearFarmGateway(): void {
  const gateway = readFarmGateway();
  forgetFarmGateway();
  if (gateway && sameHubBase(getApiBaseUrl(), gateway.base)) {
    forgetRememberedSyncHub();
  }
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
  clearHubStrikes();
  setSelectedSyncPeerBase(base);
  return describe(base, 'existing');
}
