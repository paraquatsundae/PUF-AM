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
