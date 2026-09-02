# Runtime-loadable crop packs (migration plan)

**Product:** PUF-AM — Ag Manager  
**Status:** Plan only — nothing built, 2026-09-02  
**Goal:** each pack's whole implementation lives in `plugins/<id>/src/` and loads at runtime; third parties can ship packs  
**Reverses:** the v1 "React UI ships in the app" decision — see §3  
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

`chill_portions` is **not** further along than the others. `src/packs/chill_portions/index.ts` lazy-imports `src/pages/WeatherEvents` and `src/components/chill/*`, exactly as `src/packs/walnut_blight/index.ts` imports `src/pages/BlightRisk` and `src/components/blight/*`. Chill only *looks* packaged because its `engine.json` carries the real science (constants, season defaults, nine cultivars) while its UI footprint in `src` is 2 files / 137 lines — against blight's 15 files / ~3,560 lines.

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

File location is the easy part. Core imports **from** packs in many places, and until that inverts a pack cannot be removed without breaking the build:

```25:25:src/pages/Settings.tsx
import { SliderControl } from '../components/blight/SliderControl';
```

```6:6:src/pages/Drying.tsx
import { FarmDryersPanel } from '../components/harvest/FarmDryersPanel';
```

`src/pages/Dashboard.tsx:20-24` pulls five pack imports for its home cards (`useWalnutPack`, `useChillPack`, `useFarmChillPortions`, the blight aggregate service, risk bands). The map does the same: `src/lib/mapBlockAnalytics.ts:5` imports `defaultCalibration` from `blightModel`, and `src/lib/weatherService.ts:3` takes its `WeatherData` type from it.

`src/packs/registry.ts:15-20` then statically imports all six pack modules, and `App.tsx:27` and `navConfig.ts:19` import the registry eagerly — so every pack is in the first-paint bundle graph regardless of what a farm installed.

---

## 3. This reverses a written decision

Four places currently forbid the end state. They need editing as part of this work, not quietly contradicting:

| File | Line | Says |
|------|-----:|------|
| `PLUGIN_AUTHORING.md` | 192 | "Hot-load React / JS from the zip" under **Must not** |
| `PLUGIN_AUTHORING.md` | 231 | "**Do not add:** zip hot-load…" |
| `CROP_PACK_PLUGIN.md` | 149 | "Hot-loading arbitrary React from a zip is out of scope for v1" |
| `plugins/README.md` | 31 | "v1: React UI still ships in the app" |

Each now carries an **Under review** pointer back to this plan. The rules there stand until this is accepted.

---

## 4. Constraints that shape the design

**Three delivery targets.** Browser (Cloud Run, `base: '/'`), Electron desktop, and a Capacitor APK (`com.sentinut.farm`, `webDir: dist`, offline-packaged mode via `CAP_PACKAGED=1`). A runtime loader needs an answer for each.

**Offline tablets are the primary field device.** `src/lib/lazyWithRetry.ts` exists because "a route's JavaScript is fetched the first time somebody opens that page. On a tablet in a shed that is exactly when the Wi-Fi drops out." Runtime-fetched plugin bundles make that failure mode worse and **must** be precached locally, not fetched on navigation.

**Play policy permits the mechanism.** Google's Device and Network Abuse policy bans downloading executable code but states: "This restriction does not apply to code that runs in a virtual machine or an interpreter … (such as JavaScript in a webview or browser)." A Capacitor WebView is squarely inside that exception. Two conditions attach: runtime-loaded interpreted code "must not allow potential violations of Google Play policies," and self-updating must not change the app's primary purpose.

**But Capacitor's native bridge is the specific risk.** Google publishes separate guidance on the *Sensitive JavaScript Interface Vulnerability*: a WebView that both exposes native functionality through a JS interface **and** loads untrusted content is an enforcement target. Capacitor bridges native APIs into exactly this WebView. First-party packs loaded at runtime are unaffected; **untrusted third-party packs are the shape that draws enforcement.** Any third-party story needs signing and curation, not open zip drop. If iOS is ever a target, Apple additionally forbids an in-app "store or storefront for other code."

**Shared singletons.** React, react-router, Firebase, Zustand stores and Leaflet must be the *same instances* in host and plugin. Two React copies break hooks; two Firebase apps break auth. This is what forces a host API rather than plain bundling.

---

## 5. Phases

### Phase 0 — Invert the dependencies (mandatory, largest)

Core must stop importing pack code. No runtime work is possible before this, and it is worth doing on its own.

- Turn each core→pack import into an **extension point** core declares and packs fill. The registry's existing `surfaces` concept is the seam to extend; today `getPackUi()` is only ever called from tests, so surfaces are registered but never consumed.
- Slots needed, from the current couplings: dashboard cards, map block-analytics contributions, map operate readouts, diary composer fields, block-metadata fields.
- Move genuinely shared code **into core**, not into a pack: `SliderControl`, the `WeatherData` type, `estimateWetnessHoursProxy`. These are core utilities that happen to live under `blight/`.
- Retire the migration shims the authoring doc already flags as temporary: `useWalnutPack` / `useChillPack` special cases in `useOfferedFarmModules` and `ModuleRoute`.
- **Done when:** deleting a pack's folder breaks only its own registry entry.

### Phase 1 — Colocate into `plugins/<id>/src/`

Pure file moves plus build wiring. Still statically compiled — no runtime change, so it is safely revertible.

- Move each pack's components, page, hooks, lib, adapter and tests under `plugins/<id>/src/`.
- Replace the hand-maintained registry with build-time discovery (Vite `import.meta.glob` over `plugins/*/src/index.ts`).
- Update `tsconfig.json` includes, `vitest.config.ts` test globs, `eslint.config.js`, and `scripts/audit-codebase.mjs` — its pack check currently requires `src/packs/<id>/index.ts` (line 168) and must flip, plus a new SoC grep that core must not import `plugins/*`.
- **Done when:** `plugins/<id>/` is the only place that pack's code lives.

### Phase 2 — Define the host API (hardest design work)

The contract third parties compile against. Everything not in it must be unreachable.

- One versioned entry (`@pufam/host`) re-exporting React, router primitives, the auth/farm context, the UI kit, and scoped data accessors.
- Scoped Firestore access — a pack gets its own collections and settings doc, never a raw `db` handle.
- Semver it. Once published, every export is a compatibility obligation.
- **Risk:** packs currently reach into dozens of core modules. Each becomes API surface or gets deleted. Expect this phase to shrink what packs are allowed to do.

### Phase 3 — Build packs to standalone ESM

- Per-plugin Vite library build; host API and shared singletons marked external.
- Emit `plugins/<id>/dist/<id>.js` plus integrity hash and host-API version range in the manifest.
- Extend `scripts/plugin-package.mjs`, which today only validates and zips manifests (`verify`, `unpack`, `pack`, `list`) and never compiles anything.

### Phase 4 — Runtime loader

- Replace the static registry with a loader that resolves installed packs from the farm doc, verifies hash and host-API range, and dynamic-imports the bundle.
- Import map (or equivalent) so externals resolve to the host's singletons.
- **Precache to IndexedDB on install, not on navigation** — the shed-tablet constraint is non-negotiable.
- Failure path: a pack that fails to load must degrade to a disabled nav entry, never a white screen. `RouteErrorBoundary` is the precedent.

### Phase 5 — Distribution and trust

- First-party packs ship inside the app bundle; runtime loading is then an internal mechanism with no download.
- Third-party packs need a signing key, a manifest signature check, and an explicit trust prompt.
- Per-platform source of bundles (Cloud Run static, Electron on-disk, APK asset + optional download).
- Decide sandboxing: accept trusted-only signed packs, or isolate in an iframe with a postMessage bridge (costly — a plugin can no longer render inline into core surfaces).

---

## 6. Open questions

1. **Is third-party actually required, or is it first-party modularity?** If packs only ever ship with the app, Phases 0–1 plus build-time discovery deliver the whole benefit and Phases 2–5 can be dropped.
2. **Who may publish?** Open ecosystem vs. signed allow-list changes the security and Play-enforcement position completely.
3. **Does the host API version with the app or independently?** Independent versioning means supporting old packs against new cores.
4. **Server and Cloud Functions.** `functions/src/blightAggregate.ts` and `server/chillRoutes.ts` are pack code that runs outside the browser. Runtime-loading them is a separate problem; they may have to stay first-party.
5. **`settings/model_params`** is shared between blight and farm economics. Splitting it needs a data migration.

---

## 7. Recommendation

**Do Phase 0 and Phase 1 first and treat the runtime decision as deferred.** They are required for every version of this goal, they are individually revertible, and they convert an invisible coupling problem into an enforced boundary. Phase 0 alone would let the codebase honestly claim packs are modular.

Phases 2–5 are a different order of magnitude: a published API contract, a build pipeline per pack, a loader with an offline cache, and a trust model. Start them only once question 1 is answered, because "first-party modularity" and "third-party ecosystem" justify very different amounts of that work.

Suggested pilot for Phases 0–1: **nutrition** (8 files, 1,077 lines, no core page imports its implementation) or **harvest** (8 files, one existing test). Do **not** pilot on walnut_blight — at 8,122 lines with Dashboard, map, weather, Cloud Function and shared-settings coupling, it would conflate the pattern with its hardest instance.
