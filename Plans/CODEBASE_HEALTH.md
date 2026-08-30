# Core codebase health

**Product:** PUF-AM — Ag Manager  
**Status:** Active — limits, layering, concern, cost, debug/audit loop  
**Scope:** web app, `shared/`, `server/`, crop packs. Desktop / APK / Freenet later.  
**How to add a pack:** [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)  
**Check runs (output):** [`CODEBASE_HEALTH_CHECK.md`](CODEBASE_HEALTH_CHECK.md)

This is **limits + one source of truth + concern + cost + a procedure**. It is not a rewrite.

---

## Layering (one-way)

```
farmModules → cropPacks (catalog + migrate) → pack UI registry → nav / App
farmModules → AuthContext ← cropPacks
AuthContext → useOfferedFarmModules ← cropPacks
```

- [`shared/auth/farmModules.ts`](../shared/auth/farmModules.ts) must **never** import `cropPacks`.
- [`src/contexts/AuthContext.tsx`](../src/contexts/AuthContext.tsx) must **never** import pack hooks.
- Firestore errors live in [`src/lib/firestoreErrors.ts`](../src/lib/firestoreErrors.ts), not Auth. `isBenignFirestoreFailure` is exported — [`src/services/api.ts`](../src/services/api.ts) uses it to return empty/null (or rethrow for the outbox) instead of wrapping.
- `tsc --noEmit` is the lint gate. `strictNullChecks` is **off** — `if (!result.ok)` does not narrow unions. Use `in` accessors (`pluginPackageIssues`, `parseByoConfigError`, `nativeHostPutErrorMessage`). Do not enable `strict` in a health pass.

**Settings category ≠ shell menu.** `plugin.json` `category` groups Settings → Plugins (`crop` / `generic` / `network`). `navItems.groupId` is Field / Crop / Records / System. Water is `generic` + Crop nav. Harvest is `generic` + Records. Do not copy one from the other.

---

## Separation of concern (page / hook / lib)

File size is not concern. A 300-line kitchen-sink hook is still one pile. An 80-prop canvas is a size win, not a concern win. Next peel: one job per new file.

```
page (compose) → hooks (one job) → lib (pure)
Leaflet / react-leaflet → map components + map hooks only
src/lib → must not import src/components
```

- **Page** = route, compose, pass callbacks. No new Leaflet, turf, or Firestore in a page on the next peel.
- **Hook** = one job. Do not merge viewport + analytics + clicks again. Do not add a `useOrchardMapPage` that re-owns everything.
- **Lib** = pure helpers + tests. No React. No Leaflet unless the file is already a map-lib (`leaflet-setup`, layer sync/paint). Tests must not import modules that touch `window` / Leaflet (same lesson as pin tooltip).
- **JSX** = chrome vs canvas vs sheets stay split. Do not grow [`orchardMapPaneTypes.ts`](../src/components/map/orchardMapPaneTypes.ts) into a second page.
- **Fetch stays in the hook that owns that data.** Harvest/weather stay in analytics; crew presence stays in `useCrewPresence`. Do not start a second harvest listener on the page.
- Move-first still wins: if a peel would need a new store/context to “do SoC properly,” don’t. Split the file instead.

---

## CPU / memory (tablet)

Target: phone / tablet WebView + LAN. Prefer not adding work. Not a desktop profiler score. Procedure A stays the same four commands — `audit:codebase` cannot measure frame time or heap.

Existing habits to keep: layer sync mutates Leaflet in place ([`useOrchardMapLayers`](../src/hooks/useOrchardMapLayers.ts)); weather fetch is analytics-tab gated ([`useOrchardMapAnalytics`](../src/hooks/useOrchardMapAnalytics.ts)); viewport `moveend` is debounced.

- **Leaflet:** keep FeatureGroup membership + style refresh (mutate). Do not remount `MapContainer`. Do not rebuild GeoJSON layers on pan/zoom.
- **Geometry:** turf / `findBlockIdAtPoint` / centroids only on user action or `useMemo` keyed on `blocks`, not on every map move.
- **Network:** no new Firestore `onSnapshot` on OrchardMap / FarmDiary in a health peel. One-shot `getDocs` + existing store hydrate only. Weather/chill stay tab- or pack-gated. No new `setInterval` without a stated period and a teardown.
- **React state:** do not put tile blobs, full weather series, or cloned GeoJSON into React state. Basemap tiles stay IndexedDB ([`CachedTileLayer`](../src/components/map/CachedTileLayer.tsx)).
- **Re-renders:** do not start a `React.memo` / new object-identity pass. If a peel adds a child, do not pass a fresh inline object/array that forces Leaflet overlays to reset unless the old page already did that.
- **Lists / map scale:** the old “2,000 polygons” TODO stays a comment, not this pass. No clustering rewrite, no bbox query, no vector tiles.

---

## File size

New files in `src/`, `shared/`, `server/`:

- Soft: **400** lines
- Hard fail (`npm run audit:codebase`): **600**

Existing files over 600 are listed in `scripts/audit-codebase.mjs` (`KNOWN_OVERSIZE`):

- Warn at **800**
- Split ticket above **1200**
- No new logic except a move-out

In-scope size peel is done (2026-08-29). `KNOWN_OVERSIZE` is Freenet cards only. Do not grow those in this pass.

---

## In-scope compliance (done-when)

Bring every **in-scope** file to the rules above. Not a grep gate first — the app has to comply.

**In scope:** `src/` (except Freenet / mist cards), `shared/`, `server/`, crop packs.  
**Out:** `MistWorkshopCard`, `MistFarmSyncCard`, Desktop / APK / Freenet.

A file is done when:

- **Size:** ≤600 so it can leave `KNOWN_OVERSIZE`. New extracts: soft 400 / hard 600.
- **SoC:** page = compose only. No Leaflet, turf, or Firestore on a page. Fetch stays in the hook that owns it. `src/lib` ↛ `src/components`. Lib is types / pure helpers / an existing store — not a kitchen-sink hook.
- **Cost:** no new `onSnapshot` on OrchardMap / FarmDiary. Existing page listeners (Settings, Harvest, Admin) move into the hook that owns that data — same subscribe/teardown, not a second listener. Do not remount `MapContainer`. No turf-on-pan. No `React.memo` campaign.

Peel order (move-first, same operator UI). One job per new file. No `useOrchardMapPage`. Do not grow `orchardMapPaneTypes.ts` into a second page.

1. FarmDiary JSX → ≤600 (header / block scope / composer / timeline). **Done.**
2. `farmDiary.ts` — types vs store vs hook. Keep `useFarmDiary` import path. **Done.**
3. Settings / Harvest / Financials — Firestore off the page into existing or new one-job hooks. **Done.**
4. OrchardMap → ≤600 (leave `KNOWN_OVERSIZE`). **Done** (530; left allowlist).
5. Login, `BlightEngineSettings`, AuthContext (never import pack hooks), Admin (move snapshots), `api.ts`, `accessPinRoutes` (when grants next touched). **Done.** Farm Management fetch also moved (`useFarmManagementOrg`).
6. Optional later: thin audit greps. Procedure A stays the same four commands.

In-scope `KNOWN_OVERSIZE` is empty. Freenet cards stay out.

---

## Farmer grants (explicit rule)

Installing a pack updates farm `enabledModules` and the **owner admin** grant. It does **not** rewrite existing farmer/viewer PIN grants.

- **Admin** sees an active pack in nav via `offeredFarmModules`.
- **Farmer / viewer** see it only if their stored `users/{uid}.modules` includes that module **and** the farm catalog offers it.
- Owner decides under **Farm management → Modules** or by minting a new PIN. Do not silently expand every PIN.

---

## Empty catalog

`resolveFarmEnabledModules(undefined | [])` returns **every** module id, including pack modules. That is the old-doc fallback. New farms write `defaultModulesWithoutCropPacks()`. Do not “simplify” the empty case to mean “no packs” without a migrate.

---

## Debug and audit procedure

### A. Every change that touches packs, nav, modules, or grants

1. `npm test && npm run lint && npm run plugins:verify && npm run audit:codebase` (`plugins:verify` with no path checks every first-party folder)
2. Localhost click path (not a screenshot): Settings → Plugins → Install → Crop or Records menu → open the page → deactivate → menu gone → activate → menu back
3. Two roles: farm **admin** and a **farmer PIN** minted before the pack existed. Farmer should not see the new item until the owner grants the module
4. Hard-refresh after deploy (Cloud Run bakes the Vite bundle)

**CodeRabbit** (after step 1 is green, not a fifth command): review the uncommitted diff in the sidebar, or `coderabbit review --uncommitted --include-untracked`. Config is [`.coderabbit.yaml`](../.coderabbit.yaml). It reads this file. Dismiss enable-`strict`, `React.memo`, `useOrchardMapPage`, new map/diary `onSnapshot`, remount `MapContainer`, empty-catalog “simplify”, and farmer-grant expansion. Freenet / Desktop / APK are path-filtered until that pass. Do not add CodeRabbit to the four-command gate.

### B. Before `am.pufworks.farm` deploy

1. Same commands as A
2. Deploy from a **Linux-local slim tree**. Do not walk `node_modules`, `android/`, `release/` (Windows mount + `release/` hung `gcloud run deploy --source .`)
3. After revision is 100% traffic: `GET https://am.pufworks.farm/api/health` → `{"status":"ok"}`
4. Smoke: login, Crop menu, Records → Harvest, Settings → Plugins groupings

### C. When a farm “lost” a page

Read, do not guess:

- `farms/{id}.cropPacks` — installed? `active`?
- `farms/{id}.enabledModules` — module id present?
- `users/{uid}.role` + `users/{uid}.modules` — farmer intersection
- `offeredFarmModules(enabled, cropPacks)` — should the menu show it?

If pack is `active` and menu is empty: catalog/grant bug, not a missing route. If pack is missing: migrate or Install, not a nav rewrite.

### D. Recurring (monthly, or every new pack)

- Re-run procedure A; prepend the full output to [`CODEBASE_HEALTH_CHECK.md`](CODEBASE_HEALTH_CHECK.md)
- Paste the size table here (newest first, short)
- `npm audit` → [`AUDIT_LOG.md`](AUDIT_LOG.md)
- Grep stale “Farm setup” for water/dryers/harvest
- No new `useFooPack` hook; no new hard-coded pack route in `App.tsx` / `navConfig.ts`
- Optional: one CodeRabbit pass on recent health commits. Note a real SoC/cost hit in the check log. Do not paste the whole review into the size appendix.

### E. What we will not add

- Lifecycle hooks (`onInstall` / `onDelete`)
- Zip React hot-load
- Generic untyped `settings/{packId}` rules
- A second module owner list in `farmModules.ts`
- Desktop/Freenet cleanup in this pass
- A CPU/heap gate in `audit:codebase`
- `React.memo` / profiler / why-did-you-render as a health requirement
- A second global store or Map context “for performance”
- CodeRabbit as a Procedure A command or merge blocker

---

## Size appendix

Newest first. Short table here; full command output in [`CODEBASE_HEALTH_CHECK.md`](CODEBASE_HEALTH_CHECK.md).

### 2026-08-29

In-scope compliance peel. Pages compose-only (no Firestore / Leaflet / turf). Auth session listen lives in lib (AuthContext never imports hooks). Procedure A green. Tests 857 passed.

| Lines | File |
|------:|------|
| 1103 | `src/components/MistWorkshopCard.tsx` |
| 1014 | `src/components/MistFarmSyncCard.tsx` |
| 530 | `src/pages/OrchardMap.tsx` |
| 479 | `src/pages/Admin.tsx` |
| 378 | `src/components/blight/BlightEngineSettings.tsx` |
| 342 | `src/contexts/AuthContext.tsx` |
| 150 | `src/pages/FarmDiary.tsx` |
| 133 | `src/pages/Login.tsx` |

`KNOWN_OVERSIZE` is Freenet only. Full log: [in-scope compliance](CODEBASE_HEALTH_CHECK.md#2026-08-29--in-scope-compliance).

### 2026-08-28

SoC + CPU/MEM rules added (page/hook/lib; tablet don’t-add). Next peel must follow them. No code this note.

OrchardMap canvas / sheets after viewport / analytics / clicks. Tests 848 passed. Procedure A green. `OrchardMap` 1483→1044→**795**. Off the ≥800 warn list. Still in `KNOWN_OVERSIZE` (over 600).

Full logs: [canvas](CODEBASE_HEALTH_CHECK.md#2026-08-28--orchardmap-canvas--sheets) · [viewport](CODEBASE_HEALTH_CHECK.md#2026-08-28--orchardmap-viewport--analytics--clicks).

| Lines | File |
|------:|------|
| 1149 | `src/pages/FarmDiary.tsx` |
| 1103 | `src/components/MistWorkshopCard.tsx` |
| 1014 | `src/components/MistFarmSyncCard.tsx` |
| 995 | `server/accessPinRoutes.ts` |

Next: FarmDiary (only in-scope ≥800 page) or keep peeling OrchardMap toward 600. No map redesign. Freenet cards stay out of this pass.

### 2026-08-27

Phase 1 checkpoint → drying/water → blight / diary hooks → BlightRisk JSX → OrchardMap operate → edit modals → edit sidebar → draw handlers → layer sync / chrome → **toolbar / search / basemap**. Tests 845 passed. Procedure A green. `OrchardMap` 4698→4397→3671→3155→2543→1846→1483. Still a split ticket.

Full logs: [toolbar](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-toolbar) · [layer sync](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-layer-sync) · [draw handlers](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-draw-handlers) · [edit sidebar](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-edit-sidebar) · [edit modals](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-edit-modals) · [OrchardMap first](CODEBASE_HEALTH_CHECK.md#2026-08-27--orchardmap-first-extract) · [BlightRisk JSX](CODEBASE_HEALTH_CHECK.md#2026-08-27--blightrisk-jsx-extract) · [FarmDiary](CODEBASE_HEALTH_CHECK.md#2026-08-27--farmdiary-extract) · [BlightRisk hooks](CODEBASE_HEALTH_CHECK.md#2026-08-27--blightrisk-extract) · [drying/water](CODEBASE_HEALTH_CHECK.md#2026-08-27--dryingwater-extract) · [tsc nits](CODEBASE_HEALTH_CHECK.md#2026-08-27--remaining-tsc-nits) · [`api.ts`](CODEBASE_HEALTH_CHECK.md#2026-08-27--apits--isbenignfirestorefailure) · [checkpoint](CODEBASE_HEALTH_CHECK.md#2026-08-27--phase-1-checkpoint).

| Lines | File |
|------:|------|
| 1483 | `src/pages/OrchardMap.tsx` |
| 1149 | `src/pages/FarmDiary.tsx` |
| 1103 | `src/components/MistWorkshopCard.tsx` |
| 1014 | `src/components/MistFarmSyncCard.tsx` |
| 995 | `server/accessPinRoutes.ts` |

Next extract: leftover OrchardMap canvas wiring / page chrome. No map redesign. Freenet cards stay out of this pass.

### 2026-08-26

`npm test` 813 passed. `npm run plugins:verify` (all first-party folders). `npm run audit:codebase` passed (zero cycles). `tsc --noEmit` still fails on pre-existing files outside this pass (mist, BYO, secrets console, a few `key` props).

| Lines | File |
|------:|------|
| 4698 | `src/pages/OrchardMap.tsx` |
| 2862 | `src/pages/BlightRisk.tsx` |
| 1432 | `src/pages/FarmDiary.tsx` |
| 1120 | `src/components/DryerPerformance.tsx` |
| 1103 | `src/components/MistWorkshopCard.tsx` |
| 1038 | `src/pages/WaterMonitoring.tsx` |
| 1014 | `src/components/MistFarmSyncCard.tsx` |
| 995 | `server/accessPinRoutes.ts` |

Splits this pass: `cropPackCatalog.ts` / `cropPackMigrate.ts`; `firestoreErrors.ts`; drying sessions hook; water planning helpers; map analytics + status bar.
