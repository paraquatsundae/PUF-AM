/**
 * DPIRD Weather 2.0 paths this app is allowed to fetch with a server-held key.
 *
 * Shared by Cloud Run (`createApiApp`) and the owner-deployed BYO weather
 * function so the two cannot drift into a general-purpose credentialed proxy.
 *
 * - `stations` — directory for blight / chill pickers
 * - `stations/summaries/hourly` — dryer ambient temperature
 *
 * Daily summaries are not proxied here: they land in `weather_cache` via the
 * scheduled refresh / `ensure-cache`.
 */
export const DPIRD_PROXY_PATHS = ['stations', 'stations/summaries/hourly'] as const;

export type DpirdProxyPath = (typeof DPIRD_PROXY_PATHS)[number];

export function isAllowedDpirdProxyPath(path: string): path is DpirdProxyPath {
  return (DPIRD_PROXY_PATHS as readonly string[]).includes(path);
}
