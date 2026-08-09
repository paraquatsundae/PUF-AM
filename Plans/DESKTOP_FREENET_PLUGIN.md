# PUF-AM desktop installer + Freenet as an in-app plugin

**Status:** Phases 0–4 done on Fedora. **Field-validated** ~2026-08-04: two Fedora laptops completed a full A→B farm join over Freenet 0.2 Opennet running **only the AppImage** — bundled Freenet (`source: bundled`), no terminal, no `npm run dev`, no sidecar (§14 Phase 3). Phase 4 closed the loopback API behind a per-launch bearer (§6.3) and produced copyable **Windows portable + zip** artifacts from Fedora (§8.5); the NSIS `.exe` and the first `freenet.exe` launch still want a Windows machine. **~2026-08-07** the deferred Phase 4 item 9 landed: a running AppImage can be the **tablet hub** on the shed LAN — a second, LAN-bound listener behind a pairing code that mints per-device tokens, serving an allowlist of sync/Freenet routes and never the UI (§6.4). Not shipped.
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

### 6.3 Loopback exposure — closed in Phase 4

Binding an HTTP API to `127.0.0.1` means any local process can reach it. That is **not a regression** relative to `npm run dev` (which binds `0.0.0.0:3000`), but an ephemeral port is obscurity, not a boundary — `ss -ltnp` finds it in one command, and `/api/mist/freenet/*` publishes farm ciphertext.

**Phase 4 landed a per-launch bearer.** [`desktop/loopbackAuth.ts`](../desktop/loopbackAuth.ts) mints 256 bits from the CSPRNG at boot; [`desktop/localApi.ts`](../desktop/localApi.ts) wraps `createApiApp()` in a guard that 401s any `/api/*` request without it.

| Decision | Why |
|----------|-----|
| **HTTP + token**, not IPC-only | Moving Freenet to `contextBridge` would fork ~40 `/api/*` call sites in `src/` into two transports and leave `/api/sync/*` on HTTP anyway. The token covers *every* local route in one middleware, including ones nobody has written yet |
| Injected by `session.webRequest.onBeforeSendHeaders`, **not** via preload | The renderer never holds the secret. Header injection already authorises every renderer fetch — including code that cannot set headers — so putting it on `window.pufamDesktop` would only add a place to leak from |
| Origin matched in JS, not by the `webRequest` URL filter | Chromium match patterns have no notion of a port, and this port changes every launch. The prefix test is what keeps the token off requests to `am.pufworks.farm` |
| `x-puf-desktop-token`, not `Authorization` | `/api/sync/*` and `/api/auth/*` already carry farm and Firebase bearers; overwriting those would break the LAN hub. The guard accepts a bearer too, for a curl from the workshop |
| `/api/health` stays open | Liveness only. Guarding it would break the smoke checks and gains nothing — the port is already known to anyone asking |
| Static assets stay open | The built bundle is not a secret, and a browser that loads it still gets 401 on every API call it tries |

Verified on the rebuilt AppImage: from the renderer, `/api/definitely-not-a-route` returns the API's own `404 API route not found`; the same URL from another process returns `401 PUF-AM desktop loopback token required`; `window.pufamDesktop` exposes no token-shaped key.

### 6.4 The tablet hub — a second, LAN-bound listener (Phase 4 item 9)

§6.3 closed the loopback API so hard that nothing off the machine could reach it, which is correct for a desktop app and useless for a shed. The tablet needs the laptop to be its sync hub: mDNS discovery, join-ticket register/resolve, `/api/sync/*`, and the Freenet routes the tablet already calls. Item 9 was deferred pending "a decision about what authorises a phone against it". This is that decision.

**The listener is separate, not the loopback one widened.** [`desktop/lanApi.ts`](../desktop/lanApi.ts) binds a *second* Express app on `0.0.0.0`, default port 3000 with an incremental search (up to 10 ports) when something else holds it. The loopback listener in `localApi.ts` is untouched: it keeps its ephemeral port, its per-launch bearer, and its static bundle. Widening the existing one would have meant a single middleware deciding between two very different trust levels on every request, and would have put the desktop UI's own token one misconfigured bind away from the network.

| Decision | Why |
|----------|-----|
| **Pairing code → per-device token**, not a shared secret | The code is 8 characters the operator can read across a shed (`ABCD-2345`, Crockford-ish alphabet, no `O`/`I`/`L`/`U`). It is a *bootstrap* credential only: `POST /api/hub/pair` exchanges it for 256 bits of per-device token, and the code can be rotated without re-pairing devices that already hold one. A single shared secret would mean rotating it kicks every tablet |
| Tokens stored **hashed** (SHA-256) in `desktop-prefs.json` | The prefs file is plain JSON in `<userData>`. Storing the token itself would make a backup of that file equivalent to a paired device |
| `x-puf-hub-token`, a **different header** from `x-puf-desktop-token` | They authorise different boundaries. Reusing the loopback header would mean a paired tablet's token and the desktop's launch token were interchangeable in one middleware — exactly the confusion the separate listener exists to avoid |
| **Route allowlist by prefix**, default deny | LAN callers reach `/api/sync/*`, `/api/presence/*`, `/api/highlights/*`, `/api/mist/freenet/*` and nothing else. `/api/auth/*` and `/api/weather/*` return **404 with a sentence explaining they are cloud routes**, so a confused tablet retries against the cloud instead of showing a dead hub |
| **No static bundle over LAN** | The LAN app mounts API routes only; `GET /` is a 404. Serving the UI would invite someone to browse the farm from a phone that never paired, and the tablet already has its own build |
| `/api/health`, `/api/hub/info`, `/api/hub/pair` are **open** | Discovery has to work before pairing exists. `hub/info` deliberately reveals only what a joiner needs to route correctly — hub kind, whether pairing is required, which prefixes are local vs cloud. No farm names, no device list |
| Pairing is **rate-limited and LAN-only** | Wrong codes are throttled per client (429 with `Retry-After`), and `POST /api/hub/pair` refuses any caller that is not on a private address (403). Eight characters is short enough that unmetered guessing would matter |
| **Off by default**, one toggle in Settings | Binding `0.0.0.0` is the operator's decision, not a side effect of launching the app. [`src/components/TabletHubCard.tsx`](../src/components/TabletHubCard.tsx) shows the code, the LAN URL, the paired-device list, **Rotate code**, and **Forget** per device |

**Wire shape.** [`shared/sync/hubInfo.ts`](../shared/sync/hubInfo.ts) is the contract both sides compile against, so the tablet's routing table comes *from the hub* rather than being hardcoded per hub kind. A `npm run dev` server answers the same endpoint with `kind: 'workshop-dev'` and `pairingRequired: false`, which is why the existing vite-based tablet flow keeps working unchanged.

```
tablet                                  laptop (AppImage)
  │  mDNS _pufom-sync._tcp                 │  advertises ip= kind=desktop-lan pair=1
  │─────── GET /api/hub/info ─────────────►│  open: kind, pairingRequired, prefixes
  │─────── POST /api/hub/pair {code} ─────►│  throttled, LAN-only, mints 256-bit token
  │◄────── { token, hub } ─────────────────│  stores SHA-256 in desktop-prefs.json
  │─────── GET /api/sync/... ──────────────►│  x-puf-hub-token, allowlisted prefix
  │─────── GET /api/auth/... ──────────────►│  404 + "that one comes from the cloud"
```

On the tablet, [`src/lib/hubIdentity.ts`](../src/lib/hubIdentity.ts) keeps the token and the cached `HubInfo` in `localStorage` keyed by hub base, so [`src/lib/apiBase.ts`](../src/lib/apiBase.ts) can decide *synchronously* — before first paint — whether a given path goes to the hub or the cloud. `apiFetch()` attaches the header only when the target is the current hub, the same origin-matching discipline §6.3 uses to keep the desktop token off `am.pufworks.farm`.

**mDNS now advertises something reachable.** `listLanIpv4()` in [`server/mdnsHub.ts`](../server/mdnsHub.ts) ranks interfaces so a Wi-Fi address beats a USB-tether or virtual-bridge address — the multi-homed laptop trap that made the advertised URL unreachable from the tablet. `main.ts` also re-checks the address periodically and republishes when it changes, which a laptop carried between house and shed does constantly.

Verified live against the packaged build (§14 Phase 4 item 9): open health and hub/info, 401 on a scoped route without a token, 401 on a wrong code, pair, then a full join-ticket register → resolve round trip through the hub, 404 on `/api/auth/pins`, 404 on `/`, and `avahi-browse` seeing `ip=`/`kind=desktop-lan`/`pair=1` — while the loopback UI still served 200 and its API still 401'd without the desktop token.

**Re-verified 2026-08-07** against a freshly built `release/PUF-AM-0.1.0.AppImage`, dialling the LAN address (`http://192.168.1.205:3000`) rather than loopback, so the checks crossed the `0.0.0.0` bind the way a tablet does. 19 checks, all passing: the sequence above, plus a `Bearer` form of the token, `paired: true` reflected back in `/api/hub/info`, resolve **refused** without a token, `/api/weather/chill-portions` 404, `/index.html` 404, a forged 64-hex token 401'd, and a token minted before a relaunch still accepted after it (the token hash is persisted; only the hash). In the same run the loopback listener on its ephemeral port served the UI 200, still 401'd `/api/sync/self` without the desktop token, and **was not reachable on the LAN address at all** — which is the property that makes the second listener worth having rather than widening the first.

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
| Desktop preferences (mist opt-in) | `<userData>/desktop-prefs.json` | same shape |
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
| Windows | **`portable`** + **`zip`** | **Built on Fedora** (`desktop:dist:win:portable`) — no wine needed. This is the artifact to copy to a Windows test machine |
| Windows | **`nsis`** installer | Config complete; the build needs a Windows host or a working system wine — see §8.1.1 |
| Debian/Ubuntu | `deb` (optional) | Free from the same config; not configured, not a target platform |

**AppImage ended up ahead of `rpm`**, inverting the original ordering. electron-builder builds `rpm` through a bundled `fpm`, whose Ruby links `libcrypt.so.1`; Fedora 44 ships `libcrypt.so.2` only. So the rpm leg needs:

```bash
sudo dnf install rpm-build libxcrypt-compat   # rpmbuild + the legacy libcrypt fpm links against
npm run desktop:dist:linux                    # AppImage + rpm
npm run desktop:dist:linux:appimage           # AppImage only — no extra host packages
```

That is also why `desktop:dist:linux:appimage` exists: without it, a machine missing those two packages fails the whole build *after* the AppImage has already been written, which reads like the AppImage failed too.

#### 8.1.1 Windows from Fedora — what actually blocks, and what does not

The earlier note ("Windows installers need a Windows box") was too broad. Only **one step** of one target is blocked.

| Step | Needs Windows/wine? | Why |
|------|---------------------|-----|
| `win-unpacked/` — asar, `freenet.exe`, `fdev.exe`, pack WASM | no | Pure file copying |
| `zip` target | no | Archive of the same tree |
| `portable` target | no | `makensis` runs natively on Linux from electron-builder's own toolset |
| Code signing | no (as configured) | With no certificate, `signIf` logs and returns — it never reaches wine. Signing is out of scope (§11) |
| **`nsis` uninstaller** | **yes** | NSIS produces `Uninstall.exe` by *running* a stub executable. That is a Windows binary, and nothing on Linux can execute it without wine |

So `npm run desktop:dist:win:portable` builds the whole Windows deliverable set that a test machine needs, on Fedora, with no root. `npm run desktop:dist:win` still needs the Windows box for the `.exe` installer.

**The bundled-wine escape hatch does not work.** electron-builder 26 can download its own portable Wine (`toolsets.wine: '1.0.1'`) instead of a system one, which removes the `spawn wine ENOENT` failure — but the Linux bundle it fetches, `wine-11.0-linux-x86_64.tar.xz`, ships no `lib/wine/x86_64-windows/` and no `kernel32.dll`, so it cannot boot a prefix (`could not load kernel32.dll, status c0000135`). The config was tried and reverted; do not re-add it expecting the NSIS leg to pass. A **system** wine (`sudo dnf install wine`, then `USE_SYSTEM_WINE=true`) is the untested alternative — it needs root, which this box does not have.

Fedora artifacts otherwise build on Fedora, and the NSIS installer on the `C:\Projects` Windows box.

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

The **renderer** bundle needs its own desktop-specific build for the same class of reason. `isMistExperimentalEnabled()` reads `import.meta.env.VITE_MIST_EXPERIMENTAL`, which Vite inlines at build time: an unset flag becomes `undefined` and the whole gate is dead-code eliminated, so no runtime environment variable can bring the mist UI back. A plain `npm run build` therefore ships a desktop app whose Settings surface hides the workshop even when the operator launched with `MIST_FREENET=1` and a Freenet node is running. [`scripts/build-desktop-web.mjs`](../scripts/build-desktop-web.mjs) (`npm run desktop:build:web`) is the desktop web build and defaults the flag to `true`; `desktop:dist:prep` and `desktop:dev` both use it. Pass `VITE_MIST_EXPERIMENTAL=false` to package a Firebase-only desktop build.

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

### 8.5 Putting PUF-AM on a Windows test machine

Built on Fedora by `npm run desktop:dist:win:portable`, into `release/` (gitignored — copy them off the build box by hand):

| Artifact | Size | What it is |
|----------|------|------------|
| `release/PUF-AM 0.1.0.exe` | ~107 MB | **Portable.** One file. Copy it anywhere on the Windows PC and double-click — no install, no admin |
| `release/PUF-AM-0.1.0-win.zip` | ~169 MB | The same app unzipped rather than self-extracting. Unzip, run `PUF-AM.exe`. Useful when a portable exe trips a policy or an AV scanner |
| `release/win-unpacked/` | ~440 MB | The raw tree the other two are made from. Copyable too, but the zip is the same thing without 3000 files |

Both carry `resources/freenet/{freenet.exe,fdev.exe}` and `resources/contracts/{pack-contract.wasm,slot-contract.wasm}`, so the target machine needs **no Node, no npm, and no Freenet install**.

**Unsigned, by design** (§11). Windows SmartScreen will show *"Windows protected your PC"* on first launch: **More info → Run anyway**. Signing means an EV certificate, which is out of scope for workshop builds.

On the test machine:

1. Copy the portable `.exe` across (USB or share) and run it. Data lands in `%APPDATA%\PUF-AM\` and survives between runs.
2. **Settings → Farm sync between laptops → Start Freenet when PUF-AM opens.** That persists to `%APPDATA%\PUF-AM\desktop-prefs.json` and starts the bundled node in the same session — no relaunch, no `MIST_FREENET=1`, no terminal.
3. Watch the readiness line go *connecting* → *connected*. A brand-new Opennet peer takes the documented 5–15 min on run 1 (§7.2).
4. **A → B join:** on the machine that already holds the farm, publish and copy the join ticket; on the new one, choose **Join a farm**, enter the FarmCode and device PIN, paste the ticket.

This is the first Windows run of `freenet.exe`, so treat it as new information: if it spawns a node, flip `win-x64` from `pinned` to `verified` in `scripts/freenet-binaries.json`.

---

## 9. First run and operator experience

**No Freenet wizard.** Freenet uses Opennet with silent defaults; the only decision a farmer makes is the existing mist opt-in — a checkbox in Settings (*Start Freenet when PUF-AM opens*), persisted to `<userData>/desktop-prefs.json` and read by `main.ts` before any window exists. It cannot live in `localStorage` for that reason: the host has to be started before the renderer is alive.

| Launch | What the operator sees |
|--------|------------------------|
| Firebase user (default) | Normal PUF-AM. Freenet host never starts. Zero Freenet UI |
| Mist enabled, run 1 | Existing FarmCode first-run. Freenet starts silently in the background; status card shows *connecting* → *connected*; publishes may need the documented bootstrap wait |
| Mist enabled, run 2+ | Node reuses its data dir; connects in seconds |
| Freenet binary missing/corrupt | Status shows `failed` with the resolved path. App fully usable on Firebase or local-only; no modal, no crash |

Settings carries two Freenet surfaces, split by who is reading:

| Card | Audience | Contents |
|------|----------|----------|
| **Farm sync between laptops** | the operator | Readiness in one sentence, one **Connect** button, the launch opt-in, and the send / join task itself |
| **Mist workshop — diagnostics** | the workshop | Node mode (`managed`/`attached`), reachability, binary source + version, peer transport, raw publish/pull, hashes, loss-recovery smoke |

No second window, no tray icon, no separate installer entry.

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

Android APK changes · code signing / notarization (Windows EV cert, Linux GPG — so SmartScreen warns on first Windows launch, §8.5) · auto-updater (AGENTS.md rule 9: no public distribution pipeline) · WASM/library Freenet embed (§4.3) · mutable Freenet contracts / deterministic URIs (Option B in [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md)) · Reticulum unit · replacing loopback HTTP with pure IPC — **dropped**, the Phase 4 token covers every local route rather than only the ones someone remembered to move (§6.3).

**Future Android note:** the phone will not run a Freenet peer. It either syncs to a desktop PUF-AM acting as **LAN hub** (the `/api/sync/*` + mDNS path that already exists), or waits for a Freenet Android peer upstream. Not this phase. That analysis now has its own plan — [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) — covering the four blockers, the hub option recommended for Phase 1, and how the same `FreenetHostPlugin` interface would serve a mobile implementation. **No Freenet host on Android is implemented.**

---

## 12. Not breaking Android

The APK later gained the mist storage chooser and an honest "no Freenet here" gate ([`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) §6–7). That changed the Capacitor build scripts but none of the guards below — `units/puf-freenet-host/` is still Node-only and still unreachable from the renderer.

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
| `MIST_FREENET=1 npm run dev` in terminal 2 | Gone — the app *is* the server, and mist is a Settings checkbox |
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
- Gated scripts: **`desktop:dist`** (host platform), **`desktop:dist:linux`**, **`desktop:dist:linux:appimage`**, **`desktop:dist:win`**, plus `desktop:vendor:verify:linux` / `:win`. Every one runs `desktop:vendor:verify` for the *target* platform, `desktop:verify:pack --require-fdev`, a fresh `desktop:build:web` (the Vite build with the mist flag baked in, §8.3) and main/preload bundle, then `desktop:verify:deps` — a stale `vendor/`, a drifted pack-contract hash, or a stale allowlist all stop the build before electron-builder starts.
- `server/firebaseAdmin.ts` loads the Admin SDK lazily; `better-sqlite3` dropped (§8.3); app icon committed at `desktop/resources/icon.png`.

**Verified on Fedora 44:** `npm run desktop:dist:linux:appimage` → `release/PUF-AM-0.1.0.AppImage` (164 MB). Launching it reports **`mode=managed source=bundled`** — the first time the resolver has picked `resources/freenet/` rather than `vendor/` — serves the UI and `/api/health` from `127.0.0.1:<ephemeral>`, runs `/tmp/.mount_*/resources/freenet/freenet` against `~/.config/PUF-AM/freenet/{config,data,logs}`, and on quit stops only its own node: the operator's workshop `freenet network` on `:7509` was still running afterwards. `resources/freenet/{freenet,fdev,LICENSE.md}` and `resources/contracts/pack-contract.wasm` are present in both the Linux and Windows outputs.

**Re-verified ~2026-08-09, and the join slot needed two packaging fixes.** The slot contract landed *after* the 2026-08-07 AppImage, and a packaged build could not have used it:

| Gap | Why it mattered | Fix |
|---|---|---|
| `slot-contract.wasm` was not in `extraResources` | Publishing a slot is `fdev put --code <wasm>`, and `mist-freenet`'s default resolves relative to `import.meta.url` — a path that does not survive bundling into the CJS main, and that `fdev` could not read out of the asar anyway | Bundled to `resources/contracts/slot-contract.wasm`; `desktop/main.ts` resolves it and `freenetHostEnv()` exports `FREENET_SLOT_WASM`, exactly as it already did for the pack WASM |
| `@noble/curves` was missing from the asar allowlist | The slot's ed25519 signing pulled in a new runtime dependency | Allowlist regenerated from `desktop:verify:deps` |

The second one is why the dependency gate exists: `npm run desktop:dist:linux:appimage` **refused to build** rather than shipping an app that would have thrown on the first slot publish.

**Windows:** `npm run desktop:dist:win` produces a complete `release/win-unpacked/` on Fedora — asar, `freenet.exe`, `fdev.exe`, and the pack WASM all land correctly — then fails at the NSIS step with `spawn wine ENOENT`. That is the documented boundary, not a config problem: run the same command on the `C:\Projects` Windows box (§8.1). `freenet.exe` has still **never been launched**, so `win-x64` stays `pinned` in the manifest until it spawns a node there.

**Field-validated ~2026-08-04 — two laptops, AppImage only.** Laptop A published Hot + bones and produced a join ticket; laptop B, a machine that had never held this farm, recovered the identity from the paper FarmCode, pasted the ticket, and pulled diary entries plus the full map geometry back over Opennet. Neither laptop had a repo clone, `npm`, an operator-installed Freenet, or a browser pointed at `am.pufworks.farm`. This is the first end-to-end PUF-AM desktop mist join, and it retires the "still open" item below about installing on a bare machine. Detail: [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) § AppImage A→B.

**Still open before this phase is closed in the field:**

- Windows `nsis` + `portable` artifacts, and the first `freenet.exe` launch.
- The `rpm` leg needs `sudo dnf install rpm-build libxcrypt-compat` (§8.1) — untested on this box.
- ~~Install on a machine with **no Node, no npm, no Freenet**, and complete a Freenet publish there~~ **Done ~2026-08-04** — see the two-laptop pass above.
- ~~A packaged build has no way to turn mist on~~ **Fixed ~2026-08-04.** Two separate bugs hid behind one symptom: `MIST_FREENET=1 ./release/PUF-AM-0.1.0.AppImage` started a Freenet node but Settings showed no mist UI at all. The renderer gate is baked at build time (§8.3), so the packaged bundle had it compiled out — `desktop:build:web` now bakes `VITE_MIST_EXPERIMENTAL=true`. As a belt-and-braces runtime path, `isMistExperimentalEnabled()` also honours the preload bridge's `mistEnabled`, so the launch flag alone un-gates the UI even in a bundle built without the Vite flag. `MistWorkshopCard` gained **Start / Stop Freenet node** buttons over the existing `puf-freenet:*` IPC (§5.2), so an operator who launched without `MIST_FREENET=1` can still bring the app-owned node up from Settings for that session — no relaunch, no terminal.

### Phase 4 — polish, quick join, and retiring the sidecar (**done on Fedora**, ~2026-08-04; Windows installer + mDNS carried forward)

The Phase 3 pass proved the flow exists. Phase 4 is about making it something a farmer can do without being told what a WebSocket is.

| # | Item | Status |
|---|------|--------|
| 1 | Two-machine A→B join-ticket smoke using **installers only** | **done** ~2026-08-04 (Phase 3 note above) |
| 2 | Mark the `am.pufworks.farm` sidecar section *workshop/web only* | **done** — [`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) |
| 3 | Desktop never resolves `am.pufworks.farm` for `/api/mist/freenet/*` | **done** — `getMistFreenetApiBaseUrl()` now *refuses* a non-loopback base on desktop instead of trusting the config flag, and `usesLocalFreenetSidecar()` is hard-false in the shell. Covered in `tests/apiBaseDesktop.test.ts` |
| 4 | **Mist opt-in from Settings** — no `MIST_FREENET=1` on the launch | **done** — persisted in `<userData>/desktop-prefs.json` ([`desktop/desktopPrefs.ts`](../desktop/desktopPrefs.ts)), read at boot by `main.ts`, toggled over `puf-desktop:*-mist-preference` IPC. Turning it on starts the node in the same session; `MIST_FREENET` survives as a workshop override that reports itself in the UI |
| 5 | **One-card join UX** — publish/copy on A, paste/fetch on B | **done** — [`src/components/MistFarmSyncCard.tsx`](../src/components/MistFarmSyncCard.tsx) above the workshop card in Settings |
| 6 | Plain-language status instead of peer/port jargon | **done** — one readiness line plus a single **Connect** button; the UDP-vs-WebSocket note folds away behind a disclosure in the diagnostics card |
| 7 | Loopback guard — bearer token and/or IPC-only Freenet calls (§6.3) | **done** — per-launch token in [`desktop/loopbackAuth.ts`](../desktop/loopbackAuth.ts), injected by the session so the renderer never holds it. 14 hermetic tests + a live AppImage check (§6.3) |
| 8 | Windows: copyable artifact + first `freenet.exe` launch | **half done** — `portable` + `zip` now build on Fedora (§8.1.1, §8.5). The NSIS `.exe` and the first `freenet.exe` launch still need the Windows machine |
| 9 | mDNS LAN-hub advertising from the shell | **done** — second LAN-bound listener behind a pairing code, off by default, one toggle in Settings (§6.4) |

**Item 9 landed as the tablet hub (§6.4).** The deferral was waiting on one question — what authorises a phone against a LAN-bound desktop API. The answer is *not* the `/api/sync/*` farm bearer that this table originally guessed at: that bearer identifies a farm, not a device, so it cannot be revoked for one lost tablet and it says nothing about whether the operator consented to this laptop serving the network at all. Instead a short pairing code shown in Settings is exchanged once for a per-device token, over a listener that is separate from the loopback one and serves an allowlist of routes. Full reasoning, wire shape, and the live verification are in §6.4.

**Done when:** the two-Fedora pass criteria are met with zero terminals open **and** nothing in the operator path requires an environment variable. Items 1–7 and 9 clear that. What remains under Phase 4 is Windows-host work (item 8).

#### What the join feels like after items 4–6

A card called **Farm sync between laptops** sits above the workshop diagnostics. It opens on **Join a farm** when this device has never published, and **Send this farm** when it has, so B lands on the right half without choosing. One status line says whether Freenet is reachable in a sentence, and a single **Connect** button does node-then-peer rather than making the operator find two buttons in the right order. On A, publishing drops the join ticket into a copy box with a three-item handoff list (FarmCode, device PIN, ticket) beside it. On B, the paste box validates as you type and the result comes back as *"12 diary entries and 4 blocks are now on this laptop"* rather than a hash. The raw controls all still exist one card down.

### Phase 5 — PUF-FN extraction (later, optional)

Move `units/puf-freenet-host/` to its own repo, publish as a private package, consume from PUF-AM and one other PUF unit. Interface must not need to change — if it does, Phase 0–4 got the boundary wrong.

---

## 15. Risks and open questions

| Risk | Mitigation / status |
|------|---------------------|
| Windows `freenet.exe` availability at pinned version | **Closed** — `freenet-x86_64-pc-windows-msvc.zip` + `fdev` zip ship in `v0.2.119`; both pinned, staged, and packed into the portable exe and the zip (§8.4, §8.5). Never *launched*: still open, now waiting on a Windows machine rather than on a build step |
| Windows installer needs a build host we do not have | **Downgraded** — only the NSIS uninstaller step needs wine, and `portable` + `zip` give a copyable, double-clickable app without it (§8.1.1). electron-builder's own portable wine bundle is missing `kernel32.dll` and does not rescue the NSIS leg |
| Installer size ~250 MB with binaries | **Better than feared** — 164 MB AppImage, because the `files` allowlist keeps the renderer's production dependencies out of the asar (§8.2). Would have been ~500 MB without it |
| Fresh app-owned peer identity slows first publish | Documented warm-up; start host at launch; consider attach-to-existing as a workshop default |
| Exit code 42 update loop | Host never auto-updates; surfaces `updateRequired` and stops (§5.4) |
| Bundled WASM drifts from pinned code hash | **Closed** — `npm run desktop:verify:pack` plus a hermetic test on the pin (§7.1). Publishing with a mismatched hash silently changes every URI, so this fails the build rather than warning |
| Redistributing an AGPL binary | **Closed** — upstream `LICENSE.md` explicitly exempts bundling the unmodified binary alongside an app that talks to it over a network protocol; the text ships beside the binaries (§8.4) |
| Loopback API reachable by local processes | **Closed** — per-launch bearer required on every `/api/*` except `/api/health`, injected into renderer requests by the session so the token never enters the renderer (§6.3) |
| LAN listener widens the attack surface of a shed laptop | **Bounded, not eliminated** — it is off until the operator turns it on, binds a separate app from the loopback one, serves an allowlist rather than the whole API, never serves the UI, and needs a per-device token that can be revoked one tablet at a time (§6.4). What remains open by design: traffic is plain HTTP on the LAN, so anyone already on the Wi-Fi can read a paired tablet's sync traffic. TLS needs a cert story a farmer can complete, which is its own piece of work |
| 8-character pairing code is guessable | Throttled per client with `Retry-After`, refused outright from non-private addresses, and rotatable from Settings without unpairing existing devices. The code is a bootstrap credential with a short useful life, not the thing that authorises requests (§6.4) |
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
