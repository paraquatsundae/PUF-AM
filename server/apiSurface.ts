/**
 * Which API a process is serving.
 *
 * `createApiApp()` was written for `npm run dev`, where one Express on one
 * laptop is the whole world: the cloud API, the LAN shelf, the mDNS hub and the
 * Freenet sidecar. Cloud Run then reused it verbatim, so the public internet got
 * the LAN families too — an unauthenticated 64 MB write shelf, an mDNS browse
 * that answers with `localhost` and `169.254.x.x`, and a hub handshake claiming
 * to be a workshop dev box.
 *
 * A LAN family on Cloud Run is not merely exposed, it is broken: the shelves
 * live in one instance's memory, and the next request may land on a different
 * instance. So this is not a security tax on a working feature — the feature
 * never worked there.
 *
 * `'cloud'` is the default because it is the smaller surface. A new caller that
 * forgets to say gets the safe one, and the failure is a 404 on a LAN route
 * rather than a shelf open to the internet.
 */
export type ApiSurface =
  /** Public internet, Cloud Run. Auth, weather, admin, plugin catalogue. */
  | 'cloud'
  /** A repo checkout or the packaged desktop shell: also the LAN and hub families. */
  | 'hub';

/** True when the LAN, hub-handshake and Freenet families should be registered. */
export function servesLanFamilies(surface: ApiSurface): boolean {
  return surface === 'hub';
}

/**
 * The surface a plain `node server.ts` should serve.
 *
 * Keyed on `NODE_ENV` because that is what the Cloud Run deploy already sets
 * (`scripts/deploy-cloudrun.mjs`), so there is no new variable to forget. The
 * desktop shell does not come through here — it asks for `'hub'` outright,
 * since a packaged build is `production` and would otherwise lose the LAN hub
 * that is its entire purpose.
 */
export function surfaceFromEnv(): ApiSurface {
  return process.env.NODE_ENV === 'production' ? 'cloud' : 'hub';
}
