# Self-contained crop packs (migration plan)

**Product:** PUF-AM — Ag Manager  
**Status:** Phase 0 complete. Phase 1 all six packs colocated, 2026-09-02; build-time discovery is the last step — see §5  
**Goal:** each pack's whole implementation lives in `plugins/<id>/src/`; a contributor adds a pack by adding one folder  
**Decision:** statically compiled, boundary enforced by the compiler. **No runtime loading** — see §3  
**Contract / history:** [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md) · [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)  
**Limits:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)

---

## 1. Where we actually are

> **Superseded.** This section describes the position before any work started, when no pack shipped UI in `plugins/`. All six now do — see the Phase 1 notes in §5. Kept as the starting point the plan was written against.

**No pack shipped UI in `plugins/` when this was written.** All six folders held manifests only:

| Folder | Contents |
|--------|----------|
| `plugins/chill_portions/` | `plugin.json`, `engine.json`, `README.md` |
| `plugins/walnut_blight/` | `plugin.json`, `engine.json`, `README.md` |
| `plugins/{drying,harvest,nutrition,water}/` | `plugin.json`, `README.md` |

`chill_portions` is **not** further along than the others. `src/packs/chill_portions/index.ts` lazy-imports `src/pages/WeatherEvents` and `src/components/chill/*`, exactly as `src/packs/walnut_blight/index.ts` imports `src/pages/BlightRisk` and `src/components/blight/*`. Chill only *looks* packaged because its `engine.json` carries the real science while its UI footprint in `src` is 2 files / 137 lines — against blight's 15 files / ~3,560 lines.

**Scale of the move:** ~14,870 lines of pack implementation across 97 files, plus 1,316 lines of tests.

| Pack | Impl lines | Tests | Hardest coupling |
|------|-----------:|------:|------------------|
| walnut_blight | 8,122 | 930 | ~~All of it~~ — moved; every edge cleared, see §5 |
| chill_portions | 1,816 | 217 | Dashboard card, map operate readout, `BlockMetadataModal` cultivars, server route |
| drying | 1,625 | 52 | Imports harvest's `FarmDryersPanel` — now a sibling pack path, see §5 |
| water | 1,445 | 82 | ~~Diary composer embed~~ (not a coupling — see §5), `settings/farm` fields |
| nutrition | 1,077 | 0 | Core diary event type + export column |
| harvest | 676 | 35 | Map analytics reads `harvests` |

---

## 2. The real blocker is dependency direction

File location is the easy part. Core imports **from** packs, and until that inverts a pack cannot be removed without breaking the build:

```6:6:src/pages/Drying.tsx
import { FarmDryersPanel } from '../components/harvest/FarmDryersPanel';
```

**Count the right thing.** 18 files under `src/` import pack code, but 10 of them *are* pack code sitting in a core-looking folder — `useBlightWeather`, `blightSeason`, `runJiBlightSeries`, `SandboxMatrix`, `DryerPerformance` and the rest are imported only by `BlightRisk.tsx`, `components/blight/*` or `Drying.tsx`. Those relocate in Phase 1 and need no inversion. A further three (`App.tsx`, `navConfig.ts`, `DashboardPackCards.tsx`) import `src/packs/registry`, which is the intended direction.

~~That leaves **one** genuine core→pack edge: `src/pages/About.tsx` still calls `useWalnutPack`.~~ Cleared with the walnut_blight move; only its prose and `/blight` links remain, which `PLUGIN_AUTHORING.md` defers deliberately — a copy decision, not wiring.

~~Two more edges exist if you count `src/lib/modelParameters.ts` as pack code: `Settings.tsx` and `useFarmEconomicsSettings.ts` read it for market price, harvest cost and water cost.~~ Also cleared. The economics keys are now `src/lib/farmEconomicsParams.ts` in core. That was a code split along a boundary the data already had, and it is **not** §7 question 2 — the stored `settings/model_params` document is untouched, and the migration question stands.

`src/packs/registry.ts:15-20` then statically imports all six pack modules, and `App.tsx:27` / `navConfig.ts:19` import the registry eagerly.

---

## 3. Decision: static compilation, enforced boundary

**Driving requirement:** a contributor submits a pack as a GitHub PR; once vetted and merged, CI builds and ships it. No hand-editing of core wiring. Packs are never uploaded into a running app by outside parties.

Three options were considered.

| Option | Boundary enforced by | Adding a pack | Verdict |
|--------|---------------------|---------------|---------|
| Build-time discovery, lint-enforced | `audit:codebase` greps | Add folder, rebuild | Weakest enforcement |
| **Static + per-pack tsconfig** | **The compiler** | **Add folder, rebuild** | **Chosen** |
| Runtime-loaded bundles | Physically unresolvable | Add folder, no core rebuild | Rejected — §3.1 |

Each pack becomes a workspace package whose `tsconfig.json` `paths` resolve **only** the host API. Reaching into `../../src/lib/blightModel` then fails to typecheck rather than merely failing a grep. This keeps one build, one test run, cross-boundary type safety and the current offline behaviour, while still forcing the host API to be designed honestly.

### 3.1 Why not runtime loading

It was the initial preference, and it buys three things: a physically unresolvable boundary, independent per-pack builds, and packs reaching already-installed apps without an app update. Only the third is unavailable any other way, and it is **not** a requirement here — the driving requirement is the contributor flow, which build-time discovery satisfies.

Against that it would cost: a semver-stable host API where every export is a compatibility obligation; loss of compile-time checking across the boundary; shared-singleton plumbing (React, router, Firebase, Zustand, Leaflet) correct in three environments — browser, Electron and a Capacitor WebView; a per-pack bundle pipeline on `@originjs/vite-plugin-federation`, since Vite has no native story; and offline precaching of bundles in an app where `lazyWithRetry` already exists because chunk fetches fail on shed tablets.

Two facts made it unnecessary rather than merely expensive:

- **Farms already enable packs with no rebuild.** `installCropPack` / `activateCropPack` / `deactivateCropPack` / `deleteCropPack` in `src/lib/cropPackLifecycle.ts` write `cropPacks` + `enabledModules` on the farm doc; nav and routes follow.
- **Pack code is already code-split.** Every page and panel loads through `lazyWithRetry`, so an uninstalled pack's JavaScript is never fetched. Only the six small registration objects and the manifest adapters are eager, and the adapters must be — Settings → Plugins lists every available pack, installed or not.

**The existing "Must not hot-load React from the zip" rule therefore stands unchanged.** Only the location of pack code changes, not the loading mechanism.

If the Electron or Freenet drop-in case ever becomes a requirement, this work is the prerequisite for it: the host API designed in Phase 2 is the same API a loader would need.

---

## 4. Target layout

```
plugins/<id>/
  plugin.json        # catalog row (unchanged)
  engine.json        # constants, if the pack has numbers (unchanged)
  README.md
  tsconfig.json      # paths → host API only
  src/
    index.ts         # CropPackUiRegistration — the only entry core sees
    ...              # page, components, hooks, lib, adapter
    *.test.ts
```

`src/packs/` disappears. `shared/farm/<id>Package.ts` moves into the pack.

---

## 5. Phases

### Phase 0 — Invert the dependencies (mandatory, largest)

Core must stop importing pack code. Worth doing on its own, and required for every later phase.

**Done so far:**

- `SliderControl` moved out of the blight pack into `components/ui` (`8857273`).
- Farm home declares a `dashboardCard` slot; blight and chill fill it and gate themselves (`cd67c0e`).
- Pack activation inverted: `shared/farm/cropPackActivation.ts` owns the legacy eligibility rules, core asks `useCropPackActivation()` for the whole map. `useOfferedFarmModules`, `InvitePinManager` and `MistFarmSyncCard` no longer name a pack id.
- The map's geometry fallback is core's own: `DEFAULT_ORCHARD_GEOMETRY` in `src/lib/orchardGeometry.ts`, rather than reaching into the walnut pack's `engine.json` defaults through `defaultCalibration`.
- `WeatherData` turned out to be a field-for-field duplicate of `DayWeather` in `shared/weather/dpirdClient.ts`, so it is now an alias of it and `weatherService` uses the shared type directly.
- Both map slots: `blockOperateReadout` (chill's CP line on the block operate card, which also deleted a `chill` prop threaded through four files) and `blockCultivars` (the cultivar list, contributed as registry data rather than a component since the field itself is core).

**Phase 0 is complete.** `About.tsx` was the last core file naming a pack; it now asks `useCropPackActivation()`, and only its prose and `/blight` links still mention one, which `PLUGIN_AUTHORING.md` defers on purpose. No file under `src/` (outside `packs/registry.ts`), `shared/` or `server/` imports pack code.

- Turn each core→pack import into an **extension point** core declares and packs fill. The registry's existing `surfaces` concept is the seam; today `getPackUi()` is only called from tests, so surfaces are registered but never consumed.
- Slots needed, from the current couplings: ~~dashboard cards~~, ~~map operate readouts~~, ~~block-metadata fields~~, ~~diary composer fields~~. Map block-analytics needed no slot — see the geometry note above. Neither did the diary composer: the water move showed that coupling does not exist — see §5.
- Move misfiled core utilities **into core**, not into a pack: ~~`SliderControl`~~, ~~the `WeatherData` type~~, ~~`estimateWetnessHoursProxy`~~ (all done — the last went with the walnut_blight move).
- ~~Retire the migration shims in `useOfferedFarmModules` and `ModuleRoute`.~~ They cannot simply be deleted: the legacy rules disagree with the generic path in both directions (a farm with walnut blocks but `blight` off, and a farm with a non-walnut profile but `blight` on), so removing them changes which modules invite PINs and join tickets offer. They are inverted and quarantined instead, to delete on the data condition.
- **Done when:** deleting a pack's folder breaks only its own registry entry.

### Phase 1 — Colocate into `plugins/<id>/src/`

Pure file moves plus build wiring. No runtime change, so it is revertible.

**Pilot done — nutrition (2026-09-02).** `Nutrition.tsx`, `nutritionService.ts`, `nutritionEngine.ts` and the registration now live in `plugins/nutrition/src/`. What the pilot established, for the packs that follow:

- `tsconfig.json` needed no change — it has no `include`, only an `exclude`, so `plugins/**` already compiled.
- `eslint.config.js` did. `react-hooks`, `jsx-a11y` and the Leaflet import ban were all scoped to `src/**`, so moving a page out silently dropped them. Those globs now cover `plugins/*/src/**` as well.
- `madge` only scanned `src`, `shared` and `server`, so moved packs fell out of cycle detection. `plugins` is now a scan root.
- `vitest.config.ts` gained `plugins/*/src/**/*.test.{ts,tsx}` so packs keep tests beside their code.
- The pack-registration check exists **twice** — `scripts/audit-codebase.mjs` and `tests/codebaseHealth.test.ts`. Both now accept either location, and both carry a note to drop the `src/packs/` arm when the last pack moves.
- Imports back into core are relative (`../../../src/...`), matching the depth pack registrations already used for `shared/`. An unused `@/*` alias exists in tsconfig, vite and vitest if that ever gets tiring.
- Verified beyond the gate: `npm run build` still emits a separate `Nutrition-*.js` chunk, so `lazyWithRetry` code splitting survived the move.
- Left behind on purpose: `shared/farm/nutritionPackage.ts` (the catalog imports every adapter eagerly — these move together, with discovery), and `src/lib/walnutNutritionalEngine.R`, which is uncompiled reference material whose name claims walnut while its contents claim nutrition.

**Harvest moved (2026-09-02).** Six files, and `src/components/harvest/` is gone. Taken second because it forces the cross-pack question rather than deferring it: drying reuses harvest's `FarmDryersPanel` from both `Drying.tsx` and its registration, so those two imports now cross pack folders and carry a comment pointing at §7 question 4. That is the honest state of a real dependency, and spelling it `plugins/harvest/src/FarmDryersPanel` makes it visible instead of letting it hide as a sibling under `src/components`. It shortens back to a sibling path when drying moves. The tooling widened for nutrition needed nothing further, which was the point of doing that first.

**Water moved (2026-09-02).** Eleven files — page, five components, `waterPlanning` and its test, the recent-stats hook, the field-class constant and the registration. `src/components/water/` is gone.

The interesting result is what did *not* move. §2 listed water's hardest coupling as a **diary composer embed**, and Phase 0 accordingly listed "diary composer fields" as a slot still to build. Reading the code, there is no coupling to invert. `DiaryComposerWaterFields.tsx` imports nothing, knows nothing about the water pack, and renders two number inputs — volume and duration — for an `irrigation` diary event. Irrigation is a **core diary event type**, and `DiaryComposer.tsx` does not gate the fields on the pack at all: they are the `else` branch of a spray check, and they render whether or not water is installed.

So the file stays in core. It is misnamed rather than misplaced — `DiaryComposerIrrigationFields` would say what it is — but renaming it is cosmetic and unrelated to this move. **No diary composer slot is needed**, which removes the last unbuilt item from the Phase 0 slot list.

Left behind for the usual reason: `shared/farm/waterPackage.ts`, with the other adapters.

**Drying moved (2026-09-02).** Ten files — page, `DryerPerformance`, three session modals/lists, two hooks, `dryingModel` and its test, and the registration. `src/components/drying/` is gone, and so is the stray `src/components/DryerPerformance.tsx` that sat at the top level of core's component folder.

This settles §7 question 4 in the mildest possible way. Harvest's move left drying importing `plugins/harvest/src/FarmDryersPanel` from two places; now that drying is itself a pack, both shortened to `../../harvest/src/FarmDryersPanel`. The dependency is unchanged and still real — it is just a sibling reference between two pack folders rather than a reach out of core. Whether one pack may import another is now a policy question for Phase 2's boundary rules, not a layout problem.

`src/lib/farmAssets.ts` stays in core. It is the farm's asset store — `FarmAssets` with dryers inside it — and it is read by both drying and harvest's panel. Pushing it into either pack would only reverse which one does the cross-pack import. It belongs to the farm, so it is exactly the kind of scoped data accessor Phase 2's host API is meant to expose.

**walnut_blight moved (2026-09-02).** 32 files, the largest pack. Unlike the other four this was not a file move — core reached into it from four directions, so each was cleared first, in its own commit, before anything was relocated.

The four edges, and what each turned out to be:

- **Wetness proxy.** `estimateWetnessHoursProxy` moved from `shared/weather/jiBlightModel.ts` to `shared/weather/wetnessProxy.ts`. Leaf wetness duration is a weather derivation, not a disease one — the DPIRD cache, the met.no forecast and the scheduled refresh all fill in `WD` on farms with no interest in blight — so the entire weather pipeline was importing a disease engine for one column. Phase 0 had already listed it as a misfiled core utility. The `functions/` copy stays vendored, still guarded by `functionsJiParity`.
- **`About.tsx`** now asks `useCropPackActivation()`. That left `useWalnutPack` with a single importer inside the pack, so it travelled with it.
- **Economics.** `marketPrice`, `harvestCostPerKg` and `waterCostPerML` moved to `src/lib/farmEconomicsParams.ts`, with `modelParameters` composing them back so `settings/model_params` keeps its shape. **This is not §7 question 2** and stores nothing new — it is a code split along a line the data already had, since `settingsOwnedKeys`, `cropPackLifecycle.ts` and `pluginPackage.ts` all already say economics must survive uninstalling the pack.
- **The server route.** See below.

**`/api/weather/blight-risk` was running a model nobody read.** The route ran `runBlightModel` over the farm and returned `blightResults`, `blockRisks` and `currentRiskScore` beside the weather. Its only caller is the dev-only fallback in `fetchEnvironmentalData`, which takes `weatherData` and discards the rest — and could not have done otherwise, because that function's return type never declared the risk fields.

Worse, core was supplying the inputs. `useOrchardMapAnalytics` passed blocks, spray events, irrigation events and irrigation type so the server could compute per-block risk; the reply dropped them; and `computeBlockAnalytics` fell through to its seasonal-and-canopy heuristic every time. The blight hook passed none of it. Core was feeding a disease model on the pack's behalf and the pack was not involved. The whole pathway is gone, behaviour unchanged, and `server/` no longer imports `src/lib` at all. The route keeps its path, since it is still the dev weather fallback and renaming it would touch the mist smoke tests.

Also deleted: `blightApi.getBlightRisk` in `src/services/farmRecordApis.ts`, a stub with no callers that returned a hardcoded 0.15.

After all that the move itself was mechanical, and the proof it worked is that relocating 32 files broke **only test import paths** — not one core source file. `npm run build` still emits a separate `BlightRisk-*.js` chunk.

**chill_portions moved (2026-09-02) — Phase 1 complete.** Nine files: four components, two hooks, the client-side `chillPortions` accessor, the page and the registration. No inversions were needed; nothing in core imported chill except the page the pack itself registers.

That page is `WeatherEvents.tsx`, and it moved despite the generic name. It is only ever reached through the pack's own `/weather-events` route, and it imports chill hooks and chill panels throughout — a chill page that was named after the tab it sits in.

`shared/weather/chillPortions.ts` and `chillCalculator.ts` stay in `shared/`, because `server/chillRoutes.ts` needs the model to serve `/api/weather/chill-portions`. Same shape as blight leaving `jiBlightModel.ts` behind.

**Both pack-location checks are now strict.** `scripts/audit-codebase.mjs` and `tests/codebaseHealth.test.ts` had each accepted either location during the migration, with a note to drop the `src/packs/` arm when the last pack moved. Both now require `plugins/<id>/src/index.ts` **and** fail if `src/packs/<id>/index.ts` reappears, so the old layout cannot creep back. `src/packs/` holds only `registry.ts` and `types.ts` — the core-side seam.

**Where that leaves Phase 1.** Every pack's implementation lives with its manifest. The one thing still hand-maintained is `registry.ts`, which names all six imports, so a contributor adding a folder must still edit one core file. Replacing it with `import.meta.glob` over `plugins/*/src/index.ts` is the remaining task, and it is now the only thing between here and "add a folder, no core edits".

- ~~Move each pack's components, page, hooks, lib and tests under `plugins/<id>/src/`.~~ Done, all six. The `shared/farm/<id>Package.ts` adapters are the exception and move with discovery, since the catalog imports them all eagerly.
- **Replace the hand-maintained registry with build-time discovery** (`import.meta.glob` over `plugins/*/src/index.ts`). The one remaining task: `registry.ts` still names all six imports, so adding a pack still means editing a core file.
- ~~Update `tsconfig.json` includes, `vitest.config.ts` globs, `eslint.config.js`, and `scripts/audit-codebase.mjs`.~~ Done during the nutrition pilot; both pack-location checks are now strict, and reintroducing `src/packs/<id>/index.ts` fails them.
- **Done when:** ~~`plugins/<id>/` is the only place that pack's code lives.~~ True today, except for the registry edit.

### Phase 2 — Make the boundary a compile error

- Per-pack `tsconfig.json` with `paths` resolving only the host API.
- Define that host API: one entry re-exporting React, router primitives, the auth/farm context, the UI kit and scoped data accessors.
- New `audit:codebase` SoC grep: core must not import `plugins/*` except through the discovery glob.

### Phase 3 — Contributor contract

- Rewrite [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) §5 around the new layout: one folder, no core edits.
- State what the host API guarantees and what is off-limits.

---

## 6. What this explicitly does not do

- No hot-load of React from a zip — the existing prohibition stands.
- No delivering new packs to already-installed apps without an app update.
- No untrusted or third-party runtime code. Packs arrive by vetted PR; forks are the forker's problem.
- No change to the farm-facing install/activate lifecycle, which already works.

---

## 7. Open questions

1. **Server and Cloud Functions.** `functions/src/blightAggregate.ts` and `server/chillRoutes.ts` are pack code running outside the browser. They may have to stay first-party in `functions/` and `server/`, with only the browser half moving.
2. **`settings/model_params`** is shared between blight and farm economics. Splitting it needs a data migration.
3. **`engine.json` imports.** `shared/farm/*Package.ts` imports them via `resolveJsonModule`; after the move the adapter is inside the pack, so the relative path shortens — check Vite still inlines them.
4. **Cross-pack dependency.** Drying imports harvest's `FarmDryersPanel`. Either it becomes a host-API surface, moves to drying, or drying declares a dependency on harvest.

---

## 8. Recommendation

Phase 0 is the whole difficulty and delivers value alone: it converts an invisible coupling problem into an enforced boundary. Start by inverting a single core→pack dependency end to end as a proof, then work outward.

Suggested pilot for Phase 1: **nutrition** (8 files, 1,077 lines, no core page imports its implementation) or **harvest** (8 files, one existing test). Do **not** pilot on walnut_blight — at 8,122 lines with Dashboard, map, weather, Cloud Function and shared-settings coupling, it would conflate the pattern with its hardest instance.
