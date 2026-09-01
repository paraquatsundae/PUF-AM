# Codebase health check log

**Product:** PUF-AM — Ag Manager  
**Rules:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)  
**Purpose:** Captured output of procedure A / D. Newest run first. This is a log, not a rewrite of the limits.

Command (procedure A):

```
npm test && npm run lint && npm run plugins:verify && npm run audit:codebase
```

`npm run lint` is `tsc --noEmit`. Procedure A is green as of the 2026-08-30 thin SoC greps.

There is now a fifth gate for anything touching the client bundle, because some
questions only a built artefact can answer:

```
npm run build && npm run audit:bundle
```

---

## 2026-09-01 — Admin invite PINs bind to their first redeemer

**Host:** Linux (Fedora), repo `Walnut_farm_manager`
**Why:** Follow-on from the pen test work — an admin invite could be used by more than one person.

### What was actually wrong

The `admin` preset in `MODULE_PRESETS` shipped `maxUses: null` with `days: 365`, so an admin code was redeemable without limit for a year. The sharp edge is `uidForPinRedeem(pin, displayName)`: the account id is derived from the PIN **and the name typed beside it**, so a second person entering a leaked admin code under their own name does not collide with the first. They quietly become a second, separate admin with `allFarmModules()`. One overheard admin code was an unbounded supply of admins.

### Why this is not `maxUses: 1`

The obvious fix is wrong. `/api/auth/redeem-pin` is also the **return-login** path — it branches on `existingUser`, calls `auth.updateUser`, carries `priorEpoch` forward and only stamps `createdAt` for genuinely new accounts. `useCount` therefore counts *logins*, not people. Capping the admin preset at one use would let an admin sign in exactly once and then lock them out of their own farm, which is the failure mode the owner recovery PIN is deliberately uncapped to avoid.

So the property enforced is the one that was actually wanted: **nobody else** can use the code. The PIN binds to whoever redeems it first; that person keeps signing in.

### Change

- [`shared/auth/inviteLimits.ts`](../shared/auth/inviteLimits.ts) — new. `inviteBindsToFirstRedeemer(role)` (admin only, so crew PINs stay shareable for a season gang) and `checkInviteClaim(record, uid)` returning `bind` so the caller knows it must persist the binding in the claiming write.
- `AccessPinRecord` / `JoinTicketDoc` gain `claimedBy` and `claimedDisplayName`.
- Cloud `redeem-pin`: `uid` is computed **before** the transaction, and the claim check runs **inside** it, in the same `tx.set` that claims the use. Anything less races exactly the way `useCount` did — two people reading `claimedBy` empty and both committing.
- The existing rollback now also unbinds when that redeem is what bound it. A first attempt that died at `createUser` would otherwise leave the invite claimed by a uid with no account, killing the invite for everyone including its intended holder.
- BYO redeem was still the old shape — `getDoc`, check, then an `updateDoc` far below, i.e. the pre-transaction bug the cloud path already fixed. Now claims in `runTransaction` before any account write, and signs out if the claim loses so no session is stranded without membership.
- [`firestore.rules`](../firestore.rules) — `joinTicketBindingHeld()`. On BYO projects the client is not a boundary, so the rule is what actually stops a rebind: an unclaimed admin ticket must be stamped with `request.auth.uid`, and a claimed one may not change. Redeemer updates may now touch the two new keys and nothing more.
- The exhausted-PIN message distinguishes single-use from a spent multi-use PIN, and a claimed admin invite names its holder — because "already used by Alex" separates a stolen code from Alex typing their own name differently, which is a real way to miss the binding.

### `accessPinMemberRoutes.ts` had to be split

`audit:codebase` failed on the way out: the file was 598 lines, two under the 600-line new-file limit, and the binding took it to 631. The three member-roster routes (`/api/auth/members`, `update-member`, `remove-member`) moved to [`server/farmMemberRoutes.ts`](../server/farmMemberRoutes.ts) and register through the existing `accessPinRoutes.ts` aggregator. The seam is real rather than convenient — those three act on members who already exist, the rest act on codes that create them, and the only shared machinery (claims, epoch bumps) already lived in `accessPinAuth.ts`. Checked by diffing the registered route list against `HEAD`: same seven paths before and after.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 1020 passed, 10 skipped (was 1007) |
| `npm run lint` (`tsc --noEmit` + desktop + eslint) | **Pass** — 0 errors |
| `npm run plugins:verify` | **Pass** — 6 packs |
| `npm run audit:codebase` | **Pass** — after the split above |
| `npm run build` + `npm run audit:bundle` | **Pass** — workshop gate folded false, one Firebase key, no provider called directly |

### Tests are load-bearing

- Made `inviteBindsToFirstRedeemer()` return `false` and stripped `joinTicketBindingHeld` from the rules: **3 of 9** in `tests/inviteBinding.test.ts` and **4 of 4** binding cases in `tests/api/redeemPinReservation.test.ts` fail, then pass on revert.
- Replaced the in-transaction `checkInviteClaim` with a check on the pre-read record — the mutation that models "binding, but not atomic". The two race tests fail; the sequential ones still pass, which is the point of having both.
- The lockout case is a test, not a comment: the admin who claimed the PIN redeems a second time and must get 200. That is the assertion that fails first if anyone later "simplifies" this to `maxUses: 1`.
- `tests/inviteBinding.test.ts` also pins the admin preset at `maxUses: null` with the reason attached, since the naive fix looks like an improvement in review.

---

## 2026-09-01 — Pen test remediation: cloud surface, CORS, imagery proxy

**Host:** Linux (Fedora), repo `Walnut_farm_manager`
**Why:** Soft pen tests of `am.pufworks.farm`. `createApiApp()` was written for `npm run dev`, where one Express is the whole world, and Cloud Run inherited it verbatim — so the public internet got the LAN families, an open write shelf among them. Separately, the map named its imagery provider from the client.

### What was actually wrong

Verified against the live deployment, not only the source:

- `GET /api/hub/info` answered `kind: "workshop-dev"`, `name: "PUF-AM dev (<hostname>)"` on production.
- `Access-Control-Allow-Origin: *` for any unrecognised origin, preflight included. No `Allow-Credentials` and bearer auth, so not session-riding — but an open read of every unauthenticated endpoint, and the wildcard bought nothing, since same-origin never consults CORS.
- `POST /api/sync/mist/:farmId` unauthenticated, 64 MB per arbitrary farm ID, into a module-level `Map` plus a `process.cwd()` file. Both are RAM on Cloud Run. Trivial memory-exhaustion DoS, plus unauthenticated read and enumeration.
- `/api/sync/self` and `/api/sync/peers` leaked `169.254.9.1`, `localhost.local`, port 8080.
- `/api/mist/freenet/*`, a large unauthenticated family, closed only by `MIST_FREENET_DISABLED=1` remembering to be set on the deploy.
- **Not** a finding: `isWorkshopMode()` was already folded to `return!1` in the shipped bundle, so the `ProtectedRoute` bypass was dead code. The `Workshop mode` string in the bundle is banner copy. **Also not a finding:** no Google Maps key ships; the one `AIza…` is the Firebase web key.

A LAN family on Cloud Run is not merely exposed, it is broken — the shelves live in one instance's memory and the next request may land elsewhere. So none of this was a security tax on a working feature.

### Change

- [`server/apiSurface.ts`](../server/apiSurface.ts) — new. `ApiSurface = 'cloud' | 'hub'`. Default is `'cloud'`, the smaller surface, so a caller that forgets fails closed. `server.ts` keys off `NODE_ENV`; both desktop listeners ask for `'hub'` outright, because a packaged build is `production` and would otherwise lose the LAN hub that is its whole purpose.
- Cloud surface drops the mist shelf, mDNS discovery, join tickets, the Freenet family and `HUB_INFO_PATH`. Dropping hub info is what the code already expected — `fetchHubInfo()` documents a 404 as "a Cloud Run deployment".
- **Kept on cloud:** `/api/sync/lan/*`, `/api/presence/*`, `/api/highlights/*`. Each verifies farm membership, so exposure is not the issue. They do share the per-instance storage problem and are worth revisiting, but pulling them is a functional change, not a security fix.
- `apiCorsMiddleware(surface)` — an unknown origin now gets **no** `Access-Control-Allow-Origin` at all, plus `Vary: Origin` when one is emitted. Allowlist from `ALLOWED_ORIGINS`, which replaces the built-in pair rather than adding to it so a deploy can be narrowed too. Loopback and `capacitor://localhost` are reflected on `'hub'` only. OPTIONS still 204s.
- [`server/tileProxyRoutes.ts`](../server/tileProxyRoutes.ts) — new. `GET /api/tiles/:z/:x/:y`, on both surfaces. Landgate SLIP has no tile cache (`singleFusedMapCache: false`, `tileInfo: null`), so this does the XYZ → Web Mercator bbox conversion a tiled service would have done and calls the dynamic `export` endpoint. Bounded LRU (64 MB), single-flight so N clients asking for one tile make one upstream request, upstream concurrency capped at 3 against the client's 6, identifying `User-Agent`, `TILE_UPSTREAM_URL` so a provider swap is a deploy variable.
- Client: `tileUrl()` returns `apiUrl('/api/tiles/z/x/y')`; `ESRI_IMAGERY_URL` and the hardcoded `server.arcgisonline.com` layer are gone; `EsriPreviewTileLayer` → `ImageryPreviewTileLayer`; attribution is Landgate/SLIP.
- **Tiles are rendered by whichever PUF-AM server the client already talks to.** The first cut made `/api/tiles/` cloud-only for desktop and tablet, because Leaflet fetches tiles as `<img src>` and an image element cannot carry the loopback or hub token. That worked, but it made one Cloud Run service the sole consumer of the imagery provider for every install — the wrong shape for an MIT-licensed, self-hostable app, and it puts the whole licence question on one operator. So both local guards now exempt `/api/tiles/` (`LOOPBACK_OPEN_PREFIXES`, `LAN_OPEN_PREFIXES`): the desktop renders its own, and a shed laptop renders for the tablets paired to it. Only browser users at `am.pufworks.farm` still draw through Cloud Run, which is unavoidable — they have no local server.
- Opening those two routes costs little: no farm data is behind them, the upstream host is fixed in code so the proxy cannot be aimed elsewhere, coordinates are validated and upstream concurrency is capped.
- `HubInfo.tiles?: boolean` — a hub has to claim imagery rather than disclaim it. `cloudOnlyPrefixes` describes what a hub *refuses*, and a desktop older than the proxy cannot refuse a route it has never heard of, so a tablet paired to one would ask it for tiles and show a grey map. Absent reads as no, and the tablet falls back to the cloud.
- **Existing packs are left alone.** Tiles are keyed `z/x/y` with no provider in the key, so Esri tiles already on a device keep serving offline; only new fetches change. `BasemapPack.source` records what a pack started as, which is why both `'esri-world-imagery'` and `'landgate-locate'` are live values.
- Google Maps removed entirely — `GoogleMapsLayer`, `googleMapsKey.ts`, `VITE_GOOGLE_MAPS_API_KEY`, the `$mapsKey` block in `scripts/deploy-cloudrun.ps1` and three props threaded through the map chain. With the proxy there is no client map key, which closes "restrict the map keys" structurally rather than by console policy.
- [`scripts/audit-bundle.mjs`](../scripts/audit-bundle.mjs) — new, `npm run audit:bundle`.
- [`Plans/API_KEY_SECURITY.md`](API_KEY_SECURITY.md) — rewritten. Records the Firebase key restriction steps and the open question about production living on the AI Studio project `gen-lang-client-0444791425`.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 1007 passed, 10 skipped (was 941) |
| `npm run lint` (`tsc --noEmit` + desktop + eslint) | **Pass** — 0 errors |
| `npm run build` | **Pass** |
| `npm run audit:bundle` | **Pass** — workshop gate folded false, one Google key, no provider called directly |

Live proxy check against Landgate: `z12/3366/2431` and `z17/107734/77804` both 200 `image/jpeg`, 23 KB and 31 KB, JPEG magic `ffd8`, repeat request `X-Tile-Cache: hit`. The 23–31 KB range confirms `AVG_TILE_BYTES = 25_000` is still a fair pack estimate.

### Tests are load-bearing

Proven by reinstating each old behaviour rather than by assertion count:

- Restored the `*` CORS default and made `servesLanFamilies()` return `true`: **15 of the 34** new assertions in `tests/api/apiCors.test.ts` and `tests/api/cloudSurface.test.ts` fail, then pass again on revert.
- Built with `VITE_WORKSHOP_MODE=true` and ran `audit:bundle` against it: fails with *"the workshop gate folded to `return!0`"*. This is also how the check was derived — grepping for `VITE_WORKSHOP_MODE` or `Workshop mode` matches banner copy in **every** build and is exactly the vacuous check that made the pen test report look alarming. The script instead finds the banner by its copy, reads the name of the function gating it, and asserts that function's minified body.
- `tests/api/tileProxy.test.ts` anchors the bbox maths to a place: the tile XYZ says covers Perth must produce a bbox containing Perth. A flipped Y axis passes the tessellation checks and fails that one. It also caught a real bug — `Number.isInteger` accepts `'0x10'`, `'1e1'` and `''`, so `/api/tiles/5/0x10/0` was an accepted alias for one tile with `Cache-Control: immutable` on it. Now digits only.

### One test had to be loosened, deliberately

`tests/lanHubAuth.test.ts` asserted a device token on **every** prefix in `LAN_SCOPE_PREFIXES`, and imagery is now in scope without one. Rather than delete the assertion it now iterates the scope minus `LAN_OPEN_PREFIXES`, with a check that the subtraction removed exactly as many entries as the open list holds — otherwise adding every prefix to the open list would make the loop iterate nothing and pass while asserting its own opposite. Two tests were added beside it: tiles are allowed unpaired, and every open prefix is still inside the scope (an open prefix that drifts out would 404, and the failure would read as a missing route rather than a policy mistake).

### `testTimeout` raised to 30 s

Three pre-existing API tests began timing out once the new test files ran alongside them. The cause is dull: `isAdminSdkReady()` synchronously loads the whole `firebase-admin` package on the first authenticated route, so every test *file* touching one pays that import, and this checkout lives on a mounted Windows filesystem. Several vitest workers doing it at once exceeds 5 s, and the failure looks like a hung route rather than a slow disk. Raised rather than worked around — the tests are correct, they are just being charged for a heavyweight import. Still bounded, so a real hang still fails.

`tests/api/cloudSurface.test.ts` also stopped paying it where it did not need to: proving the weather family is mounted now uses an *unlisted* DPIRD path, because the allowlist check runs before authentication and `{"error":"Unknown DPIRD path"}` distinguishes a mounted family from the `/api` catch-all more sharply than a status code does.

### Not done, deliberately

**Landgate's public imagery licence is SLIP Transaction Personal Use.** Commercial use needs written agreement from `CustomerExperience@Landgate.wa.gov.au`, and that has not been asked yet.

Two tempting arguments for skipping the question do not hold. **Open-sourcing the code does not distribute the obligation** — that would follow if each user's machine made the requests, but any client drawing tiles from `am.pufworks.farm` makes its operator the single consumer whatever the code's licence says. Pushing tile rendering out to the desktop and LAN hub is what makes the argument true for self-hosters; it cannot help browser users. **And "commercial" almost certainly is not "somebody charged for the app"** — a grower using imagery to plan spraying is using it in a business, with no fork and no money changing hands, which Personal Use likely does not cover even self-hosted.

Worth asking in the same email: offline packs pull up to 20,000 tiles into IndexedDB, and bulk extraction and storage are commonly permissioned separately from viewing.

If the answer is no, `TILE_UPSTREAM_URL` points at a licensed provider and nothing else changes — which is most of why the proxy exists.

**Zoom is not clamped to the pack range.** The plan said 12–17; the accepted range is 0–19. `CachedTileLayer` is mounted with `minZoom: 0`, so panning out asks for low-z tiles on the same URL, and rejecting them would grey out the map the moment a user zooms past their pack. The open-proxy concern the clamp was meant to answer is handled by the upstream host being fixed in the module: a caller picks a tile, never a target.

---

## 2026-08-30 — Chunk resilience, Leaflet entry point, diary CSV

**Host:** Linux (Fedora), repo `Walnut_farm_manager`
**Why:** Three findings from the line-by-line review. A rejected `import()` took down the whole session; three modules reached Leaflet without the setup module that registers its plugins; the diary's "CSV" button handed back a zip.

### Change

- [`src/lib/lazyWithRetry.ts`](../src/lib/lazyWithRetry.ts) — new. Three attempts with backoff, parking on the `online` event rather than spending a retry offline (10 s cap). All 22 `React.lazy` sites in `src/App.tsx` and `src/packs/*/index.ts` now go through it.
- [`src/components/RouteErrorBoundary.tsx`](../src/components/RouteErrorBoundary.tsx) — new, inside the router, `resetKeys={[pathname]}`, Suspense folded in so the pair nests in the only order that works. Handles **only** an unreachable chunk; everything else is rethrown to the app-level boundary, which is where the Firestore cache-clear recovery lives.
- `StableEditControl` / `EventMarkerCluster` / `CachedTileLayer` — import `L` from `src/lib/leaflet-setup` instead of `leaflet` plus a bare plugin import. `leaflet-draw` and `leaflet.markercluster` read a global `L` they never import, so the ordering was left to the bundler once `main.tsx` stopped importing the setup module eagerly.
- [`eslint.config.js`](../eslint.config.js) — `no-restricted-imports` on `leaflet`, `leaflet-draw`, `leaflet.markercluster` under `src/**`, with `allowTypeImports` (the ~12 `import type { Map }` sites are erased before anything runs). Verified by reinstating a raw import and watching it fail.
- [`src/lib/farmExportSheets.ts`](../src/lib/farmExportSheets.ts) — `downloadFarmExportDiaryCsv`. The diary page passes `includeIssues: false`, so the zip held one real file, and a zip does not open in Sheets on the tablet. The full farm export still zips, because it genuinely has several sheets.
- [`vitest.config.ts`](../vitest.config.ts) — include `.tsx` tests; a component whose job is what it renders can only be tested by rendering it.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 941 passed, 10 skipped (was 929). 12.3 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run lint:eslint` | **Pass** — 0 errors |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** |
| `npm run build` | **Pass** — no circular-import warnings; `vendor-leaflet` still out of the eager preload set |

Chained procedure A: **pass**.

### Tests are load-bearing

Reverted each fix in turn (`RETRIES = 0`, `chunkFailed = false`, diary back to the zip) and confirmed 9 of the 12 new assertions fail before passing.

---

## 2026-08-30 — Thin SoC greps

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Lock the in-scope peel. Pages stay compose-only; lib stays off components. Import specifiers only — comments do not count (`autoSync` mentions `components/sync/useAutoSync.ts`).

### Change

- [`scripts/audit-codebase.mjs`](../scripts/audit-codebase.mjs) — `== SoC greps ==`: `src/lib` ↛ `src/components`; `src/pages` ↛ `leaflet` / `react-leaflet` / turf / `firebase/firestore`
- [`tests/codebaseHealth.test.ts`](../tests/codebaseHealth.test.ts) — same walk
- Procedure A stays the four commands. No page peel. Freenet cards still out.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 859 passed, 10 skipped. 17.0 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — SoC greps OK; Freenet WARN only |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |

### Next implementation slice

1. Freenet cards / Desktop / APK when that pass opens. No map redesign.
2. Parked CodeRabbit nits (a11y, CSV quotes) — not this gate. (`x-forwarded-for` taken 2026-08-30.)

---

## 2026-08-29 — CodeRabbit CLI review

**Command:** `coderabbit review --uncommitted --include-untracked --agent`  
**Result:** 47 findings, ~6 min. Not a Procedure A gate.

### Verified take (applied 2026-08-29)

| Sev | File | Issue |
|-----|------|--------|
| critical | `server/accessPinMemberRoutes.ts` | `create-pin` no longer mints for another farm’s `farmId` |
| critical | `src/hooks/useAdminDashboard.ts` | search uses `u.email?.toLowerCase()` |
| major | `src/hooks/useDryerSessionActions.ts` | moisture and temp delete remove one row, not every identical reading |

### Dismiss / later

- Dryer modal “sorted index” — hook already remaps update via `findIndex`; overstated
- `leaflet-draw-window-type` import-time `window.type` — keep at map-lib boundary; do not invent a second init
- Enable-`strict` / `React.memo` / `useOrchardMapPage` — none offered; still dismiss if they appear
- Prototype-pollution `constructor` key, a11y nits, date-overflow, CSV quotes — later, not this health peel
- `x-forwarded-for` rate-limit key — **done 2026-08-30**, the trusted-proxy setup is now stated: `server/clientIp.ts`, hops from `TRUSTED_PROXY_HOPS` / `K_SERVICE`

---

## 2026-08-29 — CodeRabbit (judgment, not a gate)

**Why:** First CodeRabbit pass on the in-scope health peel. Config only — Procedure A stays the four commands.

### Change

- [`.coderabbit.yaml`](../.coderabbit.yaml) — path filters (Freenet / Desktop / APK / lockfile), path instructions for pages / lib / hooks / Auth / farmModules / map / cropPacks. Knowledge base reads `Plans/CODEBASE_HEALTH.md`.
- Procedure A + D in [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md) now say when to run a review and what to dismiss.
- CLI 0.7.5 installed at `~/.local/bin/coderabbit`. **Signed out** — extension login does not feed the CLI. Run `coderabbit auth login`, then `coderabbit review --uncommitted --include-untracked`. Or use the sidebar: **Review uncommitted changes**.

### First triage (uncommitted peel, against locked rules)

Official CodeRabbit comments are not in yet (CLI not signed in). This is the same judgment pass the yaml encodes.

| Finding | Verdict |
|---------|---------|
| Pages have no Firestore / Leaflet / turf | **Pass** |
| `src/lib` ↛ `src/components` | **Pass** |
| AuthContext ↛ hooks; session listen in `authSessionListen.ts` | **Pass** |
| No new OrchardMap / FarmDiary `onSnapshot` | **Pass** (Harvest / Admin / Settings listeners moved, not doubled) |
| Financials stays one-shot `getDocs` | **Pass** |
| `farmDiary.ts` re-exports `useFarmDiary` from hooks | **Dismiss** — keep the public import path |
| `applyMistSession` in `useEffect([])` | **Dismiss** — same stale closure as before the move |
| `(window as any)._lastAuthId` | **Dismiss** — pre-existing race guard |
| Enable `strict` / `React.memo` / `useOrchardMapPage` | **Dismiss** if CodeRabbit offers them |
| `onAddInternalBoundary` `as string` | **Took** — local `blockId` instead |

No SoC/cost regression that needs a code peel. After you sign in, run the official review and drop any comment that matches the dismiss list in `CODEBASE_HEALTH.md`.

---

## 2026-08-29 — In-scope compliance

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Bring every in-scope file to the size / SoC / cost rules in `CODEBASE_HEALTH.md`. Not a grep gate — the app has to comply. Desktop / APK / Freenet out.

### Change

In-scope pages compose only. No Firestore, Leaflet, or turf on a page. Fetch lives in the hook that owns that data. Auth session listen is lib so AuthContext never imports hooks. OrchardMap left `KNOWN_OVERSIZE` (530). Taskdata workshop-path test replaced with an inline fixture.

- FarmDiary JSX → header / blocks / composer / timeline (`src/components/diary/`)
- `farmDiary.ts` barrel — types / store / hook (same import path)
- Settings / Harvest / Financials / Admin / Farm Management — listeners and fetches in one-job hooks
- Login → `useLoginFlow` + join / create forms
- `BlightEngineSettings` + `SliderControl` / glossary
- `api.ts` barrel → `mapApi.ts` / `farmRecordApis.ts` / `firestoreOffline.ts`
- `accessPinRoutes` barrel → farm / member / auth helpers
- OrchardMap canvas / sheet action helpers + diary range + debounced track name. No `useOrchardMapPage`. `orchardMapPaneTypes.ts` not grown.
- AuthContext → `authSessionListen.ts` (same subscribe / teardown)

New extracts under the 400 soft cap. Hard 600 held. Freenet cards stay known-oversize.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 857 passed, 10 skipped. 17.1 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — in-scope `KNOWN_OVERSIZE` empty; Freenet WARN only |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |

### Next implementation slice

1. Optional later: thin audit greps (`lib → components`, page Leaflet / Firestore). Procedure A stays the same four commands.
2. Freenet cards / Desktop / APK when that pass opens. No map redesign.

---

## 2026-08-28 — OrchardMap canvas / sheets

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After viewport / analytics / clicks, the page still owned MapContainer, operate chrome, and metadata sheets. Move-first; no map redesign. Aim under 800.

### Change

**OrchardMap** (`OrchardMap.tsx` 1044 → 795). **Off the ≥800 warn list.** Still in `KNOWN_OVERSIZE` (over 600).

- [`orchardMapPaneTypes.ts`](../src/components/map/orchardMapPaneTypes.ts) — canvas prop types
- [`OrchardMapCanvas`](../src/components/map/OrchardMapCanvas.tsx) — tiles, FeatureGroup, overlays, draw bars
- [`OrchardMapSheets`](../src/components/map/OrchardMapSheets.tsx) — naming, metadata, import, help
- [`leaflet-draw-window-type.ts`](../src/lib/leaflet-draw-window-type.ts) — leaflet-draw `window.type` shim (imported first from `leaflet-setup`)

Toolbar + sidebar stay on the page. All new files under the 400 soft cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 848 passed, 10 skipped. 11.4 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap no longer in the ≥800 table |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. FarmDiary is the remaining in-scope ≥800 page. OrchardMap can keep peeling toward 600 so it can leave `KNOWN_OVERSIZE`. No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-28 — OrchardMap viewport / analytics / clicks

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After the toolbar peel, the page still owned fit/locate, harvest/weather analytics, and map/layer clicks. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 1483 → 1044). **No longer a split ticket** (under 1200). Still known-oversize WARN at 800.

- [`farmMapHit.ts`](../src/lib/farmMapHit.ts) — point-in-paddock + centroid (+ 3 tests)
- [`useOrchardMapViewport`](../src/hooks/useOrchardMapViewport.ts) — fit farm/block, locate, go home, flyTo track, moveend bounds
- [`useOrchardMapAnalytics`](../src/hooks/useOrchardMapAnalytics.ts) — harvest fetch, analytics weather, heat rows
- [`useOrchardMapClicks`](../src/hooks/useOrchardMapClicks.ts) — background/layer click, highlight paint, list scroll

`MapContainer`, overlays, and metadata modals stayed on the page.

All new files under the 400 soft cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 848 passed, 10 skipped (+3 farm-map hit). 10.7 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap WARN at 1044 (over 800; known) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1044 | `src/pages/OrchardMap.tsx` | Over 800; known. Continue move-outs. |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap leftover canvas JSX / page chrome (aim under 800). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap toolbar

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After layer sync, the page still owned the compact toolbar, search, basemap pack state, tile stack, and coverage circles. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 1846 → 1483)

- [`farmMapSearch.ts`](../src/lib/farmMapSearch.ts) — local paddock / track / pin name match (+ 5 tests)
- [`useOrchardMapSearch`](../src/hooks/useOrchardMapSearch.ts) — search state, flyTo, Nominatim fallback
- [`useOrchardMapBasemap`](../src/hooks/useOrchardMapBasemap.ts) — Google/Esri choice, pack load/skip/clear, online listener
- [`OrchardMapToolbar`](../src/components/map/OrchardMapToolbar.tsx) — chrome + edit tabs + sync banner
- [`OrchardMapBasemapLayers`](../src/components/map/OrchardMapBasemapLayers.tsx) — Cached / Google / Esri / CARTO tiles
- [`InfraCoverageLayer`](../src/components/map/InfraCoverageLayer.tsx) — weather / soil / irrigation circles

`MapContainer`, `FeatureGroup`, and `StableEditControl` stayed on the page. Still a split ticket.

All new files under the 400 soft cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 845 passed, 10 skipped (+5 farm-map search). 9.1 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 1483 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1483 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (leftover canvas wiring / page chrome). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap layer sync

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After draw handlers, the page still owned FeatureGroup membership, pin/track/heat paint, Leaflet CSS, and the help overlay. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 2543 → 1846)

- [`mapPinIcons.ts`](../src/lib/mapPinIcons.ts) / [`mapPinTooltip.ts`](../src/lib/mapPinTooltip.ts) — DivIcon + tooltip HTML (+ 2 tooltip tests)
- [`orchardMapLayerSync.ts`](../src/lib/orchardMapLayerSync.ts) — store → FeatureGroup membership
- [`orchardMapLayerPaint.ts`](../src/lib/orchardMapLayerPaint.ts) — pass-through, pin/track styles, blight/yield heat
- [`useOrchardMapLayers`](../src/hooks/useOrchardMapLayers.ts) — those effects
- [`OrchardMapLeafletStyles`](../src/components/map/OrchardMapLeafletStyles.tsx) — draw / location / highlight CSS
- [`OrchardMapHelp`](../src/components/map/OrchardMapHelp.tsx) — Quick Guide overlay

Toolbar, search, basemap, and the MapContainer stayed on the page. Still a split ticket.

All new files under the 400 soft cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 840 passed, 10 skipped (+2 pin tooltip). 11.5 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 1846 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 1846 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (toolbar / canvas wiring). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap draw handlers

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After the edit sidebar, the page still owned Plus / boundary / `draw:created`. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 3155 → 2543)

- [`useOrchardMapDraw`](../src/hooks/useOrchardMapDraw.ts) — Quick Add, internal pad/hazard draw, boundary vertex session, tab-change cancel (408; under 600)
- [`orchardMapDrawCreated.ts`](../src/lib/orchardMapDrawCreated.ts) — `draw:created` / edited / deleted (451; under 600)

Leaflet layer sync, map chrome, and the canvas stayed on the page. Still a split ticket.

No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 838 passed, 10 skipped. 14.9 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 2543 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 2543 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (layer sync / map chrome). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap edit sidebar

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After metadata modals, the page still owned the Edit paddocks sidebar lists. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 3671 → 3155)

- [`editMapTypes.ts`](../src/components/map/editMapTypes.ts) / [`editMapTabs.ts`](../src/components/map/editMapTabs.ts) — `MapMode` / `MapSubTab` + tab list
- [`EditMapSidebar`](../src/components/map/EditMapSidebar.tsx) — backdrop, header, Plus / import / coverage
- [`EditBlocksSidebar`](../src/components/map/EditBlocksSidebar.tsx) — paddock list + Add pad / hazard
- [`EditInfraSidebar`](../src/components/map/EditInfraSidebar.tsx) — draw-type chips + pin list
- [`EditTracksSidebar`](../src/components/map/EditTracksSidebar.tsx) — track list
- [`EditAnalyticsSidebar`](../src/components/map/EditAnalyticsSidebar.tsx) — risk / yield list

Leaflet draw handlers, layer sync, and the map canvas stayed on the page. Still a split ticket.

All new files under the 400 soft cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 838 passed, 10 skipped. 15.9 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 3155 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 3155 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (draw handlers). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap edit modals

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After operate sheets, the page still owned block / pin / track metadata JSX and drawing chrome. Move-first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 4397 → 3671)

- Leaflet delete cleanup in [`src/lib/mapLayerCleanup.ts`](../src/lib/mapLayerCleanup.ts) (`removeMappedLeafletLayer`) + [`src/lib/mapLayerCleanup.test.ts`](../src/lib/mapLayerCleanup.test.ts)
- [`BlockMetadataModal`](../src/components/map/BlockMetadataModal.tsx) — name, crop, internals, delete, Edit boundary, Add pad / hazard
- [`PinMetadataModal`](../src/components/map/PinMetadataModal.tsx) — infra metadata + delete
- [`TrackMetadataModal`](../src/components/map/TrackMetadataModal.tsx) — name / category + delete
- [`EditMapBanners`](../src/components/map/EditMapBanners.tsx) — internal-boundary banner + Coverage Zones legend

`BoundaryImportSheet`, Leaflet draw, and the edit sidebar stayed on the page. Still a split ticket.

All new files under the 600 hard cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 838 passed, 10 skipped (+2 removeMappedLeafletLayer). 15.5 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 3671 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 3671 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (edit sidebar / draw handlers). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — OrchardMap first extract

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Last split ticket. Operate-mode sheets and blight-on-map first; no map redesign.

### Change

**OrchardMap** (`OrchardMap.tsx` 4698 → 4397)

- Blight / yield paddock style in [`src/lib/mapBlockAnalytics.ts`](../src/lib/mapBlockAnalytics.ts) (`blockPolygonPathStyle`) + [`src/lib/mapBlockAnalytics.test.ts`](../src/lib/mapBlockAnalytics.test.ts)
- [`useOrchardMapOperate`](../src/hooks/useOrchardMapOperate.ts) — flags, report draft, `?issue=` deep-link, save / resolve
- [`MapSoftKeys`](../src/components/map/MapSoftKeys.tsx) — home / locate / flags / check-this / add issue
- [`OperateMapOverlays`](../src/components/map/OperateMapOverlays.tsx) — banners, operate card, issues / report / highlight sheets
- [`OperateIssueDetailSheet`](../src/components/map/OperateIssueDetailSheet.tsx) — selected-issue sheet

Leaflet draw, edit sidebar, and metadata modals stayed on the page. Still a split ticket.

All new files under the 600 hard cap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 836 passed, 10 skipped (+3 blockPolygonPathStyle). 16.3 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — OrchardMap still WARN at 4397 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4397 | `src/pages/OrchardMap.tsx` | Split ticket. Continue move-outs. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Keep peeling OrchardMap (edit metadata modals / drawing chrome). No map redesign.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — BlightRisk JSX extract

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After hooks, the page was still 1906 lines of Forecast / Historical / Sandbox JSX. Move-first; same operator UI.

### Change

**BlightRisk** (`BlightRisk.tsx` 1906 → 370)

- PDF in [`src/lib/blightHistoricalPdf.ts`](../src/lib/blightHistoricalPdf.ts)
- Sandbox series filter in [`src/lib/blightSeason.ts`](../src/lib/blightSeason.ts) (`filterSandboxScenarioDays`)
- Panels: `BlightPageHeader`, `BlightStatusStrip`, `BlightForecastTab`, `BlightHistoricalTab`, `BlightSandboxTab` + `BlightSandboxSidebar` / `BlightSandboxChart`, `BlightDevCalibPanel`
- Dropped `BlightRisk.tsx` from `KNOWN_OVERSIZE` (now under the 600 new-file cap)

All new files under the 600 hard cap. No OrchardMap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 833 passed, 10 skipped (+1 filterSandboxScenarioDays). 15.4 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — BlightRisk gone from the ≥800 table |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4698 | `src/pages/OrchardMap.tsx` | Split ticket. **Last.** |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. Do not grow except a move-out. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. OrchardMap last (operate-mode sheets / blight-on-map only; no map redesign).
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — FarmDiary extract

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Phase 3 — diary page still mixed URL/filter, field-issue I/O, composer writes, and timeline JSX. Move-first; same Timeline / Issues UI.

### Change

**FarmDiary** (`FarmDiary.tsx` 1432 → 1149)

- Filter / group / CSV in [`src/lib/farmDiaryView.ts`](../src/lib/farmDiaryView.ts) + [`src/lib/farmDiaryView.test.ts`](../src/lib/farmDiaryView.test.ts)
- [`useFarmDiaryIssues`](../src/hooks/useFarmDiaryIssues.ts) — field issues load, open count, mark / resolve / reopen
- [`useFarmDiaryPage`](../src/hooks/useFarmDiaryPage.ts) — `?block=` / `?view=`, filter, grouping, CSV + farm JSON/XLSX
- [`useFarmDiaryComposer`](../src/hooks/useFarmDiaryComposer.ts) — plan / spray / water form, custom products, plan-from-issue
- Existing [`useFarmDiary`](../src/lib/farmDiary.ts) unchanged (Firestore + outbox)
- Page keeps timeline / composer JSX. Off the split-ticket line (≥1200); still WARN over 800

All new files under the 600 hard cap. No OrchardMap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 832 passed, 10 skipped (+5 farmDiaryView). 15.2 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — FarmDiary WARN at 1149 (over 800, known) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4698 | `src/pages/OrchardMap.tsx` | Split ticket. Last. |
| 1906 | `src/pages/BlightRisk.tsx` | Split ticket. JSX still on the page. |
| 1149 | `src/pages/FarmDiary.tsx` | Over 800; known. Do not grow except a move-out. |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Peel Forecast / Historical / Sandbox JSX off `BlightRisk.tsx` until it drops under 1200.
2. OrchardMap last (operate-mode sheets / blight-on-map only).
3. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — BlightRisk extract

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Phase 3 — god page still mixed weather I/O, model runs, sandbox CRUD, and chart JSX. Move-first; same operator UI (Forecast / Historical / Sandbox).

### Change

**BlightRisk** (`BlightRisk.tsx` 2862 → 1906)

- Season / filter helpers in [`src/lib/blightSeason.ts`](../src/lib/blightSeason.ts) + [`src/lib/blightSeason.test.ts`](../src/lib/blightSeason.test.ts)
- [`useBlightModelParams`](../src/hooks/useBlightModelParams.ts) — Firestore `model_params`, debounce, Ctrl+Shift+D
- [`useBlightWeather`](../src/hooks/useBlightWeather.ts) — DPIRD stations, geolocation, weather fetch
- [`useBlightSandbox`](../src/hooks/useBlightSandbox.ts) — scenarios, clone, auto-distribute
- [`useBlightModelSeries`](../src/hooks/useBlightModelSeries.ts) — Ji / legacy runs, filters, forecast + sandbox series
- Tooltip moved to [`src/components/blight/BlightChartTooltip.tsx`](../src/components/blight/BlightChartTooltip.tsx)
- Page keeps tab layout + charts. Still a split ticket (JSX next, not this slice)

All new files under the 600 hard cap. No OrchardMap. No Freenet cards. No FarmDiary this slice.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 827 passed, 10 skipped (+5 blightSeason). 17.6 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — BlightRisk still WARN at 1906 (split ticket) |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4698 | `src/pages/OrchardMap.tsx` | Split ticket. Last. |
| 1906 | `src/pages/BlightRisk.tsx` | Split ticket. JSX still on the page. |
| 1432 | `src/pages/FarmDiary.tsx` | Split ticket. **Next** (hooks). |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Extract data hooks from `FarmDiary.tsx`. Leave the page as layout.
2. Optional later: peel Forecast / Historical / Sandbox JSX off `BlightRisk.tsx` until it drops under 1200.
3. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — drying/water extract

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Phase 3 item 3 — session list vs prediction vs CRUD was still in two god files. Move-first; same operator UI.

### Change

**Water** (`WaterMonitoring.tsx` 1038 → 113)

- Math in [`src/lib/waterPlanning.ts`](../src/lib/waterPlanning.ts) + [`src/lib/waterPlanning.test.ts`](../src/lib/waterPlanning.test.ts)
- [`useWaterRecentStats`](../src/hooks/useWaterRecentStats.ts) — 7d ETc / 3d rain fetch
- Panels: `WaterBudgetStrip`, `LogIrrigationPanel`, `RecentIrrigationTable`, `WaterSeasonPlanner` (season + district stay on the page so Used/Remaining still follow the planner)

**Drying** (`DryerPerformance.tsx` 1120 → 74)

- [`useDryerSessionActions`](../src/hooks/useDryerSessionActions.ts) — Firestore writes, ambient fetch, PDF
- [`DryerSessionList`](../src/components/drying/DryerSessionList.tsx), [`StartDryingSessionModal`](../src/components/drying/StartDryingSessionModal.tsx), [`DryerSessionDetailModal`](../src/components/drying/DryerSessionDetailModal.tsx)
- Dropped both files from `KNOWN_OVERSIZE` (now under the 600 new-file cap)

No OrchardMap. No Freenet cards.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 822 passed, 10 skipped (+6 waterPlanning). 15.1 s |
| `npm run lint` (`tsc --noEmit`) | **Pass** |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — DryerPerformance / WaterMonitoring gone from the ≥800 table |

Chained procedure A: **pass**.

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4698 | `src/pages/OrchardMap.tsx` | Split ticket. Last. |
| 2862 | `src/pages/BlightRisk.tsx` | Split ticket. **Next.** |
| 1432 | `src/pages/FarmDiary.tsx` | Split ticket. **Next.** |
| 1103 | `src/components/MistWorkshopCard.tsx` | Freenet — out of this pass |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Freenet — out of this pass |
| 995 | `server/accessPinRoutes.ts` | Split when grants are next touched |

### Next implementation slice

1. Extract data hooks from `BlightRisk.tsx` / `FarmDiary.tsx`. Leave pages as layout.
2. Re-run this log and prepend a new dated section.

---

## 2026-08-27 — remaining `tsc` nits

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** After the `api.ts` export, `tsc --noEmit` still had **23** errors. This slice clears them so procedure A can pass.

Root cause for most of them: `tsconfig.json` does **not** set `strictNullChecks`. Discriminated unions (`ok: true | false`) do not narrow on `if (!result.ok)`. Do **not** turn on `strict` in this pass — that would be a different project.

### Change (behavior unchanged)

| Cluster | Fix |
|---------|-----|
| Pack validator `.issues` | `pluginPackageIssues()` in `shared/farm/pluginPackage.ts`; used by blight / chill / first-party loaders + `tests/pluginPackage.test.ts` |
| BYO parse `.error` | `parseByoConfigError()` in `src/lib/byoFirebaseConfig.ts`; paste UI + test. Probe uses `'error' in probe`. |
| Join ticket `.reason` | `'reason' in allowed` in `src/lib/byoFirebaseAuth.ts` |
| Native Freenet `.message` | `nativeHostPutErrorMessage()` in `units/mist-freenet/src/freenet02-native-bincode.ts` |
| Platform admin claims | `resolvePlatformAdminClaim(existing?: object \| null)` so `DecodedIdToken` and farm-role test literals type-check. `ExistingClaims` gained optional `farmId`. |
| Export / map casts | `as unknown as FarmExportDiaryEvent`; map `_map` via `unknown` before leaflet point helpers |
| React `key` | Dropped unused `key` on `<Route>` in `App.tsx` (paths are unique). Dryer remount uses `<React.Fragment key={dryerRev}>` so `key` is not a DryerPerformance prop. |
| Owner console | `'error' in bounce` when Cloud Run remount fails |

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 816 passed, 10 skipped (105 files passed, 2 skipped) |
| `npm run lint` (`tsc --noEmit`) | **Pass** — 0 errors |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — zero cycles |

Chained procedure A: **pass**.

### Next implementation slice

1. ~~Extract `DryerPerformance.tsx` / `WaterMonitoring.tsx`~~ — done; see [drying/water extract](#2026-08-27--dryingwater-extract).
2. Extract data hooks from `BlightRisk.tsx` / `FarmDiary.tsx`. Leave pages as layout.

---

## 2026-08-27 — `api.ts` / `isBenignFirestoreFailure`

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Why:** Phase 1 checkpoint found `src/services/api.ts` still calling `isBenignFirestoreFailure` after the Auth error extract left the helper **private** in `src/lib/firestoreErrors.ts`. That was the only lint cluster caused by the health split.

### Change

- Exported `isBenignFirestoreFailure` from [`src/lib/firestoreErrors.ts`](../src/lib/firestoreErrors.ts). Predicate unchanged (permission / unauthenticated / failed-precondition / offline / INTERNAL ASSERTION).
- [`src/services/api.ts`](../src/services/api.ts) imports it from there. Soft-return vs rethrow-for-outbox behavior is the same.
- Locked: [`tests/firestoreErrors.test.ts`](../tests/firestoreErrors.test.ts) (soft vs hard cases); [`tests/codebaseHealth.test.ts`](../tests/codebaseHealth.test.ts) asserts `api.ts` imports the helper and does not redefine it.
- [`scripts/audit-codebase.mjs`](../scripts/audit-codebase.mjs): allowlisted this log file for the leftover `harvest_drying` string (first `audit:codebase` after the Phase 1 write failed on that).

No Firestore call paths were rewritten.

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 816 passed, 10 skipped (105 files passed, 2 skipped). +3 vs Phase 1 checkpoint. |
| `npm run lint` (`tsc --noEmit`) | **Fail** — `src/services/api.ts` is **gone** from the error list. **23** remaining errors (was ~40+ lines, mostly the repeated `api.ts` missing-name). See remaining table. |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** after allowlisting this file. First run **failed** (`harvest_drying` leftover in this log). |

Chained procedure A: still **fail** (lint). Size / pack / cycle floor green.

### Remaining `tsc` errors (count by file)

| Count | File |
|------:|------|
| 3 | `units/mist-freenet/src/freenet02-native-slot.ts` |
| 3 | `tests/memberClaims.test.ts` |
| 2 | `units/mist-freenet/freenet02-native-slot.test.ts` |
| 2 | `src/components/login/ByoFirebaseConfigPaste.tsx` |
| 1 | `units/mist-freenet/src/freenet02-native-put.ts` |
| 1 | `tests/pluginPackage.test.ts` |
| 1 | `tests/byoFirebaseConfig.test.ts` |
| 1 | `src/pages/Drying.tsx` (`key` prop) |
| 1 | `src/lib/mapDrawHelpers.ts` |
| 1 | `src/lib/farmExport.ts` |
| 1 | `src/lib/byoFirebaseAuth.ts` |
| 1 | `src/App.tsx` (`key` prop) |
| 1 | `shared/farm/walnutBlightPackage.ts` |
| 1 | `shared/farm/firstPartyPack.ts` |
| 1 | `shared/farm/chillPortionsPackage.ts` |
| 1 | `server/adminOpsRoutes.ts` |
| 1 | `secrets/owner-console/server.ts` |

~~Mist / Freenet stay out of this pass.~~ Remaining `tsc` nits (including Freenet unions) cleared — see [tsc nits](#2026-08-27--remaining-tsc-nits) above.

### Next implementation slice

1. ~~Extract `DryerPerformance.tsx` / `WaterMonitoring.tsx`~~ — done; see [drying/water extract](#2026-08-27--dryingwater-extract).
2. Extract data hooks from `BlightRisk.tsx` / `FarmDiary.tsx`. Leave pages as layout.

---

## 2026-08-27 — Phase 1 checkpoint

**Host:** Linux (Fedora), repo `Walnut_farm_manager`  
**Scope:** web + `shared/` + `server/` + crop packs (Desktop / APK / Freenet not in this gate)

### Verdict

| Gate | Result |
|------|--------|
| `npm test` | **Pass** — 813 passed, 10 skipped (104 files passed, 2 skipped). 19.6 s |
| `npm run lint` (`tsc --noEmit`) | **Fail** — pre-existing type errors (see below). Not new this run. |
| `npm run plugins:verify` | **Pass** — 6 first-party crop packs |
| `npm run audit:codebase` | **Pass** — zero cycles; pack folders + layering + `harvest_drying` allowlist OK |

Chained procedure A as written: **fail** (lint). Size / pack / cycle floor is still green.

### `plugins:verify`

```
OK  chill_portions@0.1.0  (crop, crop_pack)
OK  drying@0.1.0  (crop, crop_pack)
OK  harvest@0.1.0  (generic, crop_pack)
OK  nutrition@0.1.0  (generic, crop_pack)
OK  walnut_blight@0.1.0  (crop, crop_pack)
OK  water@0.1.0  (generic, crop_pack)
```

### `audit:codebase` (full)

```
== File size ==
   4698  src/pages/OrchardMap.tsx
   2862  src/pages/BlightRisk.tsx
   1432  src/pages/FarmDiary.tsx
   1120  src/components/DryerPerformance.tsx
   1103  src/components/MistWorkshopCard.tsx
   1038  src/pages/WaterMonitoring.tsx
   1014  src/components/MistFarmSyncCard.tsx
    995  server/accessPinRoutes.ts
WARN  src/pages/OrchardMap.tsx is 4698 lines (split ticket). Do not add logic except a move-out.
WARN  src/pages/BlightRisk.tsx is 2862 lines (split ticket). Do not add logic except a move-out.
WARN  src/pages/FarmDiary.tsx is 1432 lines (split ticket). Do not add logic except a move-out.
WARN  src/components/DryerPerformance.tsx is 1120 lines (over 800; known, do not grow).
WARN  src/components/MistWorkshopCard.tsx is 1103 lines (over 800; known, do not grow).
WARN  src/pages/WaterMonitoring.tsx is 1038 lines (over 800; known, do not grow).
WARN  src/components/MistFarmSyncCard.tsx is 1014 lines (over 800; known, do not grow).
WARN  server/accessPinRoutes.ts is 995 lines (over 800; known, do not grow).

== leftover harvest_drying ==
OK    harvest_drying only in migrate / tests / docs

== Pack folders ==
OK    6 first-party pack folders have UI

== Layering ==
OK    farmModules ↛ cropPacks; AuthContext ↛ hooks

== Import cycles ==
OK    no circular imports in src/ + shared/ + server/

audit:codebase passed.
```

Unchanged vs the 2026-08-26 appendix in [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md).

### Size table (files ≥ 800)

| Lines | File | Limit |
|------:|------|--------|
| 4698 | `src/pages/OrchardMap.tsx` | Split ticket (>1200). Last. |
| 2862 | `src/pages/BlightRisk.tsx` | Split ticket. After drying/water. |
| 1432 | `src/pages/FarmDiary.tsx` | Split ticket. After drying/water. |
| 1120 | `src/components/DryerPerformance.tsx` | Known over 800. **Next extract.** |
| 1103 | `src/components/MistWorkshopCard.tsx` | Known. Desktop/Freenet — out of this pass. |
| 1038 | `src/pages/WaterMonitoring.tsx` | Known over 800. **Next extract.** |
| 1014 | `src/components/MistFarmSyncCard.tsx` | Known. Desktop/Freenet — out of this pass. |
| 995 | `server/accessPinRoutes.ts` | Known. Split when grants are next touched. |

### Procedure D greps

**Stale “Farm setup” for water / dryers / harvest:** operator copy is clean. Remaining hits are either the real Farm setup page (people, farm type, map highlights) or comments that say water/dryers *moved off* Farm setup. One leftover comment in `server/accessPinRoutes.ts` still says “walnut eligibility is Farm setup” — eligibility is farm type + Plugins, not a water/dryer dead end.

**No new `useFooPack` hook.** Still only `useWalnutPack` / `useChillPack` (legacy eligibility). Callers: Dashboard, About, WeatherEvents, OrchardMap, InvitePinManager, MistFarmSyncCard, `useOfferedFarmModules`. Do not add a third.

**No new hard-coded pack route** in `App.tsx` / `navConfig.ts`. Pack pages still come from `allPackRoutes()` / `mergePackNav`.

### `tsc --noEmit` (lint) — grouped, not fixed this run

Same class as 2026-08-26: pre-existing, mixed core vs out-of-scope. Count is by *root cause*, not every repeated line.

| Area | Files | What |
|------|--------|------|
| Core API leftover | `src/services/api.ts` | Calls `isBenignFirestoreFailure` in many catch blocks; the helper is **private** in `src/lib/firestoreErrors.ts` after the Auth error extract. Real missing export / unused calls. |
| Discriminated unions | `shared/farm/*Package.ts`, `src/components/login/ByoFirebaseConfigPaste.tsx`, `src/lib/byoFirebaseAuth.ts`, `secrets/owner-console/server.ts`, several tests | Access `.issues` / `.error` / `.reason` / `.message` on the success arm of a union. |
| React `key` | `src/App.tsx`, `src/pages/Drying.tsx` | `key` passed as a prop; React reserves it. |
| Claims | `server/adminOpsRoutes.ts`, `tests/memberClaims.test.ts` | `ExistingClaims` vs `DecodedIdToken` / extra `farmId`. |
| Casts | `src/lib/farmExport.ts`, `src/lib/mapDrawHelpers.ts` | Unsafe conversions. |
| Out of this pass | `units/mist-freenet/**` | Freenet native put result unions. |

Do **not** treat a green `audit:codebase` as a green `tsc`. Next health slice should export or drop `isBenignFirestoreFailure` in `api.ts` — that is the only lint cluster caused by the earlier health split.

### Not run this checkpoint

- Localhost Install → menu → deactivate click path
- Farmer PIN minted before a pack vs admin nav
- `GET https://am.pufworks.farm/api/health`
- `npm audit` (dependency vulns stay in [`AUDIT_LOG.md`](AUDIT_LOG.md))

### Next implementation slice (after this log)

1. ~~Export or stop calling `isBenignFirestoreFailure` from `api.ts`~~ — done; see [api.ts slice](#2026-08-27--apits--isbenignfirestorefailure) above.
2. Extract `DryerPerformance.tsx` / `WaterMonitoring.tsx` (session list vs prediction vs CRUD). No OrchardMap.
3. Re-run this log and prepend a new dated section.
