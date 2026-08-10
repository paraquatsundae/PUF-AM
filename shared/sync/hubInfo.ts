/**
 * `GET /api/hub/info` — what a tablet needs to know before it trusts a hub.
 *
 * A tablet can reach two shapes of hub and they are not interchangeable:
 *
 * - a workshop `npm run dev`, which serves *every* route including `/api/auth/*`
 *   and `/api/weather/*` because the repo has the secrets for them, and needs no
 *   credential;
 * - a packaged **PUF-AM desktop** LAN hub, which requires a paired device token
 *   and cannot serve the cloud-only families at all.
 *
 * The tablet used to assume the first, so pointing it at a packaged hub produced
 * 401s on sync and silent failures on sign-in. Rather than sniffing, the hub
 * states it: whether pairing is required, and which path prefixes the tablet
 * should send to the cloud instead of here.
 *
 * Unauthenticated on purpose — it is the discovery handshake, and everything in
 * it is already visible to anyone who can reach the port.
 *
 * @see Plans/DESKTOP_FREENET_PLUGIN.md §6.4
 * @see Plans/APK_FREENET_PLUGIN.md §8a
 */

export const HUB_INFO_PATH = '/api/hub/info';
export const HUB_PAIR_PATH = '/api/hub/pair';

export type HubKind =
  /** Repo checkout running `npm run dev` — serves everything, no pairing. */
  | 'workshop-dev'
  /** Packaged PUF-AM desktop LAN listener — pairing required, scoped routes. */
  | 'desktop-lan';

export type HubInfo = {
  product: 'PUF-AM';
  kind: HubKind;
  /** Operator-facing hub name, e.g. `PUF-AM (cdgeo)`. */
  name: string;
  /**
   * Stable per install, so the same hub is recognisable at a second address.
   *
   * A tablet pairs with `http://192.168.1.20:3000` in the shed and later reaches
   * the same laptop at `http://100.101.102.103:3000` over the farm's VPN. Those
   * are two hub bases, and credentials are stored per base, so without an
   * identity the operator would have to pair twice with a laptop they have
   * already paired with.
   *
   * **Not an authenticator.** It is served unauthenticated beside everything else
   * in this handshake, so anything that can reach the port can read it and
   * anything that can answer on a port can claim it. Its only job is to stop this
   * device handing a token minted for *one* hub to a *different* PUF-AM by
   * mistake; the trust decision is still the operator typing an address they own.
   * See `src/lib/farmGateway.ts`.
   *
   * Optional: a `npm run dev` hub has none, and a desktop older than this field
   * answers without it. Both still work — they simply cannot be recognised at a
   * second address without pairing again.
   */
  hubId?: string;
  /** True when `/api/*` needs a device token from `POST /api/hub/pair`. */
  pairingRequired: boolean;
  /** True when the caller's token was recognised. `false` + `pairingRequired` = pair first. */
  paired: boolean;
  /** Path prefixes this hub will not serve; the tablet sends them to `cloudApiBase`. */
  cloudOnlyPrefixes: string[];
  /** Where to send those, when the hub knows. Empty = the tablet's own default. */
  cloudApiBase: string;
  /** Path prefixes reachable over the LAN. Empty = no restriction (dev server). */
  lanScopePrefixes: string[];
  /** Whether a Freenet node is usable through this hub, for the honest gate. */
  freenet: boolean;
};

export function isHubInfo(value: unknown): value is HubInfo {
  if (!value || typeof value !== 'object') return false;
  const info = value as Partial<HubInfo>;
  return info.product === 'PUF-AM' && typeof info.pairingRequired === 'boolean';
}

/** True when `path` is one this hub told us to send to the cloud instead. */
export function hubDefersToCloud(info: HubInfo | null, path: string): boolean {
  if (!info) return false;
  return info.cloudOnlyPrefixes.some((prefix) => path.startsWith(prefix));
}
