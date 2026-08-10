/**
 * The **farm gateway** — one remembered address for the farm's hub, so a tablet
 * is not limited to the Wi‑Fi the hub happens to be on.
 *
 * The product goal this serves is *no Freenet client app on the tablet at all*
 * (`Plans/APK_FREENET_PLUGIN.md` §8d). A tablet cannot host a Freenet node, so
 * something else has to speak Freenet on its behalf, and that something is
 * already built: the desktop LAN hub relays `/api/mist/freenet/*` off a real
 * node and has `fdev` for publishing. Its one gap was reach — the hub was
 * findable on the shed Wi‑Fi and nowhere else, so a tablet in a paddock, in the
 * ute or at the worker's house had no gateway at all and the operator was told
 * to sideload a node app.
 *
 * A gateway is therefore **the same paired hub at a second address**, not a new
 * service and not a new credential. `x-puf-hub-token` is unchanged, the routes
 * are unchanged, and the hub does not know or care which of its addresses a
 * request arrived on.
 *
 * ## What this module refuses, and why it refuses in code
 *
 * The hub speaks **plain HTTP**. On the shed LAN that is a stated, accepted risk
 * (`APK_FREENET_PLUGIN.md` §10 — "treat the farm LAN as the trust boundary").
 * Across the internet it is not: `x-puf-hub-token` is a bearer credential, and a
 * bearer credential in cleartext over paths we do not control is handed to
 * whoever is carrying the packets.
 *
 * Rather than warn and continue — which is how "we documented it" becomes "we
 * shipped it" — `classifyGatewayAddress()` **refuses** the addresses that cannot
 * carry the token safely:
 *
 * | Address | Verdict | Why |
 * |---|---|---|
 * | `https://gateway.example` | **accepted** | TLS carries the token |
 * | `http://100.101.102.103:3000` | **accepted** | CGNAT — a Tailscale/WireGuard peer, so the wire is already encrypted |
 * | `http://laptop.tailnet-1234.ts.net:3000` | **accepted** | MagicDNS name; same tailnet, same encryption |
 * | `http://192.168.1.20:3000` | accepted, with a caveat | A Wi‑Fi address. Fine, and it only answers on that network |
 * | `http://farm.duckdns.org:3000` | **refused** | The token would cross the open internet in the clear |
 * | `http://203.0.113.9:3000` | **refused** | Same, without the DNS |
 * | `http://127.0.0.1:3000` | refused | That is this device, not a gateway |
 *
 * The refusal names both ways out (a VPN address, or TLS), because an operator
 * who is told "no" without them will port-forward plain HTTP and think it is
 * what we meant. Phase 2 is the TLS story that turns the last two rows into
 * accepted ones — `APK_FREENET_PLUGIN.md` §8d.
 *
 * @see Plans/APK_FREENET_PLUGIN.md §8d
 * @see Plans/SETTINGS_SYNC_AND_CREW.md §10
 */

import { normalizeHubBase } from './apiBase.ts';

export type GatewayAddressKind =
  /** Not an address at all. */
  | 'invalid'
  /** This device. A gateway has to be somewhere else. */
  | 'loopback'
  /** RFC1918 — the shed Wi‑Fi address. Works there, and only there. */
  | 'lan'
  /** CGNAT / unique-local / a tailnet name: private overlay, already encrypted. */
  | 'vpn'
  /** `https://` — TLS carries the token wherever the host is. */
  | 'tls'
  /** `http://` to a public host. Refused: the token would be in the clear. */
  | 'public-cleartext';

export type GatewayVerdict = {
  /** Normalised base (`http://host:port`), or '' when the input was not an address. */
  base: string;
  kind: GatewayAddressKind;
  /** May this be saved as the farm gateway? */
  ok: boolean;
  /** One line for the operator: what this address is, or why it was refused. */
  reason: string;
};

/** Tailscale MagicDNS and the conventional private-DNS suffix. */
const VPN_HOST_SUFFIXES = ['.ts.net', '.internal'];

/** 100.64.0.0/10 — where a Tailscale/WireGuard peer appears. */
function isCgnatIpv4(host: string): boolean {
  const match = /^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 64 && second <= 127;
}

function isRfc1918(host: string): boolean {
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
}

export const GATEWAY_CLEARTEXT_REFUSAL =
  'That address would send this tablet’s hub token across the internet unencrypted, so PUF-AM ' +
  'will not use it. Two addresses do work from anywhere: the laptop’s VPN address (Tailscale ' +
  'gives it a 100.x.y.z address, or a name ending .ts.net), or an https:// name if you have put ' +
  'a certificate in front of the hub.';

/**
 * What kind of address this is, and whether it may become the farm gateway.
 *
 * Pure, and the only place the cleartext rule lives — the Settings card, the
 * ladder and the plan all read their words from here rather than restating it.
 */
export function classifyGatewayAddress(input: string): GatewayVerdict {
  const base = normalizeHubBase(input);
  if (!base) {
    return {
      base: '',
      kind: 'invalid',
      ok: false,
      reason:
        'That does not look like an address. A gateway looks like 100.101.102.103:3000 or ' +
        'https://gateway.yourfarm.example.',
    };
  }

  const url = new URL(base);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return {
      base,
      kind: 'loopback',
      ok: false,
      reason:
        'That address means “this device”. A farm gateway is the laptop or shed PC that holds the ' +
        'farm — use the address that machine shows under Settings → Tablet hub.',
    };
  }

  if (url.protocol === 'https:') {
    return {
      base,
      kind: 'tls',
      ok: true,
      reason: 'Encrypted (https) — this works from anywhere the name resolves.',
    };
  }

  if (isCgnatIpv4(host) || VPN_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return {
      base,
      kind: 'vpn',
      ok: true,
      reason:
        'A VPN address — the tunnel encrypts it, so this works from anywhere both devices are on ' +
        'the VPN.',
    };
  }

  // fc00::/7 unique-local, including Tailscale's fd7a:115c:a1e0::/48.
  if (host.includes(':') && /^f[cd]/.test(host)) {
    return {
      base,
      kind: 'vpn',
      ok: true,
      reason: 'A VPN address — the tunnel encrypts it.',
    };
  }

  if (isRfc1918(host) || host.endsWith('.local')) {
    return {
      base,
      kind: 'lan',
      ok: true,
      reason:
        'A Wi‑Fi address. Saved, and it answers whenever this tablet is on that network — for ' +
        '“works from anywhere”, use the laptop’s VPN address instead.',
    };
  }

  // Everything left is `http://` to a host this device cannot show is private:
  // a public IP, a DDNS name, or a name whose resolution we cannot see. All of
  // them would put the token on the wire in the clear.
  return { base, kind: 'public-cleartext', ok: false, reason: GATEWAY_CLEARTEXT_REFUSAL };
}

/** Short words for a status chip. */
export function gatewayKindLabel(kind: GatewayAddressKind): string {
  switch (kind) {
    case 'tls':
      return 'Encrypted';
    case 'vpn':
      return 'VPN';
    case 'lan':
      return 'Wi‑Fi only';
    default:
      return 'Not usable';
  }
}

/** True when this gateway is expected to answer away from the farm Wi‑Fi. */
export function gatewayReachesAnywhere(kind: GatewayAddressKind): boolean {
  return kind === 'tls' || kind === 'vpn';
}

/**
 * Is the machine answering at the gateway address a different hub than the one
 * this tablet paired with?
 *
 * "Unknown" is not "changed": a hub too old to publish a `hubId`, or a saved
 * gateway from before this field existed, must keep working. What this catches is
 * the case where both are known and they disagree — a reassigned address, a port
 * forward moved, a second PUF-AM install — and the token must stop being sent.
 */
export function gatewayIdentityChanged(saved?: string, seen?: string): boolean {
  if (!saved || !seen) return false;
  return saved !== seen;
}

// ---------------------------------------------------------------------------
// What this device remembers
// ---------------------------------------------------------------------------

export type FarmGateway = {
  /** Normalised base, e.g. `http://100.101.102.103:3000`. */
  base: string;
  kind: GatewayAddressKind;
  savedAt: string;
  /**
   * The hub this address served when it was saved (`HubInfo.hubId`).
   *
   * Kept so a later handshake can notice that the machine on the other end is no
   * longer the hub this tablet paired with, which is when the token must stop
   * being sent. Absent for a hub too old to publish one.
   */
  hubId?: string;
  /** `PUF-AM (cdgeo)` — so the card can name the laptop rather than an IP. */
  hubName?: string;
};

const GATEWAY_KEY = 'pufam.farmGateway.v1';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The saved gateway, or null.
 *
 * Re-validated on the way out, not merely on the way in — the same lesson as
 * `pufom_last_sync_hub` (`APK_FREENET_PLUGIN.md` §7a): this value outlives the
 * build that wrote it, so a rule tightened later has to apply to what is already
 * on the device rather than only to the next thing typed.
 */
export function readFarmGateway(): FarmGateway | null {
  const raw = storage()?.getItem(GATEWAY_KEY);
  if (!raw) return null;
  let parsed: Partial<FarmGateway> | null;
  try {
    parsed = JSON.parse(raw) as Partial<FarmGateway>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.base !== 'string') return null;
  const verdict = classifyGatewayAddress(parsed.base);
  if (!verdict.ok) return null;
  return {
    base: verdict.base,
    kind: verdict.kind,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
    ...(typeof parsed.hubId === 'string' && parsed.hubId ? { hubId: parsed.hubId } : {}),
    ...(typeof parsed.hubName === 'string' && parsed.hubName ? { hubName: parsed.hubName } : {}),
  };
}

export function saveFarmGateway(gateway: FarmGateway): void {
  storage()?.setItem(GATEWAY_KEY, JSON.stringify(gateway));
}

export function forgetFarmGateway(): void {
  storage()?.removeItem(GATEWAY_KEY);
}

/** Two spellings of one hub base. `192.168.1.20:3000` and the full URL agree. */
export function sameHubBase(a: string, b: string): boolean {
  const left = normalizeHubBase(a);
  const right = normalizeHubBase(b);
  return Boolean(left) && left.toLowerCase() === right.toLowerCase();
}
