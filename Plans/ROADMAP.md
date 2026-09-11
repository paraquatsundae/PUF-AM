# PUFAM (Ag Manager) — Production Roadmap

**Created:** 13 July 2026  
**Last updated:** 10 September 2026 (custom domain live on `pufworks-am`; `Plans/` consolidated — see [`README.md`](README.md); Steps 1–13 detail moved to [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md))  
**Status:** Active — Phases A–C code complete; Phase D polish mostly done (D-07 mesh P3 open); Phase E crop-pack + blight + desktop Freenet in code, zip-as-engine still next  
**Public name:** PUFAM — Ag Manager (local clone folder `PUF-AM`)  
**Companion doc:** [DEVELOPER_NOTES.md](../DEVELOPER_NOTES.md) §5 (13-step checklist)  
**Rename:** [RENAME_TO_PUFAM.md](archive/RENAME_TO_PUFAM.md) · **Farm types:** [FARM_TYPES.md](./FARM_TYPES.md)

---

## Purpose

This roadmap turns the post-assessment recommendations (13 July 2026) into an ordered, trackable plan. The original thirteen steps were grouped into three phases; all thirteen were code-complete on 2026-07-13 and are summarised below. Phases D and E were added afterwards and are the live trackers.

| Phase | Steps | Goal | State |
|-------|-------|------|-------|
| **A — Workshop readiness** | 1–4 | Safe local dev, version control, correct project identity | done 2026-07-13 |
| **B — Beta readiness** | 5–8 | Tests, bundle size, feature hygiene, dependency security | done 2026-07-13 |
| **C — Production / scale** | 9–13 | Backend offload, pagination, map performance, proper admin auth | code done 2026-07-13; deploy leftovers below |
| **D — Product polish** | D-01…D-08 | Docs, crop-pack gating, map UX, offline, presence, overlays | mostly done; D-06 deferred, D-07 in progress |
| **E — Crop packs, blight engine, desktop** | E-01…E-08 | Plugin contract, blight params, desktop Freenet, APK Freenet host | E-07, E-08 in progress |

**How to use this doc**

1. Work Phase D / E items in id order unless a note says otherwise.
2. When starting an item, set its status to `in_progress` and add a line to the **Progress log** at the bottom.
3. When done, set status to `done`, record the completion date, and note any deviations.
4. Mirror status changes in `DEVELOPER_NOTES.md` §5 checklist.
5. Never delete an id (`STEP-xx`, `D-xx`, `E-xx`). Closed items get a date, not a deletion.

**Status legend:** `not_started` · `in_progress` · `blocked` · `done` · `deferred`

---

## Phases A–C — completed steps (summary, 2026-07-13)

Condensed 2026-09-10. Problem statements, task checklists, acceptance criteria, file lists, the dependency graph and the bundle-size tables are verbatim in [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md). Anything still unticked in those steps is repeated **verbatim** in the next section so nothing hides in the archive.

| ID | Step | Pri | Done | Decisions / outcome |
|----|------|-----|------|---------------------|
| `STEP-01` | Initialize git and protect secrets | P0 | 2026-07-13 | `firebase-applet-config.json` + blueprint gitignored; `firebase-applet-config.example.json` added; clone flow in README |
| `STEP-02` | Create local `.env` from template | P0 | 2026-07-13 | `dotenv.config()` verified for server vars, Vite exposes `VITE_*`; startup warning when keys are missing. `DPIRD_API_KEY` is server-only (`server/envSecrets.ts`; never `VITE_`); there is no `VITE_GOOGLE_MAPS_API_KEY` — tiles are `/api/tiles` |
| `STEP-03` | Smoke-test dev server against Firebase | P0 | 2026-07-13 | Automated smoke tests PASS; browser/auth CRUD checks pending real API keys. Log: [`archive/SMOKE_TEST_LOG.md`](archive/SMOKE_TEST_LOG.md) |
| `STEP-04` | Rename package identity | P1 | 2026-07-13 | `react-example` → `walnut-farm-manager` 0.1.0; `metadata.json` name "PUFAM"; lockfile updated |
| `STEP-05` | Add smoke tests (blight, dryer, API proxy) | P1 | 2026-07-13 | `vitest.config.ts`; blight + drying model golden fixtures; `GET /api/health`; no live Firebase / DPIRD in tests |
| `STEP-06` | Code-split heavy routes | P1 | 2026-07-13 | `React.lazy` routes + `manualChunks` (`vendor-react` / `-firebase` / `-leaflet` / `-charts`). Initial JS chunk 4,110 KB → **290 KB** min (1,084 → 89 KB gzip), −93%. Target was < 1,500 KB. FieldOps route later removed (2026-08-13) |
| `STEP-07` | Wire or remove Billing page | P2 | 2026-07-13 | **Decision: Option B — Remove.** Billing page, `/billing` route, nav item and Settings link deleted; `subscriptionTier` kept in the auth model; monetization stays out of scope until explicitly reopened (Option C = Stripe, see Out of scope) |
| `STEP-08` | npm audit and critical vulnerability remediation | P1 | 2026-07-13 | 34 → 2 vulnerabilities (0 critical, 1 high, 1 low). `xlsx` documented as accepted risk (client-side nutrition parsing only); unused `firebase-admin` removed. Log: [`logs/AUDIT_LOG.md`](logs/AUDIT_LOG.md) |
| `STEP-09` | Cloud Scheduler for DPIRD weather | P1 | 2026-07-13 (code) | `functions/src/weatherScheduler.ts` hourly → `weather_cache/{stationCode}`; client reads cache only in production; Express proxy is dev fallback; staleness indicator on Dashboard + Blight Risk. **Deploy still pending** (below) |
| `STEP-10` | Pagination for events, harvests, transactions | P1 | 2026-07-13 | 90-day default diary window + "Load older"; bbox args on `getBlocks` / `getTracks`; composite indexes for `date`; Harvest + Financials already cursor-paginated (limit 20) |
| `STEP-11` | Map clustering and bounding-box queries | P1 | 2026-07-13 | `leaflet.markercluster` via `EventMarkerCluster.tsx`; 500-feature warn-only guard (`mapFeatureLoad.ts`). **Viewport culling was never wired** and Layer Settings never built — design in [`archive/MAP_VIEWPORT_CULLING.md`](archive/MAP_VIEWPORT_CULLING.md); `CODEBASE_HEALTH.md` forbids rebuilding GeoJSON on pan/zoom. Live Telemetry Mock deleted (`8003949`) |
| `STEP-12` | Cloud Functions for blight and financial aggregates | P2 | 2026-07-13 (code) | Blight aggregate nightly + `onDiaryEventWrite` → `farms/{farmId}/aggregates/blight_daily`; `syncFinancialAggregates` on transaction write; Dashboard / BlightRisk / Financials read aggregates first with client fallback in dev |
| `STEP-13` | Replace hardcoded admin email with Firebase custom claims | P2 | 2026-07-13 | `admin: true` claim via `scripts/setAdminClaim.ts`; `firestore.rules` `isAdmin()` = token claim OR `role == 'admin'`; no hardcoded email in app code |

### Open leftovers from Steps 1–13

Verbatim from the step checklists (2026-09-10). Tick here and in `DEVELOPER_NOTES.md` §5 when done; do not delete.

**STEP-01**

- [ ] Create initial commit (only when user explicitly requests)

**STEP-02**

- [ ] Populate:
  - `DPIRD_API_KEY` — weather proxy server-only (`server/envSecrets.ts`; never `VITE_`)
  - `APP_URL` — `http://localhost:3000` for local dev
  - There is no `VITE_GOOGLE_MAPS_API_KEY` — tiles are `/api/tiles`

**STEP-03** (browser checks pending real API keys in `.env`)

- [ ] **Auth:** Google sign-in completes; user doc created in Firestore
- [ ] **Dashboard:** Weather data loads (DPIRD proxy or cache)
- [ ] **Orchard Map:** Blocks render; draw/edit saves to `farms/{farmId}/blocks`
- [ ] **Blight Risk:** Risk chart renders with weather + diary data
- [ ] **Farm Diary:** Create spray event; appears in list and affects blight
- [ ] **Harvest:** Create record; drying session link works
- [ ] **Offline:** `OfflineIndicator` shows when network disabled; cached reads work

**STEP-09** (hosted Cloud Functions are not yet deployed on `pufworks-am` — [`DEPLOY_CLOUD_RUN.md`](DEPLOY_CLOUD_RUN.md))

- [ ] Configure Cloud Scheduler → Pub/Sub → Function (deploy: `cd functions && npm run deploy`)
- [ ] Deploy and verify single hourly fetch in Firebase logs

**STEP-10**

- [ ] For analytics spanning full history: read from `aggregates/` (partial — Dashboard/BlightRisk use blight aggregate)
- [ ] Track read count reduction in dev tools or metrics

**STEP-11**

- [ ] **Blocks/tracks:** bounds filtering exists but is unused. `mapApi.getBlocks/getPins/getTracks` take an optional bounds arg that `farmGeometrySync.ts:104` never passes, it is a hand-rolled point-walk rather than Turf, and `filterByBounds` (`mapStore.ts:111`) deliberately no-ops for polygons. Only pins are filtered, only at load.
- [ ] Debounce before refetch. `useOrchardMapViewport.ts:126` debounces `moveend`/`zoomend` at 500 ms (not 300 ms in `mapStore.ts`), but `setBounds` only stores the box — no refetch, and `orchardMapLayerSync.ts` never reads it. **Nothing is viewport-culled** — design in [`archive/MAP_VIEWPORT_CULLING.md`](archive/MAP_VIEWPORT_CULLING.md); measure with the guard before building.
- [ ] Add "Layer Settings" when real layers ship — never built, so there is no stub to hide

**STEP-12**

- [ ] Add function unit tests with fixtures

**STEP-13**

- [ ] Run `setAdminClaim.ts` for all designated admin UIDs in production

---

## Phase D — Product polish (post Phase C)

Not part of the original 13 steps. Track here so deploy ops and mixed-farm UX stay visible.

| ID | Item | Status | Notes |
|----|------|--------|-------|
| D-01 | Docs + About PUFAM wording; walnut pack gating copy | `done` | 2026-07-27 — About, README, Plans headers, PIN preset clamp |
| D-02 | Module / PIN toggles respect crop packs | `done` | Blight hidden without walnut pack; orphan catalog cleared on Save |
| D-03 | Map UX (draw hit-targets, mixed naming) | `done` | 2026-07-27 — draw bar hit pad, pan-without-point, Area/Block/Paddock naming |
| D-04 | Offline Phase 3 leftovers (NSD, photo queue, weather) | `done` | 2026-07-27 — photo outbox, weather IDB, Android NSD ([`archive/OFFLINE_MAP_APK.md`](archive/OFFLINE_MAP_APK.md)) |
| D-05 | Map infrastructure types (dams / pipes / vehicles…) | `done` | 2026-07-28 — infra catalog + OrchardMap draw/edit/sidebar; season/station/aqua deep UIs remain later (FARM_TYPES.md) |
| D-05b | Dam texture + paddock area exclusions + internal zones | `done` | 2026-07-28 — water/hatch/gravel fills; areaHa net of dam/impassable; passable pads; see FARM_TYPES.md |
| D-06 | Cloud Run / mDNS / `.pufom` rename Phase B | `deferred` | Keep wire names until cutover |
| D-07 | Crew presence on map (cloud → LAN → mesh) | `in_progress` | P1 cloud + P2 LAN done 2026-07-27. **Open:** P3 mesh / device relay (WebRTC via hub signalling, Nearby / Wi-Fi Direct, or store-and-forward — no Bluetooth mesh); P2b coarse "last seen" position over Freenet is a frozen later design (`SETTINGS_SYNC_AND_CREW.md` §5, off by default). Record: [`archive/CREW_PRESENCE.md`](archive/CREW_PRESENCE.md) |
| D-08 | Map overlays (highlights / bread trails / paddock names) | `done` | 2026-07-28 — timed check-this + 2 min trails + name watermarks. Record: [`archive/MAP_OVERLAYS.md`](archive/MAP_OVERLAYS.md); the 500 ms publish/poll rule is restated in `CODEBASE_HEALTH.md` § CPU / memory |
| D-03b | Tablet basemap blank (pack + skip/online) | `done` | 2026-07-27 — blob revoke, Esri-on-native, Capacitor Network |

**Deploy still pending from Phase C:** production secrets, `setAdminClaim.ts` for admin UIDs, optional Cloud Run service rename.

**Rename leftovers** (carried from [`archive/RENAME_TO_PUFAM.md`](archive/RENAME_TO_PUFAM.md), archived 2026-09-10; Phase B infra items stay under D-06):

- [ ] GitHub repo **display name / description** still say the old product name — external, GitHub settings only.
- [ ] Redeploy Cloud Run + PUFworks-site once the rebrand branch merges, so live copy matches `src/brand.ts`.

---

## Phase E — Crop packs, blight engine, desktop (post Phase D)

Not part of the original 13 steps. Track here so plugin work does not vanish between ROADMAP stamps.

| ID | Item | Status | Notes |
|----|------|--------|-------|
| E-01 | Crop-pack plugin contract + Settings → Plugins | `done` | CP-00–05, 2026-08-11/12 — `CROP_PACK_PLUGIN.md`; lifecycle UI is Settings → Plugins |
| E-02 | Blight engine params unify (BE-01–05) | `done` | PR stack #5–#9; walnut blight first consumer |
| E-03 | Desktop Freenet host + AppImage / portable | `done` | Phases 11a–11l; mist still experimental. Sizes ~157 MB AppImage / ~103 MB portable (12 Aug 2026) |
| E-04 | Chill portions on dashboard (packaged APK) | `done` | Walnut pack / species / tree cropKind; packaged Android weather/auth → Cloud Run |
| E-05 | Plugin zip drop (`plugins/`, `plugin.json`) | `done` | First-party `plugins/walnut_blight/` is catalog + engine defaults. React/Ji still in-app. `npm run plugins:pack` |
| E-06 | Dead-limb cleanup | `done` | 2026-08-13 — FieldOps/FieldMode/taskStore removed; `/field-ops` still redirects to `/map` |
| E-07 | Freenet operator holes | `in_progress` | Copy + UX done 2026-08-14 (holes 1, 2, 3-copy, 6, 7). Revoke-kick stays later. Hole 5 waits on E-08. Tracker: `FREENET_OPERATOR_FLOW.md` §8 |
| E-08 | Freenet network pack (desktop + APK) | `in_progress` | Umbrella: [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) — per-farm pack, native PUT everywhere, hybrid mirror for cloud farms, two-terminal goal. Android host detail: [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) (Phase 3). Native PUT spike GO 2026-08-15 |

---

## Progress log

Record every status change here (newest first). Rows dated 2026-07-13 (Phases A–C) are in [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md).

| Date | Step | Action | Notes |
|------|------|--------|-------|
| 2026-09-11 | E-08 | Network pack Phase 2 (hermetic) | Native PUT is the only PUT on every shell (`BrowserFreenetPutClient` / `BrowserFreenetSlotClient`); `fdev` and Hyphanet FCP deleted; node pinned 0.2.135; `npm run mist:smoke:native` added. Live check, Windows first launch and native A→B still pending — `FREENET_NETWORK_PACK.md` §5 Phase 2 |
| 2026-09-10 | E-08 | Freenet network pack plan | `FREENET_NETWORK_PACK.md` — decisions: native PUT on every shell (drop `fdev`), `FreenetHostPlugin` as the data seam, isolated `:freenet` process on Android, one node pin, web hidden, per-farm enable, hybrid for cloud farms. Read-only assessment preceded it |
| 2026-09-10 | Docs | `Plans/` consolidation | Index + `AGENTS.md`; `reference/` and `logs/` folders; Freenet holes + storage merged into `FREENET_OPERATOR_FLOW.md` §8–9; chill pack into `PLUGIN_AUTHORING.md`; review posture into `CODEBASE_HEALTH.md`; Steps 1–13 detail → `archive/ROADMAP_HISTORY.md` |
| 2026-09-10 | Deploy | Custom domain live | `am.pufworks.farm` on Firebase project `pufworks-am` via Hosting rewrite to Cloud Run `pufom`; hosted Cloud Functions not yet deployed there (STEP-09 leftovers) |
| 2026-08-14 | E-08 | APK Freenet host plan | Network pack in the APK; isolated process; native PUT is the go/no-go — `APK_FREENET_HOST.md` |
| 2026-08-14 | E-07 | Freenet holes copy + UX | Send PIN wording, Invite PIN leftovers, two-piece handoff, create→Send nudge, People hub empty-state |
| 2026-08-14 | E-07 | Freenet operator flow + holes plan | `FREENET_OPERATOR_FLOW.md` + `FREENET_HOLES.md` (merged into §8 on 2026-09-10); in-app How this works on Sync / People / join gate |
| 2026-08-13 | E-06 | Dead-limb cleanup | Removed unused FieldOps page, FieldMode, taskStore, appStore; kept `/field-ops` → `/map` |
| 2026-08-13 | Docs | Audit stamp | ROADMAP / DEVELOPER_NOTES / crop-pack / Freenet sizes brought in line with code |
| 2026-08-12 | E-01–E-05 | Plugins + blight + chill | Settings → Plugins; zip `plugins/`; BE-05; chill dashboard routing |
| 2026-07-28 | D-05b | Dam texture + exclusions | Water/hatch/gravel SVG patterns; internal_passable / internal_impassable; areaHa via turf.difference vs subtracting pins; paddock exterior unchanged |
| 2026-07-28 | D-08 | Map overlays | Timed highlights, bread trails (2 min), paddock name watermarks — `archive/MAP_OVERLAYS.md` |
| 2026-07-28 | D-05 | Map infrastructure | INFRA_TYPES (dam/pipe/vehicle/fuel/hazard + sensors); OrchardMap draw modes, geojson edit, sidebar chips, metadata notes/trackerId; Meshy live track future |
| 2026-07-27 | D-07 P2 | Crew presence (LAN hub) | `POST/GET /api/presence` + client poll/merge with cloud |
| 2026-07-27 | D-07 P1 | Crew presence (cloud) | `presence/{uid}` + CrewPresenceLayer + Settings share toggle |
| 2026-07-27 | D-04 | Offline Phase 3 | Photo Storage outbox; weather IDB + Cache weather; Android NSD hub scan |
| 2026-07-27 | D-03b | Tablet basemap | Blob URL revoke fix; Esri on Capacitor; Google fail→Esri; `archive/CREW_PRESENCE.md` plan |
| 2026-07-27 | D-03 | Map UX | Draw hit-targets / pan-without-point; mixed Farm Map Area naming |
| 2026-07-27 | D-01–D-02 | Docs + crop-pack toggles | PUFAM About/docs pass; PIN presets + Farm modules clamp blight without walnut pack |
| 2026-07-13 | STEP-01–13 | Phases A–C complete (code) | Detail rows in [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md) |

---

## Related documents

| Document | Purpose |
|----------|---------|
| [DEVELOPER_NOTES.md](../DEVELOPER_NOTES.md) | Architecture notes, mist/Freenet phases, §5 checklist |
| [Plans/README.md](README.md) | Index of every plan, with status and folder convention |
| [Plans/FREENET_OPERATOR_FLOW.md](./FREENET_OPERATOR_FLOW.md) | Freenet start / send / join / People as the code stands; §8 the seven known holes (E-07); §9 what is on Freenet |
| [Plans/APK_FREENET_HOST.md](./APK_FREENET_HOST.md) | E-08 — Freenet network pack inside the APK |
| [Plans/PLUGIN_AUTHORING.md](./PLUGIN_AUTHORING.md) | How to add a crop pack (file list; chill portions template) |
| [Plans/CROP_PACK_PLUGIN.md](./CROP_PACK_PLUGIN.md) | Crop-pack contract, Settings → Plugins, zip drop folder |
| [Plans/DEPLOY_CLOUD_RUN.md](./DEPLOY_CLOUD_RUN.md) | Cloud Run + Hosting deploy, custom domain, APK releases, Android dev builds |
| [Plans/archive/ROADMAP_HISTORY.md](archive/ROADMAP_HISTORY.md) | Steps 1–13 detail, dependency graph, bundle-size tables |
| [Plans/archive/SMOKE_TEST_LOG.md](archive/SMOKE_TEST_LOG.md) | Step 3 manual test results |
| [Plans/logs/AUDIT_LOG.md](logs/AUDIT_LOG.md) | Step 8 npm audit output |
| [README.md](../README.md) | Setup instructions |

---

## Out of scope (future phases)

Tracked here so they do not derail the phases above:

- Stripe / subscription billing (Step 7 Option C)
- Email notifications (Settings — "Coming Soon")
- Vector tiles for map polygons
- Full CI/CD pipeline (GitHub Actions) — APK release workflow exists; web deploy is still manual
- Public distribution / auto-updater
- Play Store packaging; splash + icon polish (from `archive/OFFLINE_MAP_APK.md`)
- Tile packs on Capacitor Filesystem; optional SQLite adapter if IndexedDB quota bites (from `archive/OFFLINE_MAP_APK.md`)
- PWA service worker (APK path preferred for paddock)
- NearMap / paid AU imagery
