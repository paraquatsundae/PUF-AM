# Freenet on the PUF-AM tablet APK

**Status:** Plan only. **Nothing in this document is implemented.** The APK in this pass gained the mist storage chooser and an honest "no Freenet here" gate; it did **not** gain a Freenet host.
**Date:** 2026-08-05
**Product:** PUF-AM (Ag Manager) · **Scope:** Android / Capacitor (`com.sentinut.farm`)
**Experimental:** mist/Freenet stays experimental everywhere. **Firebase Auth + invite PIN remains the shipping path** on tablets and is unaffected by anything below.

Related: [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) (the desktop plugin this one is measured against) · [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) (what we publish and where it is kept) · [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) (every local store, including the Android ones) · [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy · [`NAMING.md`](NAMING.md) §2–3.

---

## 1. What this pass did and did not do

| | |
|--|--|
| **Did** | The Capacitor build bakes `VITE_MIST_EXPERIMENTAL=true`, so the mist start-screen storage chooser is in the APK (§6). Freenet surfaces on Android are gated with an honest message instead of a Connect button that can only time out (§7). One command builds a tablet APK (§6.3). |
| **Did not** | Implement `FreenetHostPlugin` on Android. There is **no Freenet node in the APK, no companion node, and no hub relay**. A tablet cannot publish to or pull from Freenet by any path today. |

Everything in §3–§5 is analysis and options. §8 is the phased order if and when the work is picked up.

---

## 2. Why the desktop answer does not port

The desktop plugin ([`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) §4) is honest that "plugin" means **ownership, not linkage**: Electron's main process is Node, so PUF-AM spawns a bundled `freenet` binary as a child process and talks to it over a loopback WebSocket. Four separate things make that shape unavailable on Android, and **each one is sufficient on its own**.

| # | Blocker | Detail |
|---|---------|--------|
| 1 | **No Node runtime in the APK** | Capacitor is a WebView plus a Java/Kotlin host. There is no `node:child_process`, no `node:net`, no `node:fs`. Electron gets those for free; Android does not. |
| 2 | **The whole Freenet client path is server-side** | The renderer never speaks to Freenet directly — it calls `/api/mist/freenet/*` ([`src/mist/mistFreenetClient.ts`](../src/mist/mistFreenetClient.ts) → `mistFreenetApiUrl()`), which is Express ([`server/mistFreenetRoutes.ts`](../server/mistFreenetRoutes.ts)) wrapping `FreenetPeer` and the ws02 transport in `units/mist-freenet`. That is all Node. Deleting blocker 1 would still leave the APK with no server to call. |
| 3 | **Android will not execute an arbitrary bundled binary** | Since Android 10 (API 29) an app may not `exec` a file from its writable data directory. The only executables an app can launch are the ones the package manager extracted into `nativeLibraryDir`, which means shipping Freenet as a `lib*.so` inside the APK — a different build, a different packaging story, and a `freenet-core` cross-compile to `aarch64-linux-android` that **upstream does not publish**. |
| 4 | **PUT still needs `fdev`** | On the pinned 0.2.119 the flatbuffers PUT path hangs, so publishing goes through the separate 37 MB `fdev` CLI (desktop plan §4.1). That is a *second* native binary and a *second* process — the thing Android is least willing to give us. |

Blockers 1 and 2 are ours and could be engineered around. **Blocker 3 is Android policy and blocker 4 is upstream**, and those are the two that decide the answer.

Size is worth stating even though it is not the blocker: `freenet` + `fdev` are ~93 MB. Bundling them would roughly quadruple an APK that operators sideload over shed Wi-Fi.

---

## 3. Options for tablets

| Option | What it means | Available today? | Cost | Verdict |
|--------|---------------|------------------|------|---------|
| **A. Shed / LAN hub** | A PUF-AM desktop (or Pi/NUC) on the farm LAN runs the node and the Express routes. The tablet is an HTTP client of that machine — it never touches Freenet itself | **Partly.** The hub half exists and is field-proven; the LAN half does not (see §4) | Low — one LAN-bound listener + an auth decision | **Recommended for Phase 1** |
| **B. Companion Freenet app** | A separate Android app hosts the node; PUF-AM attaches to it, the way the desktop host attaches to a workshop node | **No.** Freenet 0.2 publishes no Android build, and nobody else ships one | Would mean writing and maintaining option C's hard part, then also shipping a second app | Rejected |
| **C. Freenet Android peer inside the APK** | Cross-compile `freenet-core` for `aarch64-linux-android`, ship as `libfreenet.so`, drive it from a Capacitor native plugin | **No** | We would own a Rust Android toolchain, an unsupported target, `fdev`'s replacement, Doze/background-execution work, and battery behaviour | Not before upstream ships an Android target |
| **D. WASM peer in the WebView** | The peer compiles to WASM and runs in the page | **No** | Freenet transport is UDP; browsers have no UDP. Not on the upstream 0.2 roadmap | Watch only |

### Recommendation for Phase 1 tablets: **Option A, hub — and in Phase 1 the tablet does not use Freenet at all**

The honest Phase 1 position is stronger than "hub relay": **a tablet does not need Freenet to get farm data.** The `.pufom` LAN sync path, mDNS/NSD hub discovery, and the join-ticket LAN resolve already move a farm from a laptop to a tablet over shed Wi-Fi, with no Freenet involvement and no new code. Freenet's job is durability and machine-to-machine transfer *between* the always-on peers; the tablet's job is to be a client of the farm.

That also matches the frozen mobile peer policy in [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy: phones and tablets default `contribute_storage = false`, and the preferred durability anchor is "one always-on shed pin per farm". A tablet running a Freenet peer was never the design; it was only ever the fallback for farms with no always-on machine.

So Phase 1 is: **tablet holds the farm locally, syncs to the shed laptop over the LAN, and says plainly that Freenet lives on the laptop.** Hub *relay* of `/api/mist/freenet/*` (§4) is the first optional increment, not a Phase 1 requirement.

---

## 4. What the hub option actually needs

The hub is a PUF-AM desktop that already runs a bundled node. Two things stand between that and a tablet using it, and both are already recorded as deferred work in [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) §14 item 9:

| Blocker | Detail |
|---------|--------|
| **The desktop API is loopback-only** | `localApi.ts` binds `127.0.0.1` on an ephemeral port. Nothing on the LAN can reach it. `startPufomMdns()` would advertise a LAN URL that answers nothing |
| **The loopback token would 401 a tablet** | Phase 4 put a per-launch bearer on every `/api/*`, injected by the Electron session so only the renderer has it. A tablet has no way to get it, and should not — it is a same-process secret |

Doing this properly means a **second, LAN-bound listener** with its own authorisation, and the obvious candidate is the farm bearer that `/api/sync/*` already uses. That is a sync-path design question, which is exactly why the desktop plan pushed it out of Phase 4 rather than bolting it on.

Until that lands, the workshop escape hatch is the unchanged one: an APK built with `VITE_MIST_FREENET_API` pointing at a machine running `MIST_FREENET=1 npm run dev`. The runtime detector reports `android-hub` for that build and lets the buttons through (§7). It is a workshop path, not a product.

---

## 5. What "plugin" means on mobile versus desktop

**The interface does not change.** `FreenetHostPlugin` ([`units/puf-freenet-host/src/types.ts`](../units/puf-freenet-host/src/types.ts)) is `start` / `stop` / `status` / `putCiphertext` / `getCiphertext` / `on`, with `FreenetHostMode` already carrying `attached` — a mode that means "a node exists and it is not ours to kill". That is precisely the shape a hub client needs, and it was frozen before anyone asked about tablets. If mobile forces a change to it, the desktop plan got the boundary wrong (desktop plan §14 Phase 5).

| | Desktop (built) | Mobile hub (Option A, later) | Mobile on-device (Option C, not planned) |
|--|-----------------|------------------------------|------------------------------------------|
| Runtime | Electron main, Node | Capacitor WebView + LAN HTTP | Capacitor native plugin (Kotlin) + `libfreenet.so` |
| `start()` | Spawns the bundled binary | No-op — resolves the hub and probes it | Starts the native service |
| `mode` reported | `managed` (or `attached`) | `attached`, `wsUrl` on the hub | `managed` |
| Who holds the node | This machine | The shed laptop / Pi | This tablet |
| `putCiphertext` | ws02 transport + `fdev` | Hub's `/api/mist/freenet/*` | Native bridge |
| Contributes storage | Yes (`contribute_storage = true`) | **No** — the hub does | No (mobile policy) |

Two rules survive every variant, and both are already enforced in code rather than by convention:

1. **Ciphertext only.** The host never sees plaintext and never holds farm keys; sealing stays in `mist-freenet` behind `assertCiphertextForFreenet()`. A hub is another machine, so this is the property that makes a hub acceptable at all — the shed laptop relays farm bytes it cannot read.
2. **One-way dependency.** `puf-freenet-host` imports nothing from `mist-freenet`. A mobile implementation is a new adapter, not a fork of the storage unit.

---

## 6. Bringing the APK up to mist UI spec (this pass)

### 6.1 The bug this closes

`isMistExperimentalEnabled()` reads `import.meta.env.VITE_MIST_EXPERIMENTAL`, which **Vite inlines at build time**. An unset flag becomes `undefined`, the gate is dead-code eliminated, and the mist storage chooser is not in the bundle at all. The desktop hit this in Phase 3 and fixed it with [`scripts/build-desktop-web.mjs`](../scripts/build-desktop-web.mjs); the desktop also has a belt-and-braces runtime path through the preload bridge's `mistEnabled`.

**Android has no preload bridge.** There is no runtime flag, no launch environment variable, and no Settings toggle that can reach a bundle compiled without the gate. Baking the flag at build time is the *only* way the mist UI reaches a tablet.

### 6.2 Build wiring

[`scripts/build-android-web.mjs`](../scripts/build-android-web.mjs) is the Android sibling of the desktop web build: it sets `VITE_CAPACITOR=1` (relative asset paths, which the packaged WebView needs) and defaults `VITE_MIST_EXPERIMENTAL=true`.

| Script | What it does |
|--------|--------------|
| `npm run build:android` | Vite build with both flags baked, then `cap sync android` |
| `npm run build:android:firebase` | Same, `--no-mist` — a Firebase-only APK with no mist UI compiled in |
| `npm run apk:debug` | The above **plus** `assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk` |
| `npm run apk:debug:firebase` | Firebase-only APK |
| `npm run apk:install` | `adb install -r` the debug APK onto a connected tablet |

`build:android` moved off PowerShell to `node`, so the same command works on the Fedora build box and the Windows one. `scripts/adb-install-debug.ps1` / `.sh` still exist for anyone with them in muscle memory.

**`apk:debug` builds packaged** (`CAP_PACKAGED=1`): the WebView loads its own copied assets. The repo default for `cap sync` is still the live-reload shape pointing at `http://10.0.2.2:3000`, which resolves on an emulator and leaves a physical tablet on a blank screen — pass `--live` if that is what you want.

### 6.3 Producing a tablet APK

```bash
npm run apk:debug                      # dist/ → cap sync → assembleDebug
npm run apk:install                    # adb install -r, tablet on USB or wireless debugging
```

Or the long way, which is what the scripts run:

```bash
node scripts/build-android-web.mjs     # VITE_CAPACITOR=1 VITE_MIST_EXPERIMENTAL=true vite build
CAP_PACKAGED=1 npx cap sync android
cd android && ./gradlew assembleDebug  # gradlew.bat on Windows
```

Needs a JDK and the Android SDK; `android/local.properties` must carry `sdk.dir`. The APK is **unsigned debug** — sideload only, no Play track. Nothing about this changes `appId` (`com.sentinut.farm`, frozen — [`NAMING.md`](NAMING.md) §2).

**Verifying the chooser actually shipped** — the failure mode is silent, so check the bytes rather than the flag:

```bash
grep -rl "Offline Freenet network" dist/assets   # the chooser's own copy
```

### 6.4 What the tablet operator sees

| Surface | On the mist APK |
|---------|-----------------|
| Start screen | Storage chooser: **Cloud sync** (recommended, unchanged) and **Offline Freenet network** (experimental), with a note that on a tablet the farm stays on the device |
| New mist farm | Works — FarmCode mint, show-once screen, device PIN, local `pufam-mist-v1` store |
| Diary / map / issues on mist | Work — the mist backend is IndexedDB, not Freenet |
| **Farm sync between laptops** → Connect | **No Connect button.** One sentence saying Freenet does not run on this tablet, and what to do instead |
| **Mist workshop** → Connect Freenet peer | Disabled, with the same explanation |
| LAN sync, join ticket over Wi-Fi | Unchanged — the existing `.pufom` / NSD path is how a tablet gets a farm today |

---

## 7. The honest gate

[`src/lib/freenetRuntime.ts`](../src/lib/freenetRuntime.ts) answers one question — *where is the node this device would talk to* — and everything else reads the answer.

| Runtime | When | Freenet UI |
|---------|------|------------|
| `desktop-host` | Electron shell | Full — the app owns a bundled node |
| `browser-sidecar` | Any browser | Full — same-origin Express or the workshop sidecar |
| `android-hub` | Capacitor **and** `VITE_MIST_FREENET_API` baked in | Allowed — the operator named a machine, so let them try it |
| `android-no-host` | Capacitor, no hub | **Blocked with an explanation** |

Blocking is deliberate rather than cosmetic. A `Connect` button on a tablet with no node does not fail loudly — it fetches `http://10.0.2.2:3000` (the emulator loopback `apiBase.ts` falls back to), waits, and reports a generic disconnect. An operator in a paddock reads that as bad signal and goes looking for a hill. So the gate is checked *before* peer status, the status poll is skipped entirely, and the readiness line says the true thing:

> Freenet does not run on this tablet — the farm is held here, but sending and joining need a PUF-AM laptop.

`android-hub` exists so the workshop can still point an APK at a real node without the app pretending. Covered by [`tests/freenetRuntime.test.ts`](../tests/freenetRuntime.test.ts).

---

## 8. Phased order, if this is picked up

| Phase | Work | Blocked on |
|-------|------|------------|
| **0 (done)** | Mist chooser in the APK; honest gate; build scripts | — |
| **1** | Tablet gets farms over the **existing LAN path** — NSD hub discovery, `.pufom` sync, join-ticket LAN resolve. No Freenet | Nothing. Needs a field pass, not code |
| **2** | Desktop LAN listener for `/api/mist/freenet/*` with farm-bearer auth; tablet points at it; runtime becomes `android-hub` for real | Desktop plan §14 item 9 — a second listener and an auth decision |
| **3** | `RemoteFreenetHost` implementing `FreenetHostPlugin` against a hub, so the tablet reports `attached` through the same interface | Phase 2 |
| **4** | On-device peer (Option C) | Upstream `freenet-core` Android target; `fdev` removal; Doze/battery work. **Not planned** |

---

## 9. Out of scope

Freenet host on Android · bundling `freenet` / `fdev` in the APK · `contribute_storage` on mobile (frozen off — [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy) · Play Store distribution or signing · renaming `com.sentinut.farm` · Reticulum on Android · changing the `FreenetHostPlugin` interface.

---

## 10. Risks

| Risk | Position |
|------|----------|
| Mist UI ships on tablets without a way to sync off-device | Mitigated by §7 — the app says so on the chooser, the sync card, and the workshop card. It does not offer a button |
| Operator reads "Offline Freenet network" as working Freenet | The chooser copy on a tablet says the farm stays on the device. Wording is the mitigation; watch it in the first field pass |
| A mist farm created on a tablet becomes stranded | The FarmCode is minted and shown once as on any device, so the farm is recoverable — but there is no publish target until §8 Phase 1/2. Treat a tablet-created mist farm as workshop-only for now |
| `VITE_MIST_EXPERIMENTAL` silently missing from a build | `grep` check in §6.3; the flag is defaulted in the script rather than passed by hand |
| Hub relay leaks the desktop loopback token to the LAN | §4 — the LAN listener must have its own auth, not a shared token |
