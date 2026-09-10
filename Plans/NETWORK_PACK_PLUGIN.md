# Network-pack plugin system — contract

**Product:** PUF-AM — Ag Manager  
**Status:** Active — v1 contract; first and only consumer `plugins/freenet_host/` ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Phase 1, slice A done 2026-09-10)  
**Date:** 2026-09-10  
**Scope:** What a *network pack* is, what it ships, how it is enabled, and what it may not do. Sibling of [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md); same discovery, different lifecycle.  
**Experimental — not production.** Firebase Auth + invite PIN remains the shipping path. A network pack is how the experimental Freenet path is packaged, not a change to what ships.

Cite from code as `Plans/NETWORK_PACK_PLUGIN.md § <section>`.

---

## 1. What a network pack is

A crop pack adds *farm capability*: modules, pages, settings. A network pack adds a *storage or transport plane* the farm's data can ride on. It has no page of its own, owns no farm module, and needs one thing a crop pack never does — a **host capability** from the shell it is running in.

| Aspect | Crop pack | Network pack |
|--------|-----------|--------------|
| `plugin.json` `kind` | `crop_pack` | `network` (catalog row stays `kind: 'system'` in `SYSTEM_PLUGINS`) |
| Needs from the shell | nothing | a **host capability** — `FreenetHostPlugin` adapter or `null` |
| Enable | per farm (Install / Activate) | per farm, **but the node is per device**; the pack reconciles |
| Settings home | Settings → Plugins tile → pack route | Settings → Plugins → *Network & storage* tile; day-to-day controls under Settings → Sync |
| Registry order | `CROP_PACKS` | after every crop pack, in `SYSTEM_PLUGINS` order |
| Routes | module-gated, under `Layout` | none gated; may register **public routes** beside `/login` |

Vocabulary: crop packs are not Freenet plugins, and Freenet is a network pack, not a crop pack ([`NAMING.md`](NAMING.md) §1). `units/puf-freenet-host` is the *host plugin* (node lifecycle); `plugins/freenet_host` is the *network pack* (the app's UI and enable logic for it).

## 2. `plugin.json`

Same schema as a crop pack (`shared/farm/plugin.manifest.v1.schema.json`), with these values fixed:

| Field | Value | Why |
|-------|-------|-----|
| `kind` | `"network"` | Tells the audit and the adapter which contract applies. `"system"` is still accepted by the schema as the legacy spelling |
| `category` | `"network"` | The tile sits under *Network & storage* |
| `modules` | `[]` | A network pack grants nobody a page |
| `settingsDocId` | `null` | Its per-farm flag is not a Firestore settings doc (§5) |
| `id` | folder name | Same rule as crop packs; audited |

The adapter is `shared/farm/<id>Package.ts` (today `freenetHostPackage.ts`), which parses the manifest and refuses anything that is not `kind: network`, `category: network`, zero modules. The catalog row in `shared/farm/pluginsCatalog.ts` takes `label` and `blurb` from the manifest so the on-disk package and Settings cannot drift.

## 3. `src/index.ts`

Exports `packUi: NetworkPackUiRegistration` (`src/packs/types.ts`). Discovery is the same `import.meta.glob` in `src/packs/registry.ts` that finds crop packs; nothing is loaded at runtime ([`PLUGIN_PACK_LAYOUT.md`](PLUGIN_PACK_LAYOUT.md) §3 still forbids it).

| Field | Network pack fills it with |
|-------|---------------------------|
| `routes`, `navItems` | empty |
| `publicRoutes` | absolute paths mounted beside `/login`, before there is a farm session — start-farm and recover screens |
| `surfaces` | any of the network surfaces below |

### Surfaces

Core renders each by *slot name* through `PackSurfaces` / `PackSessionGates` (`src/components/PackSurfaces.tsx`), never by pack name. A crop pack may leave every one unset.

| Surface | Mounted from | Contract |
|---------|-------------|----------|
| `farmSession` | `App.tsx` `ProtectedRoute`, **outside** the session gates | Headless, renders null. Mount the reconciler here (§5). Sits outside the gates so the node can start while the join gate holds the app |
| `sessionGate` | `App.tsx` `ProtectedRoute`, inside unlock + privacy gates | Wraps `{ children }`; may block until a precondition is met. **Register eagerly** — a lazy gate flashes the app it is meant to hold back |
| `syncCard` | Settings → Sync (`FarmSyncCards.tsx`) | Core decides *whether* the farm has that pipe (`farmPipes.ts`); the card owns readiness and actions |
| `workshopDiagnostics` | Settings → Sync, `isWorkshopDiagnosticsEnabled()` | Bench card |
| `loginExplain` | `Login.tsx` step `freenet-explain` | Gets `{ optionState: FreenetOptionState; onBack(): void }`; navigates to its own `publicRoutes` |
| `farmSetupNudge` | Farm setup page | Dismissible banner |
| `howItWorks` | Settings → Sync crew note, Farm setup → People | Inline button; gets `{ className?: string }` |
| `pluginTile` | Settings → Plugins → Network & storage (`PluginsPanel.tsx`) | Gets `{ entry: SystemPluginDef; onOpenSync?(): void }`. Draws its own enable control and its *not available here* state (§6) |

Adding a surface means adding the key to `PackSurfaceComponents` with a doc comment and one core render site. Core never imports `plugins/<id>/src` directly; `audit-codebase.mjs` and `tests/codebaseHealth.test.ts` fail the build if it does.

## 4. Host capability

`src/lib/freenetHostCapability.ts` → `getFreenetHostCapability(): 'electron' | 'android' | null`. Pure apart from two shell probes (`getDesktopBridge()`, `Capacitor.isNativePlatform()`); no React.

| Shell | Capability | Adapter |
|-------|------------|---------|
| Electron | `'electron'` | `units/puf-freenet-host` behind the preload bridge (`puf-freenet:status|start|stop`) |
| Android APK | `null` today; `'android'` when the Capacitor `FreenetHost` plugin lands ([`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) Phase 3) | `:freenet` process, same `FreenetHostPlugin` shape |
| Hosted web | `null` | none — a browser cannot run a node |

The capability is the **only** thing the pack asks about the shell. It is not `VITE_MIST_EXPERIMENTAL`, not `MIST_FREENET`, not a hostname. The login option keys off it too (`freenetOptionState`, decision 5): `'electron'` → available or *needs-setting*; `null` → hidden, except the `npm run dev` workshop hub (which *is* the sidecar) and an APK with the mist gate open, which still reads through a paired hub ([`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) §7) until Phase 3.

Distinct from `detectFreenetRuntime()`, which answers "is there a node anywhere this device can *reach*" and keeps driving the tablet reader path.

## 5. Enable semantics

- **Per farm.** The flag is a plugin setting of the farm, like a crop pack's. For a Freenet-native farm (meta lives on the device) it is `pufam.networkPacks.v1.{farmId}` → `{ freenet_host: { enabled, changedAt } }` ([`NAMING.md`](NAMING.md) §5; `plugins/freenet_host/src/freenetHostEnable.ts`). For a cloud farm it will live on the Firestore farm doc when hybrid lands ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) §3, slice C); until then the tile offers no toggle for cloud farms and says so.
- **Default.** A Freenet-native farm with no record is **enabled** — the operator chose Freenet on the start screen; the flag exists so they can switch the node *off* for a farm without leaving it.
- **Node per device.** One node, however many farms. The reconciler (`freenetHostReconcile.ts`, mounted by `useFreenetHostReconciler` from the `farmSession` surface) computes `want = farm open ∧ farm is Freenet-native ∧ enabled ∧ capability = 'electron'` and moves the node toward it, debounced (1.5 s) so switching between two enabled farms never restarts it.
- **Reconciliation rule.** Bring-up is node-then-peer (`puf-freenet:start`, then `POST /api/mist/freenet/peer/start`). The reconciler **only stops a node it started**: an `attached` node, one the operator started from the Sync card's Connect or the workshop Start button, or one the desktop mist preference brought up at boot is ridden, never killed. Failures are logged, never thrown at the tree.
- **What it does not do (slice A).** It does not move the data path: publish and fetch still go through Express and the in-process `FreenetPeer` (slice B). Hybrid for cloud farms is slice C.

## 6. "Not available on this device"

When `getFreenetHostCapability()` is `null`, the `pluginTile` shows the badge **Not available on this device** and one sentence saying why (web: no node, open the farm in the desktop app; APK: reads through a paired hub until the Android host). No toggle, no Open Sync. The login option is hidden on the same condition. A capable shell holding a *cloud* farm shows **Coming with hybrid** instead — honest about slice C rather than a toggle that would do nothing.

## 7. Forbidden

- **Runtime code loading.** Discovery is a build-time glob; the pack is compiled in ([`PLUGIN_PACK_LAYOUT.md`](PLUGIN_PACK_LAYOUT.md) §3).
- **`AuthContext` importing the pack**, or any pack hook. The pack reads `useAuth()`; the reverse edge is audited.
- **Core importing `plugins/<id>/src` by path.** Only `src/packs/registry.ts` may; everything else goes through a named surface.
- **`lib/` gaining React.** `freenetHostCapability.ts` is pure; the pack's `freenetHostEnable.ts` and `freenetHostReconcile.ts` are pure (tested without a DOM or Electron).
- **A build flag as the gate.** Host capability decides; `VITE_MIST_EXPERIMENTAL` only opens the mist experiment on shells that have one.
- **Stopping a node the pack did not start.** See §5.
- **Owning farm modules or a nav item.** A network pack is a plane, not a page.

## 8. Checks

`npm run audit:codebase` — pack folder id/kind/category/modules, `export const packUi`, `plugins/` in the size scan, core ↛ `plugins/*/src`, `AuthContext` ↛ `plugins/`.  
`tests/codebaseHealth.test.ts`, `tests/packRegistry.test.ts` — manifest, registry pairing, surfaces, public routes, order.  
`tests/freenetHostCapability.test.ts`, `tests/freenetHostEnable.test.ts`, `tests/freenetHostReconcile.test.ts`, `tests/loginStorageChoice.test.ts` — the four behaviours above.
