# Self-contained crop packs (migration plan)

**Product:** PUF-AM — Ag Manager  
**Status:** Plan only — nothing built, 2026-09-02  
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

```25:25:src/pages/Settings.tsx
import { SliderControl } from '../components/blight/SliderControl';
```

```6:6:src/pages/Drying.tsx
import { FarmDryersPanel } from '../components/harvest/FarmDryersPanel';
```

`src/pages/Dashboard.tsx:20-24` pulls five pack imports for its home cards (`useWalnutPack`, `useChillPack`, `useFarmChillPortions`, the blight aggregate service, risk bands). The map does the same: `src/lib/mapBlockAnalytics.ts:5` imports `defaultCalibration` from `blightModel`, and `src/lib/weatherService.ts:3` takes its `WeatherData` type from it.

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

- Turn each core→pack import into an **extension point** core declares and packs fill. The registry's existing `surfaces` concept is the seam; today `getPackUi()` is only called from tests, so surfaces are registered but never consumed.
- Slots needed, from the current couplings: dashboard cards, map block-analytics contributions, map operate readouts, diary composer fields, block-metadata fields.
- Move misfiled core utilities **into core**, not into a pack: `SliderControl`, the `WeatherData` type, `estimateWetnessHoursProxy`.
- Retire the migration shims the authoring doc already flags as temporary: `useWalnutPack` / `useChillPack` special cases in `useOfferedFarmModules` and `ModuleRoute`.
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
