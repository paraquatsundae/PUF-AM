# PUF-AM desktop installer + Freenet as an in-app plugin

**Status:** Phase 3 done on Fedora — an AppImage installs and launches with Freenet reporting `source: bundled` (~2026-08-04). Windows config is complete and `win-unpacked/` builds here, but the NSIS/portable step needs a Windows host. Next: Phase 4 (retire the desktop sidecar path). Not shipped.
**Product:** PUF-AM (Ag Manager) · **Scope:** Fedora + Windows desktop installers where the Freenet client runs *inside* PUF-AM.
**Experimental:** the mist/Freenet storage path stays experimental. **Firebase + invite PIN remains the shipping cloud path** and is unaffected by this plan.

Related: [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) (mist crypto/contracts) · [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) (current two-laptop workshop flow this replaces) · [`NAMING.md`](NAMING.md) §1–2 (product + build identifiers) · [`units/puf-freenet-host/README.md`](../units/puf-freenet-host/README.md) (plugin unit) · [`desktop/README.md`](../desktop/README.md) (shell).

---

## 1. Problem

Today a farmer who wants mist/Freenet must run **three things**: `freenet network`, `npm run dev` (Express sidecar on `:3000`), and a browser pointed at `https://am.pufworks.farm`. The browser then cross-origins its Freenet calls back to `127.0.0.1:3000` (`getMistFreenetApiBaseUrl()` in `src/lib/apiBase.ts`). That is a workshop scaffold, not a product.

**End state:** one downloadable installer per platform. The operator launches **PUF-AM**, and Freenet is already running inside it — no second app, no terminal, no `npm`, no sidecar URL.

---

## 2. Frozen decisions

| # | Decision | Value |
|---|----------|-------|
| 1 | **Desktop shell** | **Electron** + `electron-builder` (see §3) |
| 2 | **v1 plugin model** | **Managed child process** of a bundled `freenet` binary, owned by PUF-AM. No separate UI, no separate installer, no user-visible daemon (see §4) |
| 3 | **Plugin home** | New unit **`units/puf-freenet-host/`** — lifecycle + wire only; mist crypto stays in `units/mist-freenet/` (see §5) |
| 4 | **Renderer ↔ Node** | In-main Express bound to **loopback + ephemeral port**; renderer is served same-origin from it (see §6) |
| 5 | **Desktop sidecar requirement** | **Eliminated.** Desktop never calls `am.pufworks.farm` for Freenet, and never needs `npm run dev` |
| 6 | **Network mode** | **Opennet** (`freenet network`). No darknet friend config, no first-run Freenet wizard — silent defaults |
| 7 | **Cloud default** | Firebase stays the default backend. Mist/Freenet stays behind `VITE_MIST_EXPERIMENTAL` + the mist backend toggle |
| 8 | **Android APK** | **Out of scope this phase.** Capacitor build must keep working unchanged (see §12) |
| 9 | **Fork target** | `units/puf-freenet-host/` is the future **PUF-FN** repo. Its public surface is the fork boundary |

---

## 3. Shell choice — Electron (frozen)

### The comparison that actually matters for this repo

| Concern | Electron | Tauri |
|---------|----------|-------|
| Freenet peer host (`units/mist-freenet/src/node.ts`) | Runs **as-is** in main — `node:net`, `node:fs`, `node:child_process` all native | Needs a Node runtime shipped as a Tauri sidecar, or a Rust rewrite of the peer |
| Express API (`server/createApiApp.ts`, 40+ routes) | Runs **as-is** in main | Rewrite in Rust/axum, or ship Node sidecar |
| `@freenetorg/freenet-stdlib` (flatbuffers GET) | npm dep, works | npm dep — only usable if Node is present, i.e. sidecar |
| `bonjour-service` mDNS hub (`server/mdnsHub.ts`) | Works | Rust mDNS rewrite |
| Bundle size | ~150 MB + ~93 MB Freenet binaries | ~10 MB + Node sidecar (~50 MB) + ~93 MB Freenet binaries |
| Fedora `.rpm` + Windows NSIS from one config | `electron-builder` — yes | `tauri-bundler` — yes |
| Rust in the build chain | Not required | Required on both build hosts |

### Rationale

The entire Node-side surface this product needs — Freenet peer, transport, Express routes, mDNS, `fdev` spawning — **already exists in TypeScript running on Node**. Electron makes that the main process for free.

Tauri's win is bundle size, and it evaporates here: to reuse any of the existing Node code Tauri must ship a Node sidecar binary. That is *the same shape as the sidecar pattern the user rejected*, just relocated into the installer, and it costs a Rust toolchain on both build hosts plus native-module packaging for a Node runtime we would no longer control. Tauri only becomes the right answer once the Freenet host and mist store are Rust/WASM — which is the **PUF-FN** endgame (§4.3), not v1.

**What we accept by choosing Electron:** ~150 MB baseline install, Chromium patch cadence, and a heavier memory floor (~200 MB idle). All acceptable for a shed/office laptop. Revisit only if PUF-AM desktop ever needs to run on constrained cab hardware.

---

## 4. What "plugin inside PUF-AM" means in v1

### 4.1 Honest statement of the constraint

Freenet 0.2.119 (the pinned version — see §8.4) is a **Rust binary** (`freenet`, 55 MB) with a local WebSocket API on `:7509`. There is no embeddable Freenet library or browser/WASM peer we can link into a Node process today. Additionally, PUT on 0.2.x still requires the **`fdev`** CLI (37 MB) — the flatbuffers PUT path in `@freenetorg/freenet-stdlib` hangs against that node version (documented in `units/mist-freenet/src/freenet02-fdev-put.ts`).

So "plugin" in v1 means **ownership, not linkage**.

### 4.2 v1 — PUF Freenet Host plugin (managed child process)

`units/puf-freenet-host/` owns the **entire lifecycle** of a bundled Freenet node:

- **Bundled** — `freenet` (+ `fdev`) ship inside the PUF-AM installer as app resources. The operator never downloads, installs, or configures Freenet.
- **Started by PUF-AM** — spawned on app launch when mist is enabled; stopped on app quit. No systemd unit, no `freenet service install`, no tray icon of its own, no separate window.
- **App-owned state** — `--config-dir` / `--data-dir` / `--log-dir` point under PUF-AM's `userData` (§7). The node is invisible in the operator's home directory layout.
- **No API surface of its own** — nothing talks to `:7509` except PUF-AM. The port binds loopback (`--ws-api-address 127.0.0.1`).
- **Attach, don't fight** — if a Freenet node is already listening (a workshop `freenet network`, or another PUF unit that got there first), the host **attaches** to it instead of spawning a second node, and will not kill it on quit. One node per machine, shared by PUF units.

From the operator's point of view there is exactly one app, one icon, one process tree. That satisfies the requirement. It is not a linked library, and this doc does not pretend otherwise.

### 4.3 Path to true embedding (PUF-FN, later)

| Step | What changes | Blocked on |
|------|--------------|------------|
| Drop `fdev` | Native PUT encoding over the existing WS connection → one child process instead of two | Upstream flatbuffers PUT fix, or reimplementing native PUT frames |
| Rust host, in-proc | Link `freenet-core` as a Rust library behind a NAPI/`neon` addon or Tauri command | Upstream exposing an embeddable peer API |
| WASM peer | Freenet peer compiled to WASM inside the renderer/worker | Not on the upstream roadmap for 0.2; transport/NAT make it implausible near-term |

Because every one of those swaps sits **behind the `FreenetHostPlugin` interface** (§5), none of them touch `mist-freenet`, the Express routes, or the UI. That is the whole point of the separate unit.

---

## 5. Plugin interface — `units/puf-freenet-host/`

### 5.1 Why a new unit, not more `mist-freenet`

`mist-freenet` is **storage semantics**: `MistStore`, AEAD sealing, FarmSeed HKDF, pack-contract addressing, disk cache, outbox. Process supervision of a native binary is an unrelated concern, and it is the concern that forks into PUF-FN. Mixing them would drag mist crypto into every future consumer (PUF-mobile hub, PUFworks units) that only wants "start a node, put ciphertext".

Dependency direction is **one-way and inverted**: `puf-freenet-host` has **no import of `mist-freenet`**. The consumer injects a wire client. PUF-AM's adapter — the only glue file — wraps `Freenet02WsTransport`.

```
units/puf-freenet-host/   ← lifecycle + wire contract (future PUF-FN)     no mist imports
units/mist-freenet/       ← MistStore, crypto, transport, pack-contract   no host imports
server/ or desktop/       ← the ~20-line adapter that marries them
```

### 5.2 Interface (frozen for v1)

```ts
export interface FreenetHostPlugin {
  readonly id: string;                                 // 'puf-freenet-host'
  start(): Promise<FreenetHostStatus>;
  stop(): Promise<FreenetHostStatus>;
  status(): Promise<FreenetHostStatus>;
  putCiphertext(bytes: Uint8Array, options?: FreenetPutCiphertextOptions): Promise<FreenetPutCiphertextResult>;
  getCiphertext(uri: string): Promise<Uint8Array | null>;
  on(listener: (event: FreenetHostEvent) => void): () => void;   // returns unsubscribe
}

export type FreenetHostMode = 'stopped' | 'starting' | 'managed' | 'attached' | 'failed';
```

`FreenetHostStatus` carries `mode`, `reachable`, `wsUrl`, `pid`, resolved `binary` (`{ path, source, version }`), the three dirs, `updateRequired`, and `lastError`. Events are `state` / `log` / `exit` / `update-required`.

`putCiphertext` / `getCiphertext` are **ciphertext-only by contract** — the host never sees plaintext and never holds farm keys. Sealing stays in `mist-freenet` (`assertCiphertextForFreenet` still guards `FreenetMistStore.put()`). If no wire client is injected, both throw `FreenetWireUnavailableError` rather than silently no-op.

Full type list: [`units/puf-freenet-host/src/types.ts`](../units/puf-freenet-host/src/types.ts).

### 5.3 Binary resolution order

| # | Source | Where |
|---|--------|-------|
| 1 | explicit `binaryPath` option | caller |
| 2 | `PUF_FREENET_BIN` / `PUF_FDEV_BIN` | env (workshop override) |
| 3 | `binarySearchPaths` | Electron passes `${process.resourcesPath}/freenet` |
| 4 | repo vendor dir | `vendor/freenet/<os>-<arch>/` (dev, gitignored) — requires the `repoRoot` option |
| 5 | `PATH` | picks up today's `~/.local/bin/freenet` |

Reporting the `source` in status is deliberate: the workshop needs to know whether it is testing the bundled binary or a stray PATH one.

`<os>` is electron-builder's `${os}` (`linux` / `win` / `mac`), so `vendor/` and `extraResources` share one layout. That directory name is produced by `freenetVendorDir()` in the host unit and consumed by `scripts/fetch-freenet-binaries.mjs` via the manifest's `vendorDirTemplate`; `tests/freenetVendorManifest.test.ts` asserts the two agree, because the failure mode of a disagreement is not an error — it is a populated `vendor/` silently losing to `PATH`.

### 5.4 Lifecycle rules

| Situation | Behaviour |
|-----------|-----------|
| Port already reachable + `attachIfRunning` | `mode: 'attached'`; **never** spawn a second node |
| Spawn succeeds, port reachable within timeout | `mode: 'managed'` |
| Spawn succeeds, port never opens | `mode: 'failed'` + `lastError`; app stays usable on Firebase/local |
| Unexpected exit, `autoRestart` | Restart with backoff, capped attempts, then `failed` |
| **Exit code 42** | Freenet is requesting an update. `updateRequired: true`, emit `update-required`, **do not auto-restart and do not auto-update** — the operator (or a later opt-in flow) runs `freenet update`. Bundled binaries are pinned; silently clobbering them would break the pinned pack-contract code hash |
| `stop()` while `attached` | Detach only. Killing a node PUF-AM did not start would break other PUF units and the workshop |
| App quit | `stop()` on managed node with SIGTERM → grace period → SIGKILL |

### 5.5 Env contract handed to `mist-freenet`

The host publishes the node's coordinates; the mist transport consumes them unchanged (no code change in `mist-freenet`):

| Variable | Set by host to |
|----------|----------------|
| `FREENET_TRANSPORT` | `ws02` |
| `FREENET_WS_URL` | `ws://127.0.0.1:<port>/v1/contract/command` |
| `FREENET_WS_PORT` | `<port>` (consumed by `fdev --port`) |
| `FDEV_BIN` | resolved bundled `fdev` path |
| `FREENET_PACK_WASM` | bundled `pack-contract.wasm` path |
| `MIST_FREENET_ROOT` | `<userData>/mist-freenet` |

---

## 6. Desktop architecture — and how the sidecar dies

### 6.1 Process picture

```
┌─ PUF-AM (Electron) ─────────────────────────────────────────────┐
│                                                                 │
│  main process (Node)                                            │
│    ├── FreenetHostPlugin ──spawn──► freenet (child, loopback WS)│
│    │        └── fdev (transient, per PUT)                       │
│    ├── FreenetPeer (mist-freenet)  ── ws02 ──► :<port>          │
│    ├── Express createApiApp()  →  127.0.0.1:<ephemeral>         │
│    └── serves dist/ from that same port                         │
│                                                                 │
│  renderer (BrowserWindow, contextIsolation on)                   │
│    ├── loads http://127.0.0.1:<ephemeral>   ← same-origin       │
│    ├── /api/mist/freenet/*  → in-app Express (loopback)         │
│    ├── /api/auth/*, /api/weather/*  → https://am.pufworks.farm  │
│    └── Firebase Auth / Firestore → direct, unchanged            │
└─────────────────────────────────────────────────────────────────┘
```

Serving the built bundle from the same loopback port the API listens on means `getApiBaseUrl()` returns `''` (same-origin) with **zero client changes**, no CORS, and no CSP special-casing. The whole `isProductionAppHost()` → `http://127.0.0.1:3000` branch simply never fires on desktop.

### 6.2 Route split on desktop

Some routes must stay in the cloud because they need server secrets the operator will never have.

| Route family | Desktop target | Why |
|--------------|----------------|-----|
| `/api/mist/freenet/*` | **in-app** (loopback) | The Freenet node is on this machine |
| `/api/sync/*`, `/api/presence/*`, `/api/highlights/*` | **in-app** | Desktop *is* the LAN hub (mDNS + `.pufom` sync) |
| `/api/auth/*` (invite PIN, members, farm create) | **cloud** | Needs a Firebase Admin service account — never ships to an operator machine |
| `/api/weather/*` (DPIRD, chill, blight) | **cloud** | Needs `DPIRD_API_KEY`, a server-only secret |

Implementation (landed in Phase 1): the preload injects `window.pufamDesktop = { cloudApiBase, freenetApiBase, ... }` ([`src/lib/desktopBridge.ts`](../src/lib/desktopBridge.ts)); `src/lib/apiBase.ts` routes **by path prefix** — `getApiBaseUrl()` returns `''` so everything is same-origin, and `apiUrl()` redirects only `/api/auth/*` and `/api/weather/*` to the cloud. Routing per-path rather than per-base matters: a single cloud base would drag `/api/sync/*` off the machine that *is* the hub. The desktop branch also outranks the LAN-hub picker and `VITE_API_BASE_URL`, which both name *other* machines.

This is the *inverse* of today's hack: instead of "browse the cloud, sidecar for Freenet", it becomes "run locally, cloud only for cloud-only secrets".

The config rides on a command-line flag ([`desktop/desktopConfig.ts`](../desktop/desktopConfig.ts)), not IPC, so `apiBase.ts` can read it synchronously on first paint — before any fetch could target the wrong origin. A missing or corrupt flag falls back to same-origin everywhere, because a local 404 beats silently posting farm data somewhere unintended.

`server/firebaseAdmin.ts` resolves `secrets/` and `firebase-applet-config.json` from `process.cwd()`, which is meaningless in a packaged app — another reason `/api/auth/*` must not be served locally. Desktop builds must **not** bundle `secrets/`.

### 6.3 Loopback exposure — honest note

Binding an HTTP API to `127.0.0.1` means any local process can reach it. That is **not a regression**: today's `npm run dev` binds `0.0.0.0:3000` (LAN-reachable), so loopback-only plus an ephemeral port is strictly better. Phase 4 hardening: per-launch bearer token minted in main, injected via preload, required by a guard middleware — and/or move Freenet calls to `contextBridge` IPC and stop exposing HTTP entirely.

---

## 7. Bundle layout and data directories

### 7.1 Shipped resources

```
<install root>/
  PUF-AM(.exe)                      Electron shell
  resources/
    app.asar                        renderer bundle + main + server/ + units/
    freenet/
      freenet(.exe)                 pinned Freenet core (0.2.119)
      fdev(.exe)                    PUT path until native PUT lands
      LICENSE.md                    upstream AGPL-3.0 text
    contracts/
      pack-contract.wasm            code hash 5Piu7V1PjjcPVnTvUbyMdDiyvwoBprBPZ4GFUHfabyzW
```

Phase 3 confirmed this layout in both the Linux and Windows outputs. `app.asar` is 8.9 MB: the Vite bundle, the esbuild'd main/preload, and the ~80 npm packages the main process actually resolves (§8.2) — not `server/`, `units/`, or `shared/` sources, which are already inlined and which Electron could not execute anyway.

`pack-contract.wasm` moves out of `app.asar` into `resources/contracts/` because `fdev --code` needs a **real filesystem path** — asar-packed files are not directly readable by a child process. Same reason the binaries live in `extraResources`. The bundled WASM's `fdev inspect` code hash is pinned in `units/mist-freenet/src/freenet02-pack.ts`; **bundled WASM and that constant must be verified together**, or every published URI silently changes.

Phase 2 landed that verification as `npm run desktop:verify:pack` ([`scripts/verify-pack-contract.mjs`](../scripts/verify-pack-contract.mjs)), split by what each half needs:

| Check | Needs | On mismatch |
|-------|-------|-------------|
| SHA-256 of the WASM vs `scripts/freenet-binaries.json` | nothing | fail |
| `fdev inspect <wasm> code` vs the same manifest | a resolvable `fdev` | fail |

With no `fdev` present the second check is skipped with a warning (`--require-fdev` makes it fatal — that is the Phase 3 packaging gate). A third guard is hermetic: `tests/freenetVendorManifest.test.ts` asserts the manifest's `codeHashB58` still equals `PACK_CONTRACT_CODE_HASH_B58` and that the committed WASM still matches its pinned digest, so a drift fails `npm test` with no binaries installed at all.

### 7.2 Per-OS data locations

| Path | Fedora | Windows |
|------|--------|---------|
| Electron `userData` | `~/.config/PUF-AM/` | `%APPDATA%\PUF-AM\` |
| Freenet config | `<userData>/freenet/config/` | same shape |
| Freenet data (contracts, peer keys) | `<userData>/freenet/data/` | same |
| Freenet logs | `<userData>/freenet/logs/` | same |
| Mist cache / index / outbox | `<userData>/mist-freenet/` | same |

**App-owned dirs deliberately do not reuse `~/.local/share/freenet`.** Consequence: on first launch the app-owned node is a **new Opennet peer** and needs the usual 5–15 min bootstrap before GETs resolve (see [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) § Opennet gaps). Mitigations: start the host at app launch rather than at first publish, surface a "connecting to Freenet" state instead of an error, and keep the data dir across launches so identity is stable after run one. Workshop machines can point at the existing node via `PUF_FREENET_BIN` + attach mode.

---

## 8. Packaging

### 8.1 Targets

| Platform | Targets | Status / notes |
|----------|---------|----------------|
| Fedora | **`AppImage`** (primary in practice) + **`rpm`** | AppImage **built and launched** on Fedora 44. `rpm` needs two host packages this box lacks — see below |
| Windows | **`nsis`** installer + **`portable`** | `win-unpacked/` builds fine on Fedora; the installer step needs wine, so run it **on Windows** |
| Debian/Ubuntu | `deb` (optional) | Free from the same config; not configured, not a target platform |

**AppImage ended up ahead of `rpm`**, inverting the original ordering. electron-builder builds `rpm` through a bundled `fpm`, whose Ruby links `libcrypt.so.1`; Fedora 44 ships `libcrypt.so.2` only. So the rpm leg needs:

```bash
sudo dnf install rpm-build libxcrypt-compat   # rpmbuild + the legacy libcrypt fpm links against
npm run desktop:dist:linux                    # AppImage + rpm
npm run desktop:dist:linux:appimage           # AppImage only — no extra host packages
```

That is also why `desktop:dist:linux:appimage` exists: without it, a machine missing those two packages fails the whole build *after* the AppImage has already been written, which reads like the AppImage failed too.

Cross-platform builds are **not** attempted for the final artifacts. Fedora artifacts build on Fedora, Windows installers on the `C:\Projects` Windows box.

### 8.2 `electron-builder` config

Lives in [`electron-builder.yml`](../electron-builder.yml) (YAML so the non-obvious entries can carry their reasons). `productName`, `main`, and `desktopName` stay in `package.json` because Electron itself reads them. Identifiers are frozen in [`NAMING.md`](NAMING.md) §2.

What is worth knowing beyond the obvious:

| Setting | Why it is what it is |
|---------|----------------------|
| `directories.buildResources: desktop/resources` | The default is `build/`, which this repo gitignores — the icon would not survive a fresh clone |
| `files` allowlists ~80 `node_modules` | electron-builder ships **every** production dependency. The main bundle keeps npm packages external (§8.3), so it needs its own runtime closure and nothing else; the renderer's React / icon / PDF packages are already inside `dist/`. This is the difference between a 164 MB AppImage and a ~500 MB one |
| `npmRebuild: false` | Nothing native reaches the app now that `better-sqlite3` is gone (§8.3). Adding a native dependency means turning this back on |
| `linux.syncDesktopName` + `desktopName` in `package.json` | Electron takes its Wayland/X11 `app_id` from `desktopName`; without the two agreeing, the running window shows up as a second iconless entry in the shell |
| `rpm.packageName: puf-am` | Otherwise the package is named after npm's `walnut-farm-manager` — the clone folder, not the product |
| `nsis.deleteAppDataOnUninstall: false` | `%APPDATA%\PUF-AM` holds the Freenet identity and mist cache; an uninstall must not take the operator's farm data with it |
| `publish: null` | Workshop builds, no auto-updater (AGENTS.md rule 9) |

The `node_modules` allowlist is the one part that can rot silently, so it is generated rather than curated: [`scripts/verify-desktop-deps.mjs`](../scripts/verify-desktop-deps.mjs) (`npm run desktop:verify:deps`) reads the *built* bundle's external `require()`/`import()` specifiers, walks their dependency closure, and fails the build if the config disagrees — `--print` emits the block to paste. It also fails if the bundle reaches for a `devDependency`, because electron-builder ships production dependencies only and that mistake surfaces as `MODULE_NOT_FOUND` on an operator's machine rather than at build time.

### 8.3 Native and heavy dependencies

| Dependency | Action |
|------------|--------|
| `better-sqlite3` | **Dropped** in Phase 3 (`npm uninstall`). It was unused, and keeping it would force a native rebuild against Electron's ABI for nothing |
| `firebase-admin` | Excluded — `/api/auth/*` is cloud-only (§6.2). It is a `devDependency`, so electron-builder never ships it; Phase 3 made [`server/firebaseAdmin.ts`](../server/firebaseAdmin.ts) load it **on first use** instead of importing it, because a static import made the packaged main process die at boot rather than degrade. `isAdminSdkReady()` already returns `false` for callers |
| `bonjour-service` | Keep; pure JS, powers the LAN hub |
| `@freenetorg/freenet-stdlib` | Keep; GET path |
| `vite`, `tsx`, `firebase-tools` | Dev only — must not reach `files` |

Main-process TypeScript needs a build step (Electron cannot execute `.ts`, and the repo uses `.ts` extensions in import specifiers). Phase 1 landed [`scripts/build-desktop.mjs`](../scripts/build-desktop.mjs): esbuild bundles `desktop/main.ts` + `desktop/preload.ts` → `desktop/build/*.cjs`, pulling in `desktop/`, `server/`, `units/`, and `shared/`.

**npm packages stay external** (`packages: 'external'`). Bundling them in would mean flattening `firebase-admin`'s dynamic requires and grpc's native bindings for no benefit — TypeScript is the only thing Electron genuinely cannot load. Electron resolves the rest from `node_modules`, and electron-builder ships production deps into the asar in Phase 3.

One wrinkle worth knowing: `import.meta` is empty in a CJS bundle, and `units/mist-freenet/src/freenet02-pack.ts` reads `import.meta.url` at module load to locate its pack contract. The build defines a `__filename`-based shim so the bundle does not throw on import, **and** `desktop/main.ts` sets `FREENET_PACK_WASM` explicitly — the shim resolves to the bundle, not the asset, so it alone is not enough.

### 8.4 Binary procurement (settled in Phase 2)

**Pinned to `v0.2.119`** in [`scripts/freenet-binaries.json`](../scripts/freenet-binaries.json) — the single source of truth for version, asset names, and checksums. Both platforms come from the *same release tag*: mixing versions is not acceptable, because the pack-contract code hash and the `fdev` PUT path are both version-sensitive.

| Platform | Assets | Status |
|----------|--------|--------|
| `linux-x64` | `freenet-x86_64-unknown-linux-musl.tar.gz`, `fdev-x86_64-unknown-linux-musl.tar.gz` | **verified** — fetched, checksum-matched, spawned a `managed` node (§14 Phase 2) |
| `win-x64` | `freenet-x86_64-pc-windows-msvc.zip`, `fdev-x86_64-pc-windows-msvc.zip` | **pinned, not yet launched** — staged and checksum-verified by cross-fetch from Fedora; running it is Phase 3 on the Windows box |

Upstream publishes a `SHA256SUMS.txt` per release, so the pins are transcribed rather than invented. musl builds are chosen for Linux deliberately: statically linked, so they do not have to match a host glibc across Fedora versions.

**Procurement is no longer a blocker on either leg.** The earlier "Windows not obtained" note was wrong about availability — `freenet-x86_64-pc-windows-msvc.zip` has shipped in every recent release. What remains open is *execution* on Windows, not acquisition.

**License — cleared for redistribution.** `freenet-core` is **AGPL-3.0**, and its `LICENSE.md` says so explicitly:

> Simply bundling or distributing the unmodified `freenet-core` binary alongside your app does **not** trigger the AGPL's copyleft requirements for your own code.

PUF-AM's relationship to the node is exactly the case that text carves out — a loopback WebSocket, no linkage, no modification. So PUF-AM's own licensing is unaffected. The upstream `LICENSE.md` is fetched into the vendor dir and ships beside the binaries in `resources/freenet/`.

**`vendor/` stays gitignored** (~93 MB); the manifest, the fetch script, and [`vendor/README.md`](../vendor/README.md) are what get committed.

```bash
npm run desktop:vendor          # host platform
npm run desktop:vendor:linux    # linux-x64
npm run desktop:vendor:win      # win-x64 (cross-fetch is fine — the files are only staged)
npm run desktop:vendor:verify   # no network; re-check what is on disk
```

Every download is checksummed **twice** — archive, then extracted binary — and a mismatch aborts. Upstream tarballs store mode `0644`, so the script also marks the binaries executable; skipping that is how "bundled binary present but unusable" looks. For an air-gapped or CI build, `PUF_FREENET_ASSET_DIR` points at a directory of pre-downloaded archives and nothing is fetched, with the same checksum gates.

---

## 9. First run and operator experience

**No Freenet wizard.** Freenet uses Opennet with silent defaults; the only decision a farmer makes is the existing mist opt-in.

| Launch | What the operator sees |
|--------|------------------------|
| Firebase user (default) | Normal PUF-AM. Freenet host never starts. Zero Freenet UI |
| Mist enabled, run 1 | Existing FarmCode first-run. Freenet starts silently in the background; status card shows *connecting* → *connected*; publishes may need the documented bootstrap wait |
| Mist enabled, run 2+ | Node reuses its data dir; connects in seconds |
| Freenet binary missing/corrupt | Status shows `failed` with the resolved path. App fully usable on Firebase or local-only; no modal, no crash |

The existing Settings → **Mist workshop** card becomes the single Freenet surface: mode (`managed`/`attached`), reachability, binary source + version, data dir, and publish/pull actions. No second window, no tray icon, no separate installer entry.

---

## 10. What does not change

- **Firebase Auth + invite PIN stays the shipping path.** Desktop routes those calls to `am.pufworks.farm`.
- **Mist stays experimental**, gated by `VITE_MIST_EXPERIMENTAL` and the `pufam.farmStoreBackend` toggle.
- **Encrypt-before-upload is unchanged** — the host handles ciphertext only.
- **`mist-freenet` public API is unchanged** — no rewrite of `FreenetPeer`, `FreenetMistStore`, or the routes.
- **Cloud Run keeps `MIST_FREENET_DISABLED=1`.** The web path keeps working exactly as today, including the sidecar branch for anyone still using it. Only *desktop* stops needing a sidecar.
- **Capacitor Android build is untouched** (§12).

---

## 11. Out of scope this phase

Android APK changes · code signing / notarization (Windows EV cert, Linux GPG) · auto-updater (AGENTS.md rule 9: no public distribution pipeline) · WASM/library Freenet embed (§4.3) · mutable Freenet contracts / deterministic URIs (Option B in [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md)) · Reticulum unit · replacing loopback HTTP with pure IPC (Phase 4 hardening candidate).

**Future Android note:** the phone will not run a Freenet peer. It either syncs to a desktop PUF-AM acting as **LAN hub** (the `/api/sync/*` + mDNS path that already exists), or waits for a Freenet Android peer upstream. Not this phase.

---

## 12. Not breaking Android

| Guard | Why it holds |
|-------|--------------|
| `capacitor.config.ts` untouched | Desktop adds no Capacitor plugin |
| `vite.config.ts` untouched | `VITE_CAPACITOR=1` base-path logic unchanged; desktop uses the standard web build |
| `desktop/` excluded from root `tsconfig.json` | `npm run lint` stays green before `electron` is installed; `desktop/tsconfig.json` covers it afterwards |
| `units/puf-freenet-host/` is Node-only | Never imported by renderer code, so it cannot leak into the APK bundle |
| `electron` / `electron-builder` land in `devDependencies` | Not in the Capacitor runtime graph |

Regression check each phase: `npm run lint && npm test && npm run build`, plus `npm run build:android` before any phase is called done.

---

## 13. Migration from the current workshop flow

| Today | After Phase 4 |
|-------|---------------|
| `freenet network` in terminal 1 | Started by PUF-AM |
| `MIST_FREENET=1 npm run dev` in terminal 2 | Gone — the app *is* the server |
| Browse `https://am.pufworks.farm` | Launch PUF-AM |
| Freenet calls cross-origin to `127.0.0.1:3000` | Same-origin loopback, ephemeral port |
| `~/.local/share/freenet` (user's node) | `<userData>/freenet/data` (app-owned), or attach to the user's node |
| Join ticket copy/paste between laptops | **Unchanged** — still Option A until mutable contracts land |

The workshop flow keeps working throughout: `npm run dev` + external `freenet network` is unaffected, and the host's attach mode plus `PUF_FREENET_BIN` mean a developer's existing node is still usable.

---

## 14. Phased build order

### Phase 0 — plan + scaffold (**done**, ~2026-08-03)

Landed:

- This document.
- [`units/puf-freenet-host/`](../units/puf-freenet-host/README.md) — frozen interface, Node implementation (spawn/attach/stop, restart backoff, exit-42 handling, binary resolution, TCP probe), 19 hermetic tests (no node or network needed).
- [`server/freenetHostWire.ts`](../server/freenetHostWire.ts) — the one glue file wrapping `Freenet02WsTransport` as a `FreenetWireClient`.
- [`desktop/`](../desktop/README.md) — `main.ts` (single-instance lock, host ownership, IPC), `preload.ts` (`window.pufamDesktop`), `localApi.ts` (loopback ephemeral-port Express + static `dist/`), `tsconfig.json`.
- Pointers in `DEVELOPER_NOTES.md`, `NAMING.md` (§1 product names, §2 desktop build ids, §3 env vars), `README.md`, `.env.example`. `vendor/` and `release/` gitignored.

**No `electron` dependency installed yet** and `desktop/` is excluded from the root `tsconfig.json`, so `npm run lint`, `npm test`, `npm run build`, and `npm run build:android` are all unaffected.

### Phase 1 — Electron shell (**done**, ~2026-08-03)

Landed:

- `electron` 43, `electron-builder` 26, `esbuild` in `devDependencies`.
- [`scripts/build-desktop.mjs`](../scripts/build-desktop.mjs) → `desktop/build/{main,preload}.cjs` (§8.3).
- Scripts: **`desktop:build`** (bundle main/preload), **`desktop:start`** (launch), **`desktop:dev`** (build web + main, then launch), **`lint:desktop`**.
- `package.json` gains `main` and **`productName: "PUF-AM"`** — the latter is what makes `userData` resolve to `~/.config/PUF-AM` instead of `~/.config/walnut-farm-manager`. Set now, before any operator has data under the wrong path.
- [`desktop/desktopConfig.ts`](../desktop/desktopConfig.ts) — one encode/decode for the main→preload flag, so the two ends cannot drift.
- [`src/lib/desktopBridge.ts`](../src/lib/desktopBridge.ts) + the `apiBase.ts` route split (§6.2).
- `main.ts`: `.env` loaded in dev only (never in a packaged app), `MIST_FREENET_ROOT` anchored under `userData` **even when the host fails to start**, external links opened in the operator's browser, SIGINT/SIGTERM → clean quit so a Ctrl-C in `desktop:dev` cannot orphan a managed node.
- `FreenetHostOptions.repoRoot` — without it, resolution step 4 (§5.3) was unreachable from the host and Phase 2's `vendor/` dir would have silently lost to `PATH`.
- Tests: 15 new (config flag codec, `apiBase` desktop routing, vendor resolution). No Freenet node or network needed.

**Verified on Fedora:** window opens and serves the built UI from `127.0.0.1:<ephemeral>`; `/api/health` and the SPA fallback answer; with a workshop node already on `:7509` the host reports **`mode: attached`** and leaves it running on quit; on a free port it reports **`mode: managed source: path`**, spawns under `~/.config/PUF-AM/freenet/{config,data,logs}`, and stops only its own node at quit.

**Still open before this phase is closed in the field:** an end-to-end Firebase login and a Hot publish/pull from inside the window (needs operator credentials and a warmed peer, not a workshop bench check).

### Phase 2 — bundle Freenet (**done**, ~2026-08-04)

Landed:

- [`scripts/freenet-binaries.json`](../scripts/freenet-binaries.json) — the pin: `v0.2.119`, asset names, archive **and** extracted-binary SHA-256 for `linux-x64` and `win-x64`, license digest, pack-contract digest + code hash (§8.4).
- [`scripts/fetch-freenet-binaries.mjs`](../scripts/fetch-freenet-binaries.mjs) → `vendor/freenet/<os>-<arch>/{freenet,fdev,LICENSE.md,VENDOR.json}`. Double checksum gate, `chmod +x` (upstream ships `0644`), idempotent re-runs, `--verify` for a network-free re-check, `PUF_FREENET_ASSET_DIR` for offline/CI. tar.gz and zip are handled in-process — no new dependency, no shelling out to `tar`.
- [`scripts/verify-pack-contract.mjs`](../scripts/verify-pack-contract.mjs) — WASM digest always, `fdev inspect` code hash when `fdev` resolves (§7.1).
- [`scripts/smoke-freenet-host.ts`](../scripts/smoke-freenet-host.ts) (`npm run desktop:smoke:host`) — starts a real node from the resolved binary on a **spare port with throwaway dirs**, asserts `mode: managed` and a non-`PATH` source, then stops. Deliberately `attachIfRunning: false`: attaching to a workshop node on `:7509` would prove nothing about which binary was resolved, and this must never touch that node.
- Scripts: `desktop:vendor`, `desktop:vendor:linux`, `desktop:vendor:win`, `desktop:vendor:verify`, `desktop:verify:pack`, `desktop:smoke:host`.
- `freenetVendorDir()` / `freenetPlatformTag()` exported from the host unit so the vendor layout has one definition, plus 11 new hermetic tests (`tests/freenetVendorManifest.test.ts`, extra cases in `units/puf-freenet-host/resolve-binary.test.ts`) covering manifest ↔ resolver agreement, vendor-beats-`PATH`, bundled-beats-vendor on Windows, and the pack-contract pin. No network, no node, no populated `vendor/`.
- `.gitignore` narrowed to `vendor/*` with `!vendor/README.md`, so the directory documents itself while the binaries stay out (§8.4).

**Verified on Fedora:** `npm run desktop:vendor:linux` fetches and verifies both binaries; `npm run desktop:smoke:host` then reports `mode: managed`, `source: vendor`, `Freenet version: 0.2.119` and stops cleanly, while the operator's own `freenet network` on `:7509` keeps running untouched. `npm run desktop:verify:pack` confirms the bundled WASM still hashes to `5Piu7V1PjjcPVnTvUbyMdDiyvwoBprBPZ4GFUHfabyzW` under the *pinned* `fdev` 0.3.281 — that is what makes the version bump safe. `npm run desktop:vendor:win` stages checksum-verified `freenet.exe` + `fdev.exe`.

The `source` reported in dev is **`vendor`**, not `bundled`: `bundled` means Electron's `resources/freenet/`, which only exists once electron-builder runs in Phase 3. The plan's original wording conflated the two. Precedence is what actually matters and it holds — a populated `vendor/` outranks `~/.local/bin/freenet`.

**Note on the pinned version:** the plan previously said 0.2.118. 0.2.119 is what upstream ships and what the workshop machine already runs, and the pack-contract code hash is unchanged across the two, so nothing published under the old node is stranded.

**Still open before this phase is closed in the field:** `freenet.exe` has never been *launched* (Phase 3, on the Windows box), and a bundled-binary publish/pull still needs a warmed peer and operator credentials — same caveat Phase 1 carries.

### Phase 3 — installers (**done on Fedora**, ~2026-08-04; Windows installer step pending a Windows host)

Landed:

- [`electron-builder.yml`](../electron-builder.yml) (§8.2) — Fedora `AppImage` + `rpm`, Windows `nsis` + `portable`, `extraResources` for the binaries and pack WASM, and the `node_modules` allowlist that keeps the AppImage at 164 MB instead of ~500 MB.
- [`scripts/verify-desktop-deps.mjs`](../scripts/verify-desktop-deps.mjs) (`npm run desktop:verify:deps`) — derives the packaged runtime closure from the built bundle and fails the build when the allowlist drifts or the bundle reaches for a `devDependency`.
- Gated scripts: **`desktop:dist`** (host platform), **`desktop:dist:linux`**, **`desktop:dist:linux:appimage`**, **`desktop:dist:win`**, plus `desktop:vendor:verify:linux` / `:win`. Every one runs `desktop:vendor:verify` for the *target* platform, `desktop:verify:pack --require-fdev`, a fresh `vite build` and main/preload bundle, then `desktop:verify:deps` — a stale `vendor/`, a drifted pack-contract hash, or a stale allowlist all stop the build before electron-builder starts.
- `server/firebaseAdmin.ts` loads the Admin SDK lazily; `better-sqlite3` dropped (§8.3); app icon committed at `desktop/resources/icon.png`.

**Verified on Fedora 44:** `npm run desktop:dist:linux:appimage` → `release/PUF-AM-0.1.0.AppImage` (164 MB). Launching it reports **`mode=managed source=bundled`** — the first time the resolver has picked `resources/freenet/` rather than `vendor/` — serves the UI and `/api/health` from `127.0.0.1:<ephemeral>`, runs `/tmp/.mount_*/resources/freenet/freenet` against `~/.config/PUF-AM/freenet/{config,data,logs}`, and on quit stops only its own node: the operator's workshop `freenet network` on `:7509` was still running afterwards. `resources/freenet/{freenet,fdev,LICENSE.md}` and `resources/contracts/pack-contract.wasm` are present in both the Linux and Windows outputs.

**Windows:** `npm run desktop:dist:win` produces a complete `release/win-unpacked/` on Fedora — asar, `freenet.exe`, `fdev.exe`, and the pack WASM all land correctly — then fails at the NSIS step with `spawn wine ENOENT`. That is the documented boundary, not a config problem: run the same command on the `C:\Projects` Windows box (§8.1). `freenet.exe` has still **never been launched**, so `win-x64` stays `pinned` in the manifest until it spawns a node there.

**Still open before this phase is closed in the field:**

- Windows `nsis` + `portable` artifacts, and the first `freenet.exe` launch.
- The `rpm` leg needs `sudo dnf install rpm-build libxcrypt-compat` (§8.1) — untested on this box.
- Install on a machine with **no Node, no npm, no Freenet**, and complete a Freenet publish there. That still needs operator credentials and a warmed peer, the same caveat Phases 1 and 2 carry.
- A packaged build has no way to turn mist on: `MIST_FREENET` comes from the environment, and a packaged app deliberately ignores `.env`. The smoke above passed it on the command line. Wiring the existing mist opt-in through to the host is UI work that belongs with the Settings surface (§9), not with packaging.

### Phase 4 — retire the desktop sidecar path (next)

Desktop never resolves `am.pufworks.farm` for `/api/mist/freenet/*` · loopback guard (bearer token and/or IPC) · two-machine A→B join-ticket smoke using **installers only** · update [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) to mark the sidecar section *workshop/web only*.

**Done when:** the two-Fedora pass criteria are met with zero terminals open.

### Phase 5 — PUF-FN extraction (later, optional)

Move `units/puf-freenet-host/` to its own repo, publish as a private package, consume from PUF-AM and one other PUF unit. Interface must not need to change — if it does, Phase 0–4 got the boundary wrong.

---

## 15. Risks and open questions

| Risk | Mitigation / status |
|------|---------------------|
| Windows `freenet.exe` availability at pinned version | **Closed** — `freenet-x86_64-pc-windows-msvc.zip` + `fdev` zip ship in `v0.2.119`; both pinned, staged, and packed into `win-unpacked/` (§8.4). Never *launched*: still open, now on the Windows box |
| Installer size ~250 MB with binaries | **Better than feared** — 164 MB AppImage, because the `files` allowlist keeps the renderer's production dependencies out of the asar (§8.2). Would have been ~500 MB without it |
| Fresh app-owned peer identity slows first publish | Documented warm-up; start host at launch; consider attach-to-existing as a workshop default |
| Exit code 42 update loop | Host never auto-updates; surfaces `updateRequired` and stops (§5.4) |
| Bundled WASM drifts from pinned code hash | **Closed** — `npm run desktop:verify:pack` plus a hermetic test on the pin (§7.1). Publishing with a mismatched hash silently changes every URI, so this fails the build rather than warning |
| Redistributing an AGPL binary | **Closed** — upstream `LICENSE.md` explicitly exempts bundling the unmodified binary alongside an app that talks to it over a network protocol; the text ships beside the binaries (§8.4) |
| Loopback API reachable by local processes | Ephemeral port + loopback bind now; token/IPC in Phase 4 (§6.3) |
| `process.cwd()` assumptions in `server/*` | Audited in Phase 1. `firebaseAdmin.ts` is the only other reader and `/api/auth/*` is cloud-only. `getMistFreenetRootDir()` fell back to `cwd()/tmp`, so `main.ts` now sets `MIST_FREENET_ROOT` unconditionally at boot |
| Two PUF apps racing for `:7509` | Attach mode; only the spawner may stop the node |
| Freenet upstream API churn (0.2.x is moving fast) | Version pinned in `scripts/freenet-binaries.json` and checksum-enforced; `fdev` removal tracked as PUF-FN work |
| `fdev` version drifting from `freenet` | Both pinned from one release tag. Worth knowing: the workshop's own `~/.local/bin/fdev` was 0.3.280 against `freenet` 0.2.119, i.e. already mismatched — exactly the drift the pin exists to stop |

---

## 16. References

- [`units/puf-freenet-host/README.md`](../units/puf-freenet-host/README.md) — plugin unit API and lifecycle
- [`desktop/README.md`](../desktop/README.md) — shell layout, build commands (Phase 1+)
- [`vendor/README.md`](../vendor/README.md) — how to populate the bundled binaries, and why they are not committed
- [`scripts/freenet-binaries.json`](../scripts/freenet-binaries.json) — the version pin and every checksum
- [`units/mist-freenet/README.md`](../units/mist-freenet/README.md) — mist storage, ws02 transport, pack-contract addressing
- [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) — mist crypto, FarmCode, Hot/bones/Archive
- [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) — two-laptop Opennet flow and the sidecar pattern being retired for desktop
- [`NAMING.md`](NAMING.md) §1–2 — PUF-AM / PUF-FN naming, desktop build identifiers
- [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist network & storage — phase log
