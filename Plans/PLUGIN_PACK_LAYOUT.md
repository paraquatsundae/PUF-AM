# Self-contained crop packs (migration plan)

**Product:** PUF-AM — Ag Manager  
**Status:** Phase 0 under way, 2026-09-02 — see §5  
**Goal:** each pack's whole implementation lives in `plugins/<id>/src/`; a contributor adds a pack by adding one folder  
**Decision:** statically compiled, boundary enforced by the compiler. **No runtime loading** — see §3  
**Contract / history:** [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md) · [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)  
**Limits:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)

---

## 1. Where we actually are

**No pack ships UI in `plugins/` today.** All six folders hold manifests only:

| Folder | Contents |
|--------|----------|
| `plugins/chill_portions/` | `plugin.json`, `engine.json`, `README.md` |
| `plugins/walnut_blight/` | `plugin.json`, `engine.json`, `README.md` |
| `plugins/{drying,harvest,nutrition,water}/` | `plugin.json`, `README.md` |

`chill_portions` is **not** further along than the others. `src/packs/chill_portions/index.ts` lazy-imports `src/pages/WeatherEvents` and `src/components/chill/*`, exactly as `src/packs/walnut_blight/index.ts` imports `src/pages/BlightRisk` and `src/components/blight/*`. Chill only *looks* packaged because its `engine.json` carries the real science while its UI footprint in `src` is 2 files / 137 lines — against blight's 15 files / ~3,560 lines.

**Scale of the move:** ~14,870 lines of pack implementation across 97 files, plus 1,316 lines of tests.

| Pack | Impl lines | Tests | Hardest coupling |
|------|-----------:|------:|------------------|
| walnut_blight | 8,122 | 930 | Dashboard card, map heat, `weatherService`, `model_params` shared with economics, CF aggregate |
| chill_portions | 1,816 | 217 | Dashboard card, map operate readout, `BlockMetadataModal` cultivars, server route |
| drying | 1,625 | 52 | Imports harvest's `FarmDryersPanel` |
| water | 1,445 | 82 | Diary composer embed, `settings/farm` fields |
| nutrition | 1,077 | 0 | Core diary event type + export column |
| harvest | 676 | 35 | Map analytics reads `harvests` |

---

## 2. The real blocker is dependency direction

File location is the easy part. Core imports **from** packs, and until that inverts a pack cannot be removed without breaking the build:

```6:6:src/pages/Drying.tsx
import { FarmDryersPanel } from '../components/harvest/FarmDryersPanel';
```

**Count the right thing.** 18 files under `src/` import pack code, but 10 of them *are* pack code sitting in a core-looking folder — `useBlightWeather`, `blightSeason`, `runJiBlightSeries`, `SandboxMatrix`, `DryerPerformance` and the rest are imported only by `BlightRisk.tsx`, `components/blight/*` or `Drying.tsx`. Those relocate in Phase 1 and need no inversion. A further three (`App.tsx`, `navConfig.ts`, `DashboardPackCards.tsx`) import `src/packs/registry`, which is the intended direction.

That leaves **one** genuine core→pack edge: `src/pages/About.tsx` still calls `useWalnutPack`. Its coupling is a numbered prose list and one sentence of copy, which `PLUGIN_AUTHORING.md` defers deliberately — a copy decision, not wiring.

Two more edges exist if you count `src/lib/modelParameters.ts` as pack code: `Settings.tsx` and `useFarmEconomicsSettings.ts` read it for market price, harvest cost and water cost. That file mixes farm economics with blight research parameters, so it is §7 open question 2 — a data migration on `settings/model_params`, not a wiring problem, and it should not be attempted as part of Phase 0.

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

**Phase 0 is functionally complete.** The only core file left that names a pack is `About.tsx`, and that is prose.

- Turn each core→pack import into an **extension point** core declares and packs fill. The registry's existing `surfaces` concept is the seam; today `getPackUi()` is only called from tests, so surfaces are registered but never consumed.
- Slots needed, from the current couplings: ~~dashboard cards~~, ~~map operate readouts~~, ~~block-metadata fields~~, diary composer fields. Map block-analytics needed no slot — see the geometry note above.
- Move misfiled core utilities **into core**, not into a pack: ~~`SliderControl`~~, ~~the `WeatherData` type~~, `estimateWetnessHoursProxy`.
- ~~Retire the migration shims in `useOfferedFarmModules` and `ModuleRoute`.~~ They cannot simply be deleted: the legacy rules disagree with the generic path in both directions (a farm with walnut blocks but `blight` off, and a farm with a non-walnut profile but `blight` on), so removing them changes which modules invite PINs and join tickets offer. They are inverted and quarantined instead, to delete on the data condition.
- **Done when:** deleting a pack's folder breaks only its own registry entry.

### Phase 1 — Colocate into `plugins/<id>/src/`

Pure file moves plus build wiring. No runtime change, so it is revertible.

- Move each pack's components, page, hooks, lib, adapter and tests under `plugins/<id>/src/`.
- Replace the hand-maintained registry with build-time discovery (`import.meta.glob` over `plugins/*/src/index.ts`).
- Update `tsconfig.json` includes, `vitest.config.ts` globs, `eslint.config.js`, and `scripts/audit-codebase.mjs` — its pack check requires `src/packs/<id>/index.ts` (line 168) and must flip.
- **Done when:** `plugins/<id>/` is the only place that pack's code lives.

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
