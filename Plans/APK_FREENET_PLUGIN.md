# Freenet on the PUF-AM tablet APK

**Status:** §8 Phase 4's *reader* half is **built and running on a tablet** (§3b). Everything else here — a Freenet host in the APK, publishing from Android — remains plan only.
**Date:** 2026-08-05
**Update ~2026-08-07:** the *desktop* side of Option A landed — a packaged AppImage can now be the tablet's LAN hub, behind a pairing code, with `/api/mist/freenet/*` in the LAN allowlist (§4, §8a; design in desktop plan §6.4). Nothing in the APK changed: there is still no Freenet host on Android, and `detectFreenetRuntime()` does not yet count a *paired* hub as `android-hub` (§8 phase 2).
**Update ~2026-08-09:** the join-slot contract (§7a) makes a short ticket resolve **off the owner's Wi-Fi** — on a device with a Freenet node. That is still not a tablet. §7a records what a tablet can and cannot do with it, and the two tablet-side bugs found while establishing that.
**Update ~2026-08-09 (b):** §3 option B said "nobody else ships one". **That is now false** — an unofficial third-party Android node exists and is sideloadable (§3a). It changes which blocker is binding, not what is implemented here: still no Freenet on this tablet.
**Update ~2026-08-09 (c):** option B is **taken, and reads work on hardware.** A browser-side GET client speaks the 0.2 WS API straight at the sideloaded node on `127.0.0.1:7509`, so the SM-T545 resolves a join slot and pulls a farm with no hub, no pairing and no shed Wi‑Fi. §2 blocker 2 — "the whole Freenet client path is server-side" — is **lifted for GET**. Publishing is unchanged and still wants a laptop. Details and the device evidence in §3b.
**Update ~2026-08-09 (d):** the node app has a **power policy and a boot receiver**, so "open the Freenet app first" (§8b step 1) is a tablet setup step, not a permanent requirement. §8c records what its manifest does and does not let PUF-AM drive, and ranks the ways to remove that step.
**Update ~2026-08-10:** **the sideloaded node is now optional.** §8d makes the *gateway* explicit: the same paired hub, reachable at a remembered non-LAN address, so a tablet joins and syncs off the shed Wi‑Fi with nothing extra installed on it. Ladder is **LAN hub → farm gateway → local node (if sideloaded) → a named error**. Slice built; the honest security position, including which addresses are **refused**, is in §8d.
**Product:** PUF-AM (Ag Manager) · **Scope:** Android / Capacitor (`com.sentinut.farm`)
**Experimental:** mist/Freenet stays experimental everywhere. **Firebase Auth + invite PIN remains the shipping path** on tablets and is unaffected by anything below.

Related: [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) (the desktop plugin this one is measured against) · [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) (which pipes Settings shows, Freenet invite roles, crew roster, position pings) · [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) (what we publish and where it is kept) · [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) (every local store, including the Android ones) · [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy · [`NAMING.md`](NAMING.md) §2–3.

**Settings pointer moved:** the tablet-side hub steps below say *Settings → Offline & sync*. That card is now **Settings → Sync → Wi‑Fi (LAN)** ([`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §2); the flow is unchanged.

---

## 1. What this pass did and did not do

| | |
|--|--|
| **Did** | The Capacitor build bakes `VITE_MIST_EXPERIMENTAL=true`, so the mist start-screen storage chooser is in the APK (§6). Freenet surfaces on Android are gated with an honest message instead of a Connect button that can only time out (§7). One command builds a tablet APK (§6.3). |
| **Did not** | Implement `FreenetHostPlugin` on Android. There is **no Freenet node in the APK and no companion node**. A tablet still cannot *be* a Freenet peer by any path. (The hub relay it would borrow one through is no longer missing — see the 2026-08-07 update above — but wiring the APK's runtime detection to it is Phase 2 work that has not been done.) |

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
| **A. Shed / LAN hub** | A PUF-AM desktop (or Pi/NUC) on the farm LAN runs the node and the Express routes. The tablet is an HTTP client of that machine — it never touches Freenet itself | **Yes.** Both halves exist: the hub is field-proven, and the packaged app now serves the LAN behind a pairing code (§4) | Landed — LAN-bound listener + per-device tokens | **Recommended for Phase 1** |
| **B. Companion Freenet app** | A separate Android app hosts the node; PUF-AM attaches to it, the way the desktop host attaches to a workshop node | **Partly — see §3a.** Upstream still publishes no Android build, but a third party now sideloads one that binds the standard WS API on `127.0.0.1:7509` | We write no Rust; the cost moves to a browser-side client and to depending on someone else's alpha | Re-open as the POC route |
| **C. Freenet Android peer inside the APK** | Cross-compile `freenet-core` for `aarch64-linux-android`, ship as `libfreenet.so`, drive it from a Capacitor native plugin | **No** | We would own a Rust Android toolchain, an unsupported target, `fdev`'s replacement, Doze/background-execution work, and battery behaviour | Not before upstream ships an Android target |
| **D. WASM peer in the WebView** | The peer compiles to WASM and runs in the page | **No** | Freenet transport is UDP; browsers have no UDP. Not on the upstream 0.2 roadmap | Watch only |

### Recommendation for Phase 1 tablets: **Option A, hub — and in Phase 1 the tablet does not use Freenet at all**

The honest Phase 1 position is stronger than "hub relay": **a tablet does not need Freenet to get farm data.** The `.pufom` LAN sync path, mDNS/NSD hub discovery, and the join-ticket LAN resolve already move a farm from a laptop to a tablet over shed Wi-Fi, with no Freenet involvement and no new code. Freenet's job is durability and machine-to-machine transfer *between* the always-on peers; the tablet's job is to be a client of the farm.

That also matches the frozen mobile peer policy in [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy: phones and tablets default `contribute_storage = false`, and the preferred durability anchor is "one always-on shed pin per farm". A tablet running a Freenet peer was never the design; it was only ever the fallback for farms with no always-on machine.

So Phase 1 is: **tablet holds the farm locally, syncs to the shed laptop over the LAN, and says plainly that Freenet lives on the laptop.** Hub *relay* of `/api/mist/freenet/*` (§4) is the first optional increment, not a Phase 1 requirement.

---

## 3a. A third-party Android node exists (checked 2026-08-09)

[`manikmakki/freenet-android-node`](https://github.com/manikmakki/freenet-android-node) — unofficial, AGPL-3.0, alpha, two stars, one author — sideloads a signed ~100 MB APK that runs **real freenet-core 0.2.123** on a phone or tablet. It tracks upstream release-for-release (v0.2.120 through v0.2.123 all shipped in the three days to 2026-08-08). It embeds core as a **JNI `cdylib`**, not an exec'd binary, so §2 blocker 3 — the one this plan called decisive — does not apply to it at all. Its device proofs are on ARM64/API 33: a real network peer, a 30-minute continuous-peer gate, 20 clean start/stop cycles, a Wasmtime contract PUT/GET/UPDATE surviving a node restart, ~196 MB peak RSS.

What it gives us that matters: `run_network_node` with `ws_api.address` forced to `127.0.0.1` and the port defaulting to **7509** — byte-for-byte the endpoint `Freenet02WsTransport` already speaks (`ws://127.0.0.1:7509/v1/contract/command`). Android loopback is device-wide, so another app on the same tablet can reach it, and [`android/app/src/main/res/xml/network_security_config.xml`](../android/app/src/main/res/xml/network_security_config.xml) already permits cleartext to `127.0.0.1`.

**Which blockers this actually moves:**

| §2 blocker | Status after this app |
|---|---|
| 1 · no Node runtime in the APK | **Unchanged** |
| 2 · the whole Freenet client path is server-side Express | **Unchanged, and now the binding one.** A node on the tablet is useless until the *page* can speak to it |
| 3 · Android will not exec a bundled binary | **Sidestepped** — someone else linked core into a `cdylib` and shipped the foreground service |
| 4 · PUT still needs `fdev` | **Unchanged.** `fdev` is not in that APK and could not be exec'd anyway |

The consequence is asymmetric and worth naming: GET is the working flatbuffers path, so a tablet could become a Freenet **reader** — slot resolve, Hot + bones pull, i.e. the join in §7a — long before it could publish. Publishing needs native-protocol PUT in TypeScript, which is the same item as desktop's "drop `fdev`" (desktop plan §4.3).

**Why this does not become option C.** Doing the same JNI embed inside `com.sentinut.farm` is technically open to us and licensing-wise the worst move available: the AGPL carve-out cleared in desktop plan §8.4 covers *bundling an unmodified binary alongside* an app that talks to it over a network protocol, and linking core into our own process is the linkage that carve-out does not describe. Two apps over a loopback WebSocket keeps PUF-AM's licensing where it is, keeps the 100 MB out of a sideloaded APK, and is exactly what `FreenetHostMode = 'attached'` (§5) was frozen to model.

**What has not changed:** it is one person's alpha, self-described as draining battery; identity keys sit in files with Keystore wrapping listed as debt; the WS port has no auth, so any app on the tablet can drive our node; and it runs core 0.2.123 against our 0.2.119 pin, so the pack- and slot-contract code hashes need re-verifying before a cross-version join is trusted. The tablet is also an outbound-only NAT leaf with no inbound reachability claimed — which is another argument for the frozen `contribute_storage = false` mobile policy, not against it.

## 3b. The tablet reads Freenet for itself (built 2026-08-09)

§3a said GET was the asymmetry worth exploiting and that blocker 2 had become the binding one. This is that blocker removed. The page now speaks the 0.2 WS API directly, so the *client* half of Freenet no longer needs a Node runtime anywhere.

### What was built

| File | Job |
|------|-----|
| [`units/mist-freenet/src/freenet02-browser-get.ts`](../units/mist-freenet/src/freenet02-browser-get.ts) | `BrowserFreenetGetClient` — connect, `getBlob(FN02@…)`, disconnect. Flatbuffers via `@freenetorg/freenet-stdlib`, no Node imports |
| [`units/mist-freenet/src/freenet02-browser-get-url.ts`](../units/mist-freenet/src/freenet02-browser-get-url.ts) | `DEFAULT_LOCAL_FREENET_WS_URL` on its own, so the URL is importable without pulling the SDK into the first paint |
| [`src/mist/freenetLocalNode.ts`](../src/mist/freenetLocalNode.ts) | Is there a node here? Probe, cache, lazy client, `readLocalFreenetBlob()` |
| [`src/lib/freenetRuntime.ts`](../src/lib/freenetRuntime.ts) | New runtime `android-local-node`; `freenetReadsLocally()`, `detectFreenetReadOnly()`, `refreshFreenetRuntime()` |
| [`src/mist/joinSlotFreenet.ts`](../src/mist/joinSlotFreenet.ts) | `readJoinSlotState()` asks this device's node before any hub |
| [`src/mist/mistFreenetClient.ts`](../src/mist/mistFreenetClient.ts) | `readFarmBlobFromLocalNode()` in front of both `pull-by-uri` routes |

`Freenet02WsTransport` is untouched. The desktop keeps its own Node transport with `fdev` behind it; the browser client is a second, smaller reader, not a port of the first.

### Two limits, both deliberate

**Read-only, and there is no `putBlob` to reach for.** PUT still goes through `fdev` (§2 blocker 4). Rather than let that fail at the last step, `freenetIsReadOnlyHere()` disables *sending* on a tablet whose only node is the local one — and lifts as soon as a hub is paired, because that laptop still has `fdev`.

**Reads only, over loopback, to a separate app.** PUF-AM links nothing of Freenet's into its own process. That is the same arrangement the AGPL carve-out in desktop plan §8.4 describes, and it is why §3a's rejection of option C stands: the licensing objection was to *linkage*, and a WebSocket to another package is not linkage.

### Where a read goes, in order

Both the slot resolve and the Hot/bones pull walk the same ladder:

| Order | Route | Why here |
|-------|-------|----------|
| 1 | Node on this device (`127.0.0.1:7509`) | No pairing, no Wi‑Fi, no second machine that has to be awake |
| 2 | Hub (`/api/mist/freenet/*`) | Two nodes see different parts of the network. "My node has not found it yet" is ordinary in the minutes after a publish, and is no reason to ignore a laptop that has |
| 3 | An error naming what was actually tried | A tablet with a node and no hub must not be told to go and find a laptop |

Only the *last* step is fatal, which is the point: a local node that has not spread yet degrades to the hub instead of replacing it. When there is no hub at all, `apiHubMissing()` short-circuits before the fetch, so nothing spends a TCP timeout on a remembered address — and the message says the ticket has not spread yet rather than blaming a missing laptop.

`peer/start` and `peer/status` are skipped outright in the local-node case. They are questions for a hub, and a paired-but-absent laptop must not be able to hold up a join that never involved it. `shouldPollHubPeerStatus()` also waits for the probe to settle: at first paint the only thing the tablet knows is whether it *remembers* a hub, and acting on that reading cost a real request to a stale address before the local node was found.

### Cost of carrying it

The flatbuffers SDK is `import()`ed inside the client factory, so it lands as its own ~214 KB chunk (≈28 KB gzipped) that only a device with a node ever downloads. `probeLocalFreenetNode()` is a bare socket open, not a contract GET, for the same reason — asking the real question would drag the SDK into the first paint of every tablet, most of which have no node.

### Verified on the device

SM-T545, Android 11, `org.freenet.androidnode` v0.2.123 listening on `127.0.0.1:7509`, PUF-AM debug APK:

| Check | Result |
|-------|--------|
| `ws://127.0.0.1:7509` from the WebView's `https://localhost` origin | Opens in 44 ms — loopback is potentially-trustworthy, so no mixed-content block |
| App's own bundled chunk, `connect()` + `getBlob()` in the page | Connected in 35 ms; the GET went out and the node worked it |
| Same client from the build box against the tablet's node (`adb forward`) | Same behaviour — stdlib 0.3.0 talks to core **0.2.123** as well as to the desktop's 0.2.119 |
| Join gate on the tablet | Shows *"Reading Freenet from the node on this tablet — no laptop needed to join."* |

The pass condition is that the node accepts our flatbuffers `GetRequest` and works it, which is the cross-version compatibility question §3a flagged.

**A miss has two shapes, and measuring which one you get matters.** This was written expecting only the second:

| Shape | What the client returns | Measured |
|---|---|---|
| The node answers `ContractNotFound` | `null` — an ordinary answer the caller falls through on | **The common case.** ~8s on the desktop 0.2.119 and on the tablet's 0.2.123, for an address nothing was ever published to |
| The node never answers, and the search budget expires | Throws *"searched for Ns and did not find it"* | The case a cold or poorly-connected node hits, and why the budget is the caller's decision (`localFreenetSearchBudgetMs()`) rather than a constant |

The first shape is what makes the §3b ladder cheap: trying this device's node before the hub costs seconds, not a whole budget. Both are pinned by [`units/mist-freenet/freenet02-browser-get-live.test.ts`](../units/mist-freenet/freenet02-browser-get-live.test.ts), which is opt-in — it needs a real node, so it skips unless `FREENET_LIVE_WS=1`:

```bash
adb forward tcp:17509 tcp:7509    # only if the node under test is the tablet's
FREENET_LIVE_WS=1 FREENET_WS_URL=ws://127.0.0.1:17509/v1/contract/command \
  npm test -- units/mist-freenet/freenet02-browser-get-live.test.ts
```

**Not yet done on hardware:** a real end-to-end join — owner publishes, tablet resolves the short ticket and pulls the farm. That needs a farm published from a laptop and a few minutes for Opennet to spread it (§8b).

---

## 4. What the hub option actually needs

The hub is a PUF-AM desktop that already runs a bundled node. Two things used to stand between that and a tablet using it, both recorded as deferred work in [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) §14 item 9. **Both are now closed** — see desktop plan §6.4 for the design and the live verification.

| Former blocker | How it was closed |
|---------|--------|
| **The desktop API is loopback-only** | A *second* listener ([`desktop/lanApi.ts`](../desktop/lanApi.ts)) binds `0.0.0.0:3000` when the operator enables the tablet hub in Settings. `localApi.ts` still binds `127.0.0.1` on its ephemeral port and still serves the desktop UI — the two listeners are separate apps with separate trust levels |
| **The loopback token would 401 a tablet** | The tablet never sees that token, and should not. It gets its own: an 8-character pairing code shown on the laptop is exchanged once at `POST /api/hub/pair` for a per-device token sent as `x-puf-hub-token`. Revocable per device, rotatable without unpairing anyone |

The authorisation question this section originally left open — "the obvious candidate is the farm bearer that `/api/sync/*` already uses" — was answered the other way. A farm bearer identifies a *farm*, so it cannot be revoked for one lost tablet, and it says nothing about whether the operator meant this laptop to serve the network at all. A per-device token issued from a code the operator can read out across a shed does both.

The LAN listener serves an allowlist — `/api/sync/*`, `/api/presence/*`, `/api/highlights/*`, `/api/mist/freenet/*` — and answers `/api/auth/*` and `/api/weather/*` with a 404 that says those come from the cloud, so a tablet routes them correctly instead of treating the hub as broken. It does not serve the UI bundle at all.

The workshop escape hatch still works unchanged: an APK built with `VITE_MIST_FREENET_API` pointing at `MIST_FREENET=1 npm run dev`. That server answers `/api/hub/info` with `kind: 'workshop-dev'` and `pairingRequired: false`, so the tablet skips pairing against it exactly as before.

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
| `android-local-node` | Capacitor **and** a Freenet node answering on this device's `127.0.0.1:7509` | Joining and pulling, off this device's own node. **Sending disabled** unless a hub is also paired — see §3b |
| `android-hub` | Capacitor **and** a hub — `VITE_MIST_FREENET_API` baked in, or one found at runtime | Allowed — there is a machine on the other end, so let them try it |
| `android-no-host` | Capacitor, no hub | **Blocked with an explanation** |

A node on this device outranks a hub, and outranks it even when both are present: it needs no pairing, no shed Wi‑Fi, and nothing left running on someone else's laptop. The hub stays in the picture for the two things loopback cannot do — publishing, and answering for a blob this device's node has not found yet.

A hub found at runtime counts the same as one baked in. Requiring `VITE_MIST_FREENET_API` meant re-building the APK for every shed the tablet visited; NSD discovery and the address field in *Offline & sync* reach the same routes on the same machine, so `detectFreenetRuntime()` treats them alike and the card re-reads the answer once the lookup settles.

Blocking is deliberate rather than cosmetic. A `Connect` button on a tablet with no node does not fail loudly — it used to fetch `http://10.0.2.2:3000`, the Android **emulator's** alias for the dev machine's loopback, which on real hardware is an unroutable address that hangs until the TCP connect gives up and then surfaces as a bare `TypeError: Failed to fetch`. An operator in a paddock reads that as bad signal and goes looking for a hill. That fallback is gone: `getApiBaseUrl()` answers `''` on a packaged APK until a hub is actually found, `apiFetch()` names the address it could not reach, and the emulator alias is used only when a probe confirms something is listening. The gate is still checked *before* peer status, the status poll is still skipped, and the readiness line says the true thing:

> Freenet does not run on this tablet — the farm is held here, but sending and joining need a PUF-AM laptop.

`android-hub` exists so the workshop can still point an APK at a real node without the app pretending. Covered by [`tests/freenetRuntime.test.ts`](../tests/freenetRuntime.test.ts).

---

## 7a. The join slot does not put a tablet on Freenet — *superseded by §3b*

> **Superseded 2026-08-09.** This section's conclusion held for a tablet with nothing on it but PUF-AM, which was every tablet when it was written. It is wrong for a tablet with the sideloaded node app: the "impossible" rows below are now the ordinary path, run by the page against `127.0.0.1:7509`. Kept because the reasoning is still exactly right about *why* — a join needs **a** Freenet node, and the only thing that changed is that a tablet can now have one. Everything below remains true of a tablet without the node app.

The slot contract ([`MIST_TWO_FEDORA_FREENET.md`](MIST_TWO_FEDORA_FREENET.md) § Freenet slot contract) lifts one requirement and one only: a joiner no longer needs to be on the **owner's** Wi-Fi. It still needs a Freenet node, and §2 blocker 3 says a tablet cannot have one. Worth stating flatly, because "join from anywhere" invites the opposite reading:

| Step of a join | Where it runs | Tablet, no hub, no node app | Tablet with the node app (§3b) |
|---|---|---|---|
| Ticket → manifest, LAN shelf | Owner's Express | Impossible | Impossible — and not needed |
| Ticket → manifest, Freenet slot | `GET /api/mist/freenet/slot/:id` on **a** node | Impossible | **Works** — the page GETs the slot off `127.0.0.1:7509` |
| Manifest → Hot + bones ciphertext | `/api/mist/freenet/hot|bones/pull-by-uri` on **a** node | Impossible | **Works** — same client, by FN02 URI |
| Ciphertext → farm | The page, in the WebView | Fine | Fine |

Only the last row was client-side. There is **no lightweight or WASM Freenet client in the web bundle** and there is nothing to write one against (§3 option D: Freenet's transport is UDP) — that part has not changed, and a peer in the page is still out. What §3b adds is not a peer but a *client*: the page drives someone else's peer over loopback. So the useful distinction is no longer "can this tablet reach a PUF-AM hub over IP at all"; it is **is there a Freenet node this tablet can reach, here or across the shed**. A laptop reachable across a VPN or a hotspot serves a tablet exactly as a shed laptop does; a tablet alone in a paddock now joins if — and only if — the node app is on it.

For an off-Wi-Fi POC on a tablet *without* the node app the honest shape is therefore: **the laptop joins over Freenet, the tablet joins from the laptop.** Laptop B recovers its FarmCode and resolves the ticket through its own bundled node with no sight of laptop A; the tablet then gets that farm from laptop B over the LAN, or over the same `.pufom` export by hand.

### Two bugs this turned up

**`peer/start` ran before every resolver.** [`MistJoinTicketGate`](../src/components/MistJoinTicketGate.tsx) `await`ed `POST /api/mist/freenet/peer/start` at the top of `join()` and let it throw. A tablet holding a remembered hub it could no longer reach therefore failed the join on the peer *warm-up*, and never called a single resolver — including the LAN one, which needs no Freenet at all. The start is now a best-effort courtesy inside `try`/`catch`, skipped entirely when `detectFreenetRuntime()` says there is no node to start, and the gate shows §7's no-host sentence instead of a `Connect Freenet` button.

**A remembered hub was never re-validated.** `pufom_last_sync_hub` survives `adb install -r`, so a hub saved by an older APK — before the address field probed anything — outlived the build that wrote it. `getApiBaseUrl()` handed it straight to `fetch()`, and an address that is not a URL (`192.168.1.1205:3000`, a fourth octet typed one digit long) rejects with the same bare `TypeError` as an unplugged laptop, so the tablet reported "could not reach" an address it could never have reached. Reads and writes of that value now go through `normalizeHubBase()` ([`tests/apiBaseHubBase.test.ts`](../tests/apiBaseHubBase.test.ts)).

---

## 8. Phased order, if this is picked up

| Phase | Work | Blocked on |
|-------|------|------------|
| **0 (done)** | Mist chooser in the APK; honest gate; build scripts | — |
| **1 (done)** | Tablet gets farms over the **existing LAN path** — NSD hub discovery, `.pufom` sync, join-ticket LAN resolve. No Freenet | — |
| **2** | Desktop LAN listener for `/api/mist/freenet/*`; tablet points at it; runtime becomes `android-hub` for real | **Listener done** (desktop plan §6.4) — per-device tokens rather than the farm bearer this row first assumed. `/api/mist/freenet/*` is in the LAN allowlist, so the remaining work is tablet-side: make `detectFreenetRuntime()` report `android-hub` off a *paired* hub |
| **3** | `RemoteFreenetHost` implementing `FreenetHostPlugin` against a hub, so the tablet reports `attached` through the same interface | Phase 2 |
| **4a (done)** | **Reader beside a sideloaded node** — browser-side GET client, `android-local-node` runtime, slot resolve and Hot/bones pull off `127.0.0.1:7509`. Join with no hub | — · built and device-verified, §3b |
| **4b** | **Publishing from a tablet** | `fdev` removal — native-protocol PUT in TypeScript, the same item as desktop plan §4.3. Until then a tablet reads and a laptop sends |
| **4c** | On-device peer inside our APK (option C) | **Still rejected**, now on AGPL linkage as much as toolchain cost. §3b's two-app shape is what made it unnecessary |
| **5 (done)** | **Farm gateway** — the paired hub at a remembered non-LAN address, so a tablet joins and syncs with **no node app on it and no laptop on its Wi‑Fi** | — · built, §8d. Makes phase 4a's sideloaded node the power-user option rather than the requirement |
| **6** | TLS a farmer can complete, then (later) a hosted relay for farms with no always-on machine | §8d Phase 2 / Phase 3 |

---

## 8b. Joining on a tablet that has the node app

No hub, no pairing, no laptop on the Wi-Fi. What the operator does:

1. **On the tablet**, install and open the Freenet Android node app (§3a). Leave it until it says it is connected — it is a foreground service, so it keeps running behind PUF-AM. Peers take a minute or two on a cold start.
2. **On the laptop**, send the farm as usual and read out the short ticket (`PUF-K7M2-9Q4X`).
3. **On the tablet**, open PUF-AM and recover the farm with its FarmCode. The join screen should say *"Reading Freenet from the node on this tablet — no laptop needed to join."* If it does not, the node app is not answering yet — open it, wait, and come back; the probe re-asks rather than needing an app restart.
4. Type the ticket and **Join this farm**.

Two things worth telling an operator up front, because both look like faults and neither is:

- **A ticket takes a few minutes to become findable.** The owner's publish has to spread across Opennet before this tablet's node can find it. "The Freenet node on this device has not found that ticket yet" means *wait*, not *wrong ticket*.
- **Sending is off on this tablet.** Publishing goes through `fdev`, which is a laptop binary (§2 blocker 4, phase 4b). The tablet reads farms; a laptop sends them. Pair a hub and sending comes back, because that laptop has `fdev`.

**Not yet proven on hardware.** Every layer below the join has been exercised on the SM-T545 (§3b), but a full owner-publishes-then-tablet-joins run has not been done: it needs a farm published from a laptop and the Opennet wait above. That is the one remaining test before this is worth putting in front of a farmer.

---

## 8c. Freenet on a tablet without the operator ever opening the node app

§8b step 1 tells the operator to "install and open the Freenet Android node app". That is the step worth deleting: an operator who has to open a second app to make the first one work will decide the first one is broken. Read of [`manikmakki/freenet-android-node`](https://github.com/manikmakki/freenet-android-node) at `main` (2026-08-09) says most of the deletion needs no code from us.

**What the node app already exposes.**

| Surface | Manifest | Consequence for PUF-AM |
|---|---|---|
| `MainActivity` | `exported="true"`, LAUNCHER | We can bring it to the foreground with a launch intent. That is the only cross-app lever we have |
| `NodeService` | **`exported="false"`**, `foregroundServiceType="specialUse"`, `stopWithTask="false"` | Its `START_NETWORK` / `RECONCILE_POLICY` actions exist (`org.freenet.androidnode.action.*`) but **another app cannot send them**. No bound service, `onBind` returns `null` |
| `NodePolicyReceiver` | `exported="false"`, `BOOT_COMPLETED` + `MY_PACKAGE_REPLACED` | Restores the node after a reboot or an app update, unattended |
| `NodePolicyRepository` | Persisted `power` = `Manual` / `Charging` / `Always (best effort)`, plus `UnmeteredOnly` / `AnyValidated` | The boot restore only fires when `power != Manual` and the alpha disclaimer has been accepted |

**So the zero-code answer is a setting on the tablet, not a feature in PUF-AM.** Accept the disclaimer once, set power policy to *Always (best effort)* (or *Charging* for a cradled cab tablet), and the node runs as a foreground service from boot forever after. `stopWithTask="false"` means swiping the node app away does not stop it. PUF-AM's existing `probeLocalFreenetNode()` finds it exactly as it does today. Nothing in this repo changes; the operator sets up the tablet once and then only ever opens PUF-AM.

**The residual gap is recovery, and it is small.** If the node is not running — policy left on Manual, the operator force-stopped it, Doze killed it — PUF-AM can do nothing but say so. The honest fix is a launch intent: a ~20-line Capacitor plugin calling `packageManager.getLaunchIntentForPackage("org.freenet.androidnode")`, wired to a **Start Freenet** button that appears only when the probe fails and the package is installed. It bounces the operator to the node app for a second rather than sending them to find it. `canOpenUrl`-style package detection also lets the copy distinguish *not installed* from *installed but asleep*, which today reads as the same sentence.

**Ranked, with what each buys:**

| | Option | Cost | Verdict |
|---|---|---|---|
| 1 | **Node-app power policy + boot receiver** (above) | A paragraph of setup doc, one copy change in `freenetLocalNode.ts` | **Do this.** It removes the "open the node app" step outright, this week, with no code |
| 2 | **Launch-intent fallback in PUF-AM** | Small Capacitor plugin + a conditional button | Do after 1, once the field pass shows how often the node is actually down |
| 3 | **Fork the node app so the service is startable** — export `NodeService` behind a signature/custom permission, ship as our own APK | Owning a fork of a one-author alpha that ships releases weekly | Defer. AGPL is *not* the objection here (separate process, we would publish the fork); the maintenance is |
| 4 | **JNI embed in `com.sentinut.farm`** (§3 option C) | AGPL linkage, ~100 MB, Doze and battery work | **Still rejected**, unchanged. §3a's linkage argument stands; the third-party app only proves the embed is *possible*, which is an argument for option 3 over this one, not for this one |
| 5 | **Stay hub-dependent** (§8a) | None | Keep as the fallback it already is. Publishing still needs it — `fdev` is a laptop binary (§8 phase 4b) |

Options 1 and 2 leave the two-app shape, the loopback WebSocket, and the licensing position exactly as §3b froze them.

---

## 8d. Seamless Freenet on a tablet — the farm gateway (built 2026-08-10)

**Status:** slice 1 built. Ladder, address rules, credential reuse, Settings card, tests.
**The requirement:** a farm worker with a tablet never installs, opens, or hears about a separate Freenet node app. §8b and §8c made that step *smaller*; this deletes it.

### The problem, stated exactly

A tablet cannot host a Freenet node (§2, four independent blockers). So something else must speak Freenet on its behalf, and that something already exists and is field-proven: **the desktop LAN hub**. It relays `/api/mist/freenet/*` off a real node, it has `fdev` for publishing, and it holds the join-manifest shelf. Its one deficiency was never capability — it was **reach**. The hub was findable on the shed Wi‑Fi and nowhere else.

That single gap is what pushed a tablet towards the sideloaded node app, and it is the reason §8b's operator instructions begin with "install and open the Freenet Android node app". A tablet in a paddock, in the ute on the road, or at a worker's house had no gateway at all.

### The options, honestly

| | Option | Works today | What it costs | Verdict |
|---|---|---|---|---|
| **A** | **LAN hub as the Freenet gateway** — the tablet's join and sync ride the paired laptop's node | **Yes, shipped** | Nothing new | **Rung 1.** Fastest, free, no internet. Its limit is exactly one thing: a laptop has to be on this Wi‑Fi |
| **B** | **The farm's own always-on gateway over the internet** — the shed PC reached from anywhere | **Yes, as of this slice** | An address (Tailscale/VPN), and a real answer to TLS | **Rung 2, and the answer to the product requirement.** The farm already trusts this machine and already runs the software; nothing is added to the tablet, and no third party is introduced |
| **C** | **PUFworks-hosted relay** (`pufworks.farm`) — George runs an authenticated Freenet gateway; tablets fall back to it | No | A service to run, a bill, and farms' ciphertext passing through infrastructure we own | **Phase 3, and deliberately last.** See the philosophy note below |
| **D** | **Sideloaded node on the tablet** (§3a/§3b) | Yes | An operator installs a stranger's alpha and manages its battery policy | **Keep as the power-user path**, documented, no longer required. It is also the only path that needs no other machine awake at all, which is why it stays |

**Why B over C, given C would be more seamless still.** Two reasons, and the second is the one that decides it. The billing philosophy: PUF-AM's Freenet path exists so a farm does not have to keep its records in someone else's cloud, and a PUFworks relay would put every tablet's traffic back through a machine PUFworks owns and pays for — reintroducing exactly the dependency and the running cost the Freenet pipe was chosen to remove (`SETTINGS_SYNC_AND_CREW.md` §6). And liability: a relay that holds a farm's sealed traffic is a thing that can be subpoenaed, breached or switched off, and telling farmers "your farm is not in anyone's cloud" while routing it through ours would be untrue. B keeps the trust boundary where the farm already put it: the machine in their own shed.

### The ladder (frozen)

Gateway selection — which machine answers this tablet's `/api/*`, including the Freenet relay routes:

| # | Rung | Where | Why here |
|---|------|-------|----------|
| 1 | **A hub on this Wi‑Fi** — NSD, or an address typed once | `syncHub.ts` | Seconds, free, works with no internet at all |
| 2 | **The farm gateway** — the same hub at a remembered non-LAN address | `farmGateway.ts` | The tablet is not at the farm. Same machine, same token, same routes |
| 3 | **A Freenet node on this device**, if one has been sideloaded | `freenetLocalNode.ts` (§3b, unchanged) | Needs no other machine awake. Reads only — `fdev` is a laptop binary |
| 4 | An error naming what was tried | — | Never a bare "Failed to fetch" |

**Rung 3 is not demoted by this slice.** For a *Freenet read* — slot resolve, Hot/bones pull — a node on this device still goes first, exactly as §3b froze it: no pairing, no Wi‑Fi, nothing left running on someone else's laptop. Rungs 1 and 2 answer a different question ("which hub is this tablet's gateway"), and the local node is not a hub. The two ladders meet where §3b said they would: a local node that has not found a blob yet degrades to *whichever* hub the gateway ladder settled on, which is now sometimes the shed laptop over a VPN.

**A gateway does not outrank LAN discovery**, even though it is the operator's own typed address and a chosen hub normally does. It is the *same laptop* reached the long way — out through a VPN, over somebody's upload speed, possibly on mobile data. Standing next to the laptop, that would be slower and metered for no gain. `hubLadderOrder()` therefore demotes a gateway that happens to be the current base below discovery, and only then gives it its turn.

### What shipped

| File | Job |
|------|-----|
| [`src/lib/farmGateway.ts`](../src/lib/farmGateway.ts) | **New.** Address classification (what is accepted and refused, and why), the remembered gateway, `gatewayIdentityChanged()` |
| [`src/lib/syncHub.ts`](../src/lib/syncHub.ts) | `hubLadderOrder()` (pure), the gateway rung, `useFarmGateway()`, `clearFarmGateway()`, the identity guard |
| [`src/lib/hubIdentity.ts`](../src/lib/hubIdentity.ts) | `adoptHubCredentialByHubId()` — one laptop reachable two ways is **one** pairing |
| [`shared/sync/hubInfo.ts`](../shared/sync/hubInfo.ts) | `HubInfo.hubId`, optional, explicitly **not** an authenticator |
| [`src/lib/autoSync.ts`](../src/lib/autoSync.ts) | `SyncPeerState: 'reachable-remote'`, `SyncVia: 'gateway'`, operator copy |
| [`src/components/sync/FarmGatewayCard.tsx`](../src/components/sync/FarmGatewayCard.tsx) | **New.** One address field, status chip, the refusal explained before it happens |
| [`desktop/lanHubAuth.ts`](../desktop/lanHubAuth.ts) | `isPairableRemoteAddress()` (moved out of `lanApi.ts` so it is testable) now admits CGNAT; `mintHubId()` |
| [`desktop/lanApi.ts`](../desktop/lanApi.ts), [`desktopPrefs.ts`](../desktop/desktopPrefs.ts), [`main.ts`](../desktop/main.ts) | Serve a persistent `hubId`; pair over the farm VPN as well as the LAN |

Tests: [`tests/farmGateway.test.ts`](../tests/farmGateway.test.ts) (the address rules, including every refusal), [`tests/farmGatewayLadder.test.ts`](../tests/farmGatewayLadder.test.ts) (rung order, credential reuse, and that the token authorises over the remote base and still goes nowhere else), plus the new rung in [`tests/autoSyncLadder.test.ts`](../tests/autoSyncLadder.test.ts) and the address/identity cases in [`tests/lanHubAuth.test.ts`](../tests/lanHubAuth.test.ts).

Nothing on the wire changed. Same `x-puf-hub-token`, same routes, same `LAN_SCOPE_PREFIXES`. The hub does not know which of its addresses a request arrived on, and does not need to.

### Security posture — stated plainly

**The hub speaks plain HTTP and this slice does not change that.** `x-puf-hub-token` is a bearer credential. On the shed LAN that is a stated, accepted risk (§10 — "treat the farm LAN as the trust boundary"). Across the internet it is not, and "we documented it" is how that becomes "we shipped it". So the rule is **enforced in code, not written in a warning**:

| Address | Verdict |
|---|---|
| `https://gateway.example` | accepted — TLS carries the token |
| `http://100.101.102.103:3000` (Tailscale, CGNAT) | accepted — the tunnel is the encryption |
| `http://laptop.tailnet-1a2b.ts.net:3000` | accepted — MagicDNS, same tailnet |
| `http://192.168.1.20:3000` | accepted, and the card says it only answers on that network |
| `http://farm.duckdns.org:3000` | **refused** |
| `http://203.0.113.9:3000` | **refused** |

The refusal names both ways out — a VPN address, or TLS — because an operator told only "no" will port-forward plain HTTP and believe that is what we meant. `classifyGatewayAddress()` is the single place this lives, and `readFarmGateway()` re-applies it on the way *out* of storage, so tightening the rule later also applies to gateways already saved on a tablet (the `pufom_last_sync_hub` lesson, §7a).

**What the VPN rung actually buys, and what it does not.** It buys transport encryption and authenticated peers on the path, which is what makes the bearer token safe to send. It does not make the hub itself authenticated to the tablet: with no TLS there is no server identity, so anything that can occupy the address can collect the token. Two bounds, both partial and both worth naming:

- **`hubId` is not authentication.** It is served unauthenticated beside the rest of the handshake, so it can be read by anything that reaches the port and claimed by anything that answers on one. Its only job is to stop this tablet handing a token minted for *one* laptop to a *different* PUF-AM by mistake — a reassigned DHCP address, a moved port forward, a second install on the same tailnet. That is the ordinary version of the problem, not the adversarial one. If the identity at a saved gateway changes, the pairing is **dropped** rather than the token sent on, and the operator is asked for a code.
- **The trust decision is the operator typing an address they own**, exactly as it already is for a LAN address. Nothing is adopted from discovery.

Unchanged and still true: pairing controls *who may call the hub*, not who may listen; the LAN sealed shelf carries **ciphertext only** and is unauthenticated per farm by design (`SETTINGS_SYNC_AND_CREW.md` §9), so a gateway relays farm bytes it cannot read; a role is bookkeeping, not enforcement (§3 of the settings plan). New and worth saying: over a gateway the sync **may use mobile data**, so the card and the ladder say so rather than leaving an operator to find out from a bill.

**Pairing over the VPN.** `POST /api/hub/pair` refused everything outside RFC1918 and loopback, which would have 403'd a first pairing from a tailnet. It now admits `100.64.0.0/10` and unique-local IPv6 as well. That is carrier-grade NAT space, so in principle an ISP could place a stranger there — but only on an interface this listener is bound to, the code still has to be read off the laptop's screen, and failures are still throttled per client.

### What Phase 2 and Phase 3 look like

| Phase | Work | Turns this into |
|-------|------|-----------------|
| **2 — TLS the farm can actually complete** | An `https://` gateway a farmer can set up without being a sysadmin: Tailscale Serve (a real cert on a `.ts.net` name, one command) first, since the tailnet is already the recommended path; then a documented reverse proxy for a farm with its own domain. Optionally pin the hub's certificate on the tablet at pairing time, which would give the server identity the VPN rung does not | The two refused rows above become accepted, and a port-forwarded gateway stops being a bad idea |
| **2b — publishing without a laptop awake** | Nothing new here: an always-on shed gateway *is* the publish path, because `fdev` is on it. What is missing is the copy and the ladder telling an operator that "send this farm" now works from a tablet in a paddock (it does, through the gateway) | Deletes the last "needs a laptop" sentence for a farm with a shed PC |
| **3 — PUFworks-hosted relay** | A thin authenticated gateway on `pufworks.farm` as the last rung, for farms with **no** always-on machine. Needs: an auth model that is not a shared bearer, a stated retention policy (relay-only, no storage), a cost ceiling, and an honest answer to "why is my farm going through your server" | Removes the last requirement for a second machine. Kept last deliberately — see the philosophy note above |
| **3b — mesh / Reticulum** | The rung *below* Freenet for devices with no shared Wi‑Fi and no internet: LoRa/RNode multi-hop, ciphertext only, record-level deltas rather than a whole bundle (`MIST_NETWORK_STORAGE.md`; `SETTINGS_SYNC_AND_CREW.md` §9). The gateway concept survives it unchanged — a mesh peer is another way to reach a hub, so it lands as a new `SyncPeerState` and a new rung, not a rewrite | A paddock with no coverage at all |

### Operator setup, once

**On the farm machine** (the shed PC or the laptop that stays home): PUF-AM running, *Settings → Tablet hub* on — it is on by default — and the machine on the farm's VPN. Read off its VPN address and the pairing code.

**On the tablet:** *Settings → Sync → **Farm gateway*** → type the address → **Save**. If the tablet has already paired with that machine on the shed Wi‑Fi, it is done — the pairing is reused and nothing else is asked. If it has never been on that Wi‑Fi, it asks for the pairing code once.

After that the tablet decides for itself: the shed Wi‑Fi when a laptop is on it, the gateway when none is. No Freenet app, no second icon, nothing to open.

---

## 8a. Putting a tablet on a hub

The tablet holds its farm locally either way; this is what it needs before push, pull or join will work. **The AppImage now does this** — no repo, no terminal, no `npm run dev`.

**On the laptop.** Run the AppImage, then:

1. *Settings → **Tablet hub*** → turn on **Serve tablets on this Wi‑Fi**.
2. The card shows the **pairing code** (`ABCD-2345`) and the LAN address it is serving on (`http://192.168.1.20:3000`). Both are worth reading out loud; the address is the fallback if the tablet cannot discover it.
3. Leave the app running. That is the hub.

The toggle is off until you set it, because binding an address the whole shed can reach should be a decision rather than a side effect of opening the app. Turning it on starts a second listener on `0.0.0.0:3000` (next free port if something holds it) and advertises `_pufom-sync._tcp`. The desktop UI keeps using its own loopback port exactly as before.

**On the tablet.** Same Wi‑Fi, open PUF-AM:

1. *Settings → **Offline & sync***. It looks for a hub on open and at launch.
2. If discovery is blocked — some phone hotspots and guest networks drop multicast — type the laptop's address into the field (`192.168.1.20:3000`) and press **Use**. It is probed before it is accepted, so a wrong address says so immediately.
3. A packaged hub answers "found it, now pair". Enter the code from the laptop and press **Pair**. Case and the dash do not matter: `abcd2345` works.
4. It confirms *"Paired with PUF-AM (name) as 'device'. Push, pull and join now work through it."* The card then shows **Paired with …** on every later visit — this is once per tablet, not once per session.

Once paired, push, pull, join-ticket resolve and the Freenet routes all go through the laptop. *Farm sync between laptops* stops showing the no-node label and **Connect** borrows the laptop's Freenet node over the LAN.

**If a tablet is lost or a code gets overheard**: *Tablet hub* lists every paired device with a **Forget** button, and **Rotate code** issues a new pairing code without disturbing tablets that already paired.

A `npm run dev` server still works as a hub and still needs no pairing — it reports itself as a workshop hub, and the tablet skips straight past step 3.

Two things that bite on a laptop with more than one interface up:

- **mDNS host naming.** `bonjour-service` defaults the SRV target to a bare `os.hostname()` with no `.local`. Android's NSD reports `SERVICE_RESOLVED` and then hangs in `getaddrinfo` on a name it will not query over multicast, so the tablet's scan returns nothing having just seen the hub. `mdnsHub.ts` therefore publishes as `pufom-<hostname>.local` — prefixed because `avahi-daemon` already owns `<hostname>.local`, and a second A record for it is a conflict that costs the name entirely.
- **Which address gets advertised.** With USB tethering up, the A record can carry the tethering address rather than the Wi‑Fi one. `listLanIpv4()` now *ranks* interfaces so Wi‑Fi and wired addresses beat tethering, `docker`/`virbr` bridges and link-local, and the winner is what goes in TXT (`ip=`). The NSD plugin passes TXT through, and `nsdPeers.ts` prefers it and probes each candidate before settling. The desktop hub also re-checks its address periodically and republishes when it changes, which a laptop carried between house and shed does constantly.

---

## 9. Out of scope

Freenet host on Android · bundling `freenet` / `fdev` in the APK · linking `freenet-core` into `com.sentinut.farm` (§3a, §8 phase 4c) · **publishing from a tablet** (§8 phase 4b) · shipping or endorsing the third-party node app, which the operator sideloads themselves · `contribute_storage` on mobile (frozen off — [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) § Mobile peer policy) · Play Store distribution or signing · renaming `com.sentinut.farm` · Reticulum on Android · changing the `FreenetHostPlugin` interface.

§3b deliberately does **not** implement `FreenetHostPlugin`. The browser GET client is a reader, not a host: it cannot `start`, `stop` or `putCiphertext`, and pretending otherwise would put a `managed`-shaped object in front of a node PUF-AM does not own. Phase 3's `RemoteFreenetHost` is still the place that interface gets an Android implementation.

---

## 10. Risks

| Risk | Position |
|------|----------|
| Mist UI ships on tablets without a way to sync off-device | Mitigated by §7 — the app says so on the chooser, the sync card, and the workshop card. It does not offer a button |
| Operator reads "Offline Freenet network" as working Freenet | The chooser copy on a tablet says the farm stays on the device. Wording is the mitigation; watch it in the first field pass |
| A mist farm created on a tablet becomes stranded | The FarmCode is minted and shown once as on any device, so the farm is recoverable — but there is no publish target until §8 Phase 1/2. Treat a tablet-created mist farm as workshop-only for now |
| `VITE_MIST_EXPERIMENTAL` silently missing from a build | `grep` check in §6.3; the flag is defaulted in the script rather than passed by hand |
| Hub relay leaks the desktop loopback token to the LAN | **Closed** — the LAN listener is a separate app with its own credential (`x-puf-hub-token`, per device) and never sees `x-puf-desktop-token`. Desktop plan §6.4 |
| Anyone on the shed Wi‑Fi can read a paired tablet's traffic | **Open, by design for now** — the hub speaks plain HTTP. Pairing controls *who may call it*, not who may listen. TLS needs a certificate story a farmer can complete; until then treat the farm LAN as the trust boundary |
| The same plain HTTP, but across the internet, once a hub is reachable remotely | **Closed by refusal, not by warning** (§8d) — a gateway address is accepted only over TLS or on a private/VPN network, and the rule is re-applied to already-saved gateways on read. A DDNS name or public IP over `http://` is refused with both ways out named |
| No server identity on a gateway without TLS, so whatever holds the address collects the token | **Open, and bounded rather than closed** — the VPN authenticates the path, the operator typing the address is the trust decision, and `hubId` catches the *accidental* version (reassigned address, second install) by dropping the pairing instead of sending the token. Real server identity is §8d Phase 2 |
| A tablet on the gateway quietly using mobile data | **Open, and said out loud** — the sync card and the ladder both name it. The unattended attempt is one `meta` request when nothing changed; a changed farm uploads the sealed bundle |
| Any app on the tablet can drive the node on `127.0.0.1:7509` | **Open, and not ours to close** — the node app's WS port has no auth (§3a). It bounds what the arrangement is worth, not whether it works: everything PUF-AM puts through it is ciphertext, the manifest is AEAD-sealed and the slot signature is checked in the page, so a hostile local app can waste our GETs but cannot read a farm or forge one |
| We depend on one person's alpha, and on its release cadence | **Open** — the node app tracks upstream closely and is self-described as battery-hungry. Mitigated by the shape rather than by trust: it is a separate package the operator installs, the feature degrades to the hub when it is absent, and `freenetLocalNode.ts` is the only file that would need to change for a different node app |
| Node runs 0.2.123 against our 0.2.119 pin | **Checked, narrowly** — the GET path handshakes and answers correctly across both (§3b). Contract *code hashes* are still unverified across the version gap, so a cross-version join is not yet trusted end to end; that is the §8b test |
