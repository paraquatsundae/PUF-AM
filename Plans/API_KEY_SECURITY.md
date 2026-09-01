# API key security (workshop)

**Last updated:** 1 September 2026

## DPIRD (weather) — server only

| Env var | Role |
|---------|------|
| `DPIRD_API_KEY` | **Use this.** Loaded by Express / Cloud Functions only. |
| `VITE_DPIRD_API_KEY` | **Deprecated.** Vite can bake any `VITE_*` into the APK. Remove from `.env`. |

Cloud Functions already use Secret Manager: `firebase functions:secrets:set DPIRD_API_KEY`.

Clients never call DPIRD directly — they hit `/api/weather/*` and Firestore `weather_cache`.

---

## Map imagery — no client key at all

There is no map key any more. `VITE_GOOGLE_MAPS_API_KEY`, `GoogleMapsLayer`,
`resolveGoogleMapsApiKey` and the `$mapsKey` block in `scripts/deploy-cloudrun.ps1`
are gone, and so is the hardcoded `server.arcgisonline.com` layer.

Satellite tiles come from **`GET /api/tiles/:z/:x/:y`** on *whichever PUF-AM
server the client is already talking to* ([`server/tileProxyRoutes.ts`](../server/tileProxyRoutes.ts)),
which renders from Landgate SLIP public imagery. The point is structural rather
than cosmetic:

- Nothing map-related is client-visible, so there is no key to restrict, no
  referrer list to keep in step with every new LAN address, and no console policy
  standing between a leaked key and a bill.
- Changing provider — including to a paid one with a real secret — is
  `TILE_UPSTREAM_URL` on the deploy, with no client release.
- One proxy cache absorbs a 20,000-tile pack download for every device, instead of
  each device hitting the upstream directly.

Tiles already in IndexedDB are keyed `z/x/y` with no provider in the key, so packs
downloaded from Esri keep serving offline. Only new fetches go to Landgate. A pack
records what it started as in `BasemapPack.source`, which is why both
`'esri-world-imagery'` and `'landgate-locate'` are live values.

### Who talks to the provider

This matters more than it looks, because PUF-AM is MIT-licensed and meant to be
self-hosted. Each deployment is its own consumer of the imagery provider, under
whatever terms that operator has agreed:

| Client | Renders tiles | So the provider sees |
|--------|---------------|----------------------|
| Web browser on `am.pufworks.farm` | Cloud Run | the operator of that host |
| Desktop shell | its own bundled Express | that laptop |
| Tablet paired to a LAN hub | the shed laptop | that laptop |
| Tablet with no hub yet | Cloud Run | the operator of that host |

Making that true needed both local guards to exempt `/api/tiles/`
([`desktop/loopbackAuth.ts`](../desktop/loopbackAuth.ts),
[`desktop/lanHubAuth.ts`](../desktop/lanHubAuth.ts)). Leaflet fetches tiles as
`<img src>` and an image element cannot carry a header, so a guarded tile route
is a route the map cannot use. Nothing is given away: no farm data sits behind
it, the upstream host is fixed in code so it cannot be aimed elsewhere,
coordinates are validated, and upstream concurrency is capped.

A hub states `tiles: true` in `/api/hub/info`. Absence means no — a desktop older
than the proxy cannot list a route it has never heard of in `cloudOnlyPrefixes`,
so a tablet paired to one falls back to the cloud instead of collecting 404s.

### Outstanding: Landgate licence

SLIP public imagery is published under **Transaction Personal Use**. Commercial
use needs Landgate's written agreement — ask
`CustomerExperience@Landgate.wa.gov.au` **before** this ships to a paying farm.

Two things that reasoning has to get right, because both are easy to get wrong:

- **Open-sourcing the code does not distribute the licence obligation.** It would
  if each user's own machine made the requests. Where a client draws tiles from
  `am.pufworks.farm`, the provider sees one consumer — whoever runs that host —
  regardless of what the code's licence says. That is exactly why tile rendering
  was pushed out to the desktop and LAN hub above; it shrinks the hosted case to
  browser users, who have no local server and cannot be moved.
- **"Commercial" is unlikely to mean "somebody charged for the app."** A grower
  using imagery to plan spraying and keep paddock records is using it in a
  business, no fork and no money changing hands required. Personal Use probably
  does not cover that even for a self-hoster.

If the answer is no, point `TILE_UPSTREAM_URL` at a licensed provider; that is
the whole change. Also worth knowing: offline packs pull up to 20,000 tiles into
IndexedDB, and bulk extraction and storage are commonly permissioned separately
from viewing, so that is worth asking about in the same email.

---

## Firebase web key — public by design, still worth restricting

The `AIza…` in the bundle is the Firebase web API key. It is meant to be public:
it identifies the project, it does not authorise anything, and Firestore rules
plus App Check are what actually stop a request. Restricting it is defence in
depth, not a fix for an exposure.

1. [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) →
   the browser key for the web app.
2. **API restrictions** → Restrict key → Identity Toolkit API, Token Service API,
   Cloud Firestore API, Firebase Installations API. Nothing else the app does not
   call. Do **not** leave "Don't restrict key".
3. **Application restrictions** → HTTP referrers:

| Referrer | Why |
|----------|-----|
| `https://am.pufworks.farm/*` | Production (canonical) |
| `https://pufom-quby5ye5pa-ts.a.run.app/*` | Cloud Run fallback, until cutover is proven |
| `http://localhost:3000/*`, `http://127.0.0.1:3000/*` | Workshop dev |
| `https://localhost/*`, `capacitor://localhost/*` | Packaged Capacitor WebView |

4. Firebase Console → Authentication → Settings → **Authorized domains**: only
   `am.pufworks.farm`, the Cloud Run host, and `localhost`.

### Open question: the AI Studio project

Production currently signs in against project **`gen-lang-client-0444791425`**,
with an `ai-studio-…` auth domain. That is a scratch project Firebase created for
an AI Studio experiment, and it is now holding real farm data and real accounts.

Nothing is broken today, but it is the wrong home: the project name is
meaningless to anyone who inherits it, its quotas and billing were never chosen,
and a project created by a tool is a project a tool may reorganise. Moving means
migrating Firestore, Auth users and custom claims, so it is a deliberate piece of
work rather than a setting — but it should be decided rather than defaulted into.

---

## Checklist

- [ ] `.env` has `DPIRD_API_KEY=` and **no** `VITE_DPIRD_API_KEY=`
- [ ] No `VITE_GOOGLE_MAPS_API_KEY` anywhere in `.env`, CI, or the deploy script
- [ ] Landgate commercial-use question asked and answered
- [ ] Firebase web key API-restricted and referrer-restricted
- [ ] Auth authorized domains trimmed to the list above
- [ ] Satellite tiles still load on desktop, web and tablet
- [ ] A decision recorded on the `gen-lang-client-0444791425` project
