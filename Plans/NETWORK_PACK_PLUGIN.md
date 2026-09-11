# Network-pack plugin system — contract

**Product:** PUF-AM — Ag Manager  
**Status:** Active — v1 contract; first and only consumer `plugins/freenet_host/` ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Phase 1, slice A done 2026-09-10, slice B done 2026-09-11)  
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
| Electron | `'electron'` | `units/puf-freenet-host` behind the preload bridge (`puf-freenet:status|start|stop` for the node; `puf-freenet:put|get|slot-put|slot-get` for the data path) |
| Android APK | `null` today; `'android'` when the Capacitor `FreenetHost` plugin lands ([`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) Phase 3) | `:freenet` process, same `FreenetHostPlugin` shape |
| Hosted web | `null` | none — a browser cannot run a node |

The capability is the **only** thing the pack asks about the shell. It is not `VITE_MIST_EXPERIMENTAL`, not `MIST_FREENET`, not a hostname. The login option keys off it too (`freenetOptionState`, decision 5): `'electron'` → available or *needs-setting*; `null` → hidden, except the `npm run dev` workshop hub (which *is* the sidecar) and an APK with the mist gate open, which still reads through a paired hub ([`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) §7) until Phase 3.

Distinct from `detectFreenetRuntime()`, which answers "is there a node anywhere this device can *reach*" and keeps driving the tablet reader path.

### Data path (slice B, 2026-09-11)

The capability also picks *who moves the bytes*. `src/mist/freenetPackTransport.ts` defines one `FreenetPackTransport` for every Freenet op the pack performs — peer status/start/stop/contribute, `publishBlob`, `hotRecord`/`pullHot`/`pullByUri`, `slotPublish`/`slotRead` — and `freenetTransportSelect.ts` chooses the implementation on every call:

| Capability | Transport | Route |
|------------|-----------|-------|
| `'electron'` with a preload that exposes `put/get/slotPut/slotGet` | `freenetHostTransport.ts` | renderer → preload → `puf-freenet:*` → `FreenetHostPlugin` → wire (`server/freenetHostWire.ts`) → node WS |
| anything else (tablet, web, an older Electron preload) | `freenetRelayTransport.ts` | `apiFetch` → paired hub's `/api/mist/freenet/*` (`server/mistFreenetRoutes.ts`, now the LAN relay) |

The local-node-first read (`freenetLocalNode.ts`) sits above the transport and is unchanged. The page still seals and signs everything; the host only moves bytes — `putCiphertext` runs `assertCiphertextForFreenet` in the wire, so plaintext is refused on the host path exactly as the relay's `FreenetMistStore` refuses it.

**Host interface additions** (`units/puf-freenet-host/src/types.ts`, all optional so slice-A hosts stay valid):

```ts
putSlotState?(input: { parameters: Uint8Array; state: Uint8Array; instanceIdBase58: string }):
  Promise<{ uri: string; instanceIdBase58: string; mode: 'put' | 'update' }>;
getSlotState?(instanceIdBase58: string): Promise<Uint8Array | null>;
```

The slot is the join ticket's mutable address (`Plans/reference/MIST_NETWORK_STORAGE.md`); the page builds and signs the `PUFSLOT1` state, the host puts it. Until Phase 2 the wire's slot put still shells out to `fdev` (`putJoinSlotViaFdev`); the interface does not change when that goes native.

**IPC channels** (`desktop/main.ts`, inputs validated by `desktop/freenetIpcInput.ts` before the host sees them):

| Channel | Args | Validation |
|---------|------|------------|
| `puf-freenet:put` | `{ bytes, key? }` | bytes as `Uint8Array`/`ArrayBuffer`/base64, non-empty, ≤ 8 MiB; `key` optional, must parse as `mist/v1/farm/<id>/…` with `<id>` matching `[A-Za-z0-9_-]{1,128}` |
| `puf-freenet:get` | `uri` | `normalizeMistFreenetUri`, ≤ 256 chars |
| `puf-freenet:slot-put` | `{ parameters, state, instanceIdBase58 }` | parameters ≤ 1 KiB, state ≤ 64 KiB, id `^[1-9A-HJ-NP-Za-km-z]{32,64}$` |
| `puf-freenet:slot-get` | `instanceIdBase58` | same id shape |

Handlers rethrow as plain `Error(message)` so the renderer sees the reason, not a stack; the per-launch loopback token model for the Express hub is untouched. On the host path there is no outbox (a put while the node is down fails; the relay still queues) and the content hash is verified in the page before the AEAD open.

## 5. Enable semantics

- **Per farm.** The flag is a plugin setting of the farm, like a crop pack's. For a Freenet-native farm (meta lives on the device) it is `pufam.networkPacks.v1.{farmId}` → `{ freenet_host: { enabled, changedAt } }` ([`NAMING.md`](NAMING.md) §5; `plugins/freenet_host/src/freenetHostEnable.ts`). For a cloud farm (**hybrid**, since 2026-09-11) it lives on the Firestore farm doc — `farms/{farmId}.networkPacks.freenet_host` → `{ enabled, mistFarmId, changedAt, changedBy }` ([`NAMING.md`](NAMING.md) §8; resolver `shared/farm/networkPacks.ts`; read through `AuthContext.farmNetworkPacks`, which rides the farm-doc listener the context already had). Owner/admin write it, members read it; the FarmSeed is never on it.
- **Default.** A Freenet-native farm with no record is **enabled** — the operator chose Freenet on the start screen; the flag exists so they can switch the node *off* for a farm without leaving it.
- **Hybrid rule (2026-09-11).** Enabling on a cloud farm mints a FarmCode (shown once, never again), seals its seed on *this device* tagged with the cloud farm id (`pufam.mist.sessionMeta.v1.cloudFarmId`), and writes the farm doc — `plugins/freenet_host/src/freenetHostCloud.ts` + `FreenetHybridEnable.tsx`. Disabling flips `enabled: false` and keeps `mistFarmId`, so the same FarmCode turns it back on at the same address. A member device with no seed sees *Freenet mirror is on for this farm — enter the FarmCode to take part*. The enable copy states Hole 4 plainly: anyone holding the FarmCode reads the whole mirror regardless of cloud role, and revoking a ticket takes no copy back. `pufam.farmStoreBackend` stays `firebase` on a member device — the operator is still a cloud login that happens to hold a seed.
- **Node per device.** One node, however many farms. The reconciler (`freenetHostReconcile.ts`, mounted by `useFreenetHostReconciler` from the `farmSession` surface) computes `want` through `freenetHostWant.ts` — Freenet-native farm or mirror device: `farm open ∧ local flag ∧ capability = 'electron'`; hybrid member: `farm open ∧ farm-doc enabled ∧ seed on this device for this cloud farm ∧ capability = 'electron'`; plain cloud farm: never — and moves the node toward it, debounced (1.5 s) so switching between two enabled farms never restarts it.
- **Reconciliation rule.** Bring-up is node-then-peer (`puf-freenet:start`, then the pack transport's `peerStart` — on the host path that is the host's own wire; on the relay it is `POST /api/mist/freenet/peer/start`). The reconciler **only stops a node it started**: an `attached` node, one the operator started from the Sync card's Connect or the workshop Start button, or one the desktop mist preference brought up at boot is ridden, never killed. Failures are logged, never thrown at the tree.
- **What it does not do.** Per-save mirroring or an auto-sync rung for a hybrid farm — the mirror moves on Send only ([`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) §3.4). (Slice A left publish and fetch on Express and the in-process `FreenetPeer`; slice B moved them onto the host transport on Electron — §4 *Data path*. Express keeps them as the LAN relay for tablets behind a hub.)

## 6. "Not available on this device"

When `getFreenetHostCapability()` is `null`, the `pluginTile` shows the badge **Not available on this device** and one sentence saying why (web: no node, open the farm in the desktop app; APK: reads through a paired hub until the Android host). No toggle, no Open Sync. The login option is hidden on the same condition. A capable shell holding a *cloud* farm shows the hybrid enable flow (§5) — *Off for this farm* with **Enable the Freenet mirror** for admins, *Mirror on — key on this device* once enabled here, *Mirror on — enter FarmCode* on a member device without the seed. A device that joined a cloud farm over Freenet shows **Mirror of a cloud farm** and a one-line note that editing means an invite PIN.

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
`tests/freenetTransportSelect.test.ts` (selection rule, host transport, hash check), `desktop/freenetIpcInput.test.ts` (IPC caps and shapes), `tests/freenetHostWire.test.ts` (plaintext refused through the host, slot ops through the wire) — the slice B data path.  
`tests/networkPacksFarmDoc.test.ts` (farm-doc patch builder, rules text), `tests/freenetHostWant.test.ts` (`want` with the hybrid inputs), `tests/farmPipes.test.ts` (three states), `tests/hotAdapterHybrid.test.ts` (hybrid envelope → HotState round trip, measured size), `tests/joinOutcome.test.ts` (mirror-join vs member-join), `tests/autoSyncLadder.test.ts` § hybrid — slice C.
