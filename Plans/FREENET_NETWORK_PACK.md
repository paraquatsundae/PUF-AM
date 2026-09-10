# Freenet network pack — the app's own Freenet client, on every shell that can run one

**Status:** Plan written 2026-09-10. No code yet. Supersedes the direction in the docs listed under § Supersedes.
**Experimental — not production.** Firebase Auth + invite PIN remains the shipping cloud path; this plan adds Freenet beside it, not instead of it.
**Product:** PUF-AM · **Scope:** a `freenet_host` network pack enabled per farm like a crop pack, with a bundled Freenet 0.2 node behind one host interface on desktop and Android, native PUT on every shell, and a hybrid mode where cloud-hosted farms mirror to Freenet.

Related: [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) (Android host, becomes Phase 3 here) · [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §8–§9 · [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md) · [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) · [`FIREBASE_BILLING.md`](FIREBASE_BILLING.md) · [`NAMING.md`](NAMING.md) §1 · reference: [`reference/DESKTOP_FREENET_PLUGIN.md`](reference/DESKTOP_FREENET_PLUGIN.md), [`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md), [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md)

---

## 1. Goal

Two people each download PUF-AM, install it, enable the Freenet pack on a farm, and their two installs exchange that farm's data — no second application, no laptop acting as hub, no PUFworks server in the data path. This must hold for desktop↔desktop, tablet↔tablet, and desktop↔tablet. The hosted web app at `am.pufworks.farm` cannot run a node and is out of this goal.

What "exchange" means: create a farm on A (cloud or Freenet-native), Send; B joins with the FarmCode and a short ticket; B sees A's records; later edits flow the same way. Internet is assumed at both ends — Freenet 0.2 is Opennet, both nodes reach the network through gateway peers and meet by content address. Same-Wi-Fi-without-internet stays the job of the sealed `.pufom` LAN shelf (`SETTINGS_SYNC_AND_CREW.md` §9, auto-sync rung 1).

## 2. Decisions — 2026-09-10

| # | Decision | Value | Replaces |
|---|----------|-------|----------|
| 1 | PUT path | **Native bincode PUT from the app's own WS client on every shell.** `fdev` is removed from the desktop bundle. `BrowserFreenetPutClient` / `BrowserFreenetSlotClient` (`units/mist-freenet/src/freenet02-native-*.ts`, spike GO 2026-08-15) become the only publish path | `reference/DESKTOP_FREENET_PLUGIN.md` §4.1/§4.3 ("drop fdev … blocked"); `freenet02-fdev-*.ts`; `mistFreenetRoutes.ts` `slot/publish` via fdev |
| 2 | Host seam | **`FreenetHostPlugin` (`units/puf-freenet-host/src/types.ts`) is the data path**, not just the supervisor. The pack calls `start / stop / status / putCiphertext / getCiphertext`; each shell supplies an adapter. Express `/api/mist/freenet/*` survives only as the LAN relay for paired tablets that have no node | Today's Express → `FreenetPeer` → transport path that bypasses the interface |
| 3 | Android process shape | **Isolated `android:process=":freenet"` + loopback WS, same APK.** This is the decision that supersedes `reference/APK_FREENET_PLUGIN.md` §3a's rejection of an in-APK node; `APK_FREENET_HOST.md` Frozen decision 4 already states it, this line makes the supersession explicit | `APK_FREENET_PLUGIN.md` §3a, §8c row 4 |
| 4 | Node version pin | **One version for all shells, and a policy rather than a number.** Freenet-core ships every 3–7 days (v0.2.125 on 2026-08-13 … v0.2.134 on 2026-09-06 at the time of writing) and an old node is refused by the network with exit 42; pinning a number in a plan would be stale before Phase 2. Rule: at the start of Phase 2, pin the **latest release**, run the native PUT and slot live checks against it as Phase 2's first step, and rebuild + re-pin the slot contract once. Desktop stays on 0.2.119 until then. **Last verified for native PUT: 0.2.125** (2026-08-15). The 0.2.119 check `APK_FREENET_HOST.md` asked for was not run — no node binary is present on the dev machine and 0.2.119 is superseded; it is replaced by the Phase 2 check. No official Android asset exists in any release (`aarch64-unknown-linux-musl` is not bionic), which is why Phase 3 has its own build chain. Existing slots expire with their 7-day tickets, so re-pinning migrates no slot state | `scripts/freenet-binaries.json` 0.2.119 / fdev 0.3.281; `APK_FREENET_HOST.md` L85 "try against 0.2.119 and 0.2.123" |
| 5 | Hosted web | **Hidden.** `deploy-cloudrun.mjs` stops baking `VITE_MIST_EXPERIMENTAL=true`; the login Freenet option and the pack tile key off host capability, not a build flag. `MIST_FREENET_DISABLED=1` becomes unnecessary and is dropped | `deploy-cloudrun.mjs:228`, `useLoginFlow.ts` `freenetOptionState`, `MIST_TWO_FEDORA_FREENET.md` § Production UI (Phase 10b sidecar) |
| 6 | Enable scope | **Per farm, in the farm's plugin settings, like a crop pack.** A device starts its node when any open farm has the pack enabled and the shell has a host adapter; one node serves every farm on the device; a shell without an adapter shows the pack as *not available on this device* | `pufam.farmStoreBackend` device-level choice as the only switch |
| 7 | Hybrid | **Cloud-hosted farms can enable the pack.** Firestore stays authoritative while reachable; Freenet holds a sealed mirror plus the join/recovery plane. See §3 | `farmPipes.ts` cloud XOR Freenet |
| 8 | Vocabulary | **Network pack.** Catalog `kind: 'system'`, id `freenet_host`, category `network`, unchanged. Never "Freenet plugin" (`NAMING.md` §1) | — |

## 3. Hybrid — a cloud farm with Freenet enabled

### 3.1 Identity

A hybrid farm has two ids: the Firestore farm id (authority, roles, PIN) and a mist FarmId derived from a FarmSeed (`HKDF(FarmCode, "pufam-mist-v1", "farm-seed")` → `"farm-id"`), minted when the pack is first enabled. The Firestore farm doc stores only the **public** mist FarmId and the enabled flag. The Hot manifest carries the Firestore farm id in its plaintext meta so a recovered mirror knows which cloud farm it came from.

### 3.2 Keys

The FarmSeed is never written to Firestore, to any PUFworks project, or to the client bundle. It follows the existing mist rules: shown once as a paper FarmCode on enable, held on each device in `pufam.mist.session.v1` (AES-GCM under a PIN-derived or device key), reaching a second device only by the FarmCode read aloud or the LAN-shelf grant. Consequence: whoever holds the FarmCode can read the whole mirror regardless of their Firestore role — the owner decides who gets the code, and the Settings copy says so. Hole 4 (revoke ≠ kick) applies to the mirror exactly as it does to a Freenet-native farm.

### 3.3 Data flow

- **Mirror out.** On Send (manual first; auto-sync rung later), the pack takes the farm's `.pufom` export envelope from the **local cache** (`hotAdapter.ts` already maps export envelope ↔ HotState), seals it with HotKey, and publishes `hot/current`; geometry goes to `bones/farm-geometry` as today. No Firestore reads are added for a publish — the envelope is built from what the client already holds (`FIREBASE_BILLING.md` §5 applies).
- **Authority.** While Firestore is reachable it wins. The mirror is write-only from devices that have the seed and read-only for everyone; a Freenet reader does not push edits back into Firestore in this plan. Two-way merge between a Freenet-native copy and a cloud farm is § Out of scope.
- **Robustness cases this buys.** Firebase outage or billing lapse: crew keep working from local cache, the last Send is on Freenet. Hosted project retired or owner leaves PUFworks hosting: owner rehydrates the mirror into a Freenet-native farm or imports the envelope into a new cloud/BYO farm (`MistRecoverFarm` + existing import). Second device with no cloud account yet: FarmCode + ticket gives a read copy immediately; PIN + Auth makes it a member later.
- **Join.** A cloud farm's short ticket is minted by the same code as today (`shared/sync/joinTicket.ts`, slot via `joinSlotFreenet.ts`). Joining over Freenet yields the mirror and a `MistSessionMeta` grant; it does not create a Firebase member. The join gate says which of the two the person just did.

### 3.4 What changes in the cloud farm code

`farmPipes.ts` gains a third state: cloud farm with a Freenet plane. `mistHotBridge.ts` today mirrors the mist local store on every save; for a cloud farm it mirrors the export envelope on Send instead (per-save mirroring of a Firestore-backed farm is deferred until the cost of building the envelope is measured). `AuthContext` keeps importing no pack hooks; the pack reads farm plugin settings through the existing crop-pack seam.

## 4. The pack

### 4.1 Contract — [`Plans/NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md) (written 2026-09-10, slice A)

Sibling of `CROP_PACK_PLUGIN.md`. Same discovery (`plugins/freenet_host/plugin.json` + `src/index.ts` exporting `packUi`, picked up by `src/packs/registry.ts` `import.meta.glob`, compiled in at build — `PLUGIN_PACK_LAYOUT.md` §3 still forbids runtime code loading). Differences from a crop pack:

| Aspect | Crop pack | Network pack |
|--------|-----------|--------------|
| `plugin.json` `kind` | `crop_pack` | `network` (catalog `kind: 'system'` stays for the existing `SYSTEM_PLUGINS` row) |
| Needs from the shell | nothing | a **host capability**: `FreenetHostPlugin` adapter or `null` |
| Enable | per farm | per farm, but the node is per device; the pack reconciles (start when any enabled farm is open, stop when none) |
| Settings home | Settings → Plugins tile → pack route | Settings → Plugins → *Network & storage* tile; day-to-day controls stay under Settings → Sync |
| Registry | `CROP_PACKS` order | `registry.ts` accepts `SYSTEM_PLUGINS` too; order: network packs after crop packs |

### 4.2 What moves into `plugins/freenet_host/src/`

`MistFarmSyncCard.tsx` (1,004 lines), `MistJoinTicketGate.tsx`, `MistWorkshopCard.tsx` (1,102), `FreenetHowItWorks.tsx`, `FreenetSendNudge.tsx`, `login/FreenetExplain.tsx`, `pages/MistNewFarm.tsx`, `pages/MistRecoverFarm.tsx`, and the parts of `src/mist/` that are UI-facing (`mistFreenetClient.ts` becomes the pack's host-facing client). Pure crypto and addressing stay in `units/mist-freenet`. Splitting the two oversized cards while moving them clears the two standing `audit:codebase` warnings.

### 4.3 Host adapters

| Shell | Adapter | State today |
|-------|---------|-------------|
| Electron | `units/puf-freenet-host` via `desktop/main.ts` `createFreenetHost` + preload IPC | exists; `putCiphertext`/`getCiphertext` wired but never called |
| Android | Capacitor `FreenetHost` plugin → `:freenet` process (`APK_FREENET_HOST.md` Phases 2–3) | not built |
| Web | `null` → pack tile reads *not available on this device*; login option hidden | today shows the option and cannot use it |
| LAN hub (Express on desktop) | not an adapter — relay only, for paired tablets without a node; goes away for a tablet once Phase 3 lands | exists |

## 5. Phases

### Phase 0 — decisions on paper (docs only) — done 2026-09-10

- [x] Dated lines for decisions 1–8 in `FREENET_OPERATOR_FLOW.md` §8 (holes 4, 5) and ROADMAP E-08 (progress log).
- [x] Node version: policy recorded in decision 4 (pin latest at Phase 2 start; last verified 0.2.125; 0.2.119 check not run and superseded). `APK_FREENET_HOST.md` spike log carries the same line.
- [x] `reference/APK_FREENET_PLUGIN.md`, `reference/DESKTOP_FREENET_PLUGIN.md`, `reference/MIST_NETWORK_STORAGE.md`, `reference/MIST_TWO_FEDORA_FREENET.md` each carry a one-line "superseded by `FREENET_NETWORK_PACK.md` decision n" note under the status header — content and `§` numbers untouched (`NAMING.md` §9).
- [x] `FREENET_OPERATOR_FLOW.md` "Production web hides Freenet" marked as *target after Phase 1*; "Cloud XOR Freenet is locked at login" marked as *until decision 7 lands*.

### Phase 1 — network pack on desktop, no new native code

**Slice A — done 2026-09-10** (pack skeleton, per-farm enable, device state, web hidden):

- [x] `NETWORK_PACK_PLUGIN.md` contract; `plugins/freenet_host/` folder (`plugin.json` `kind: network`; the eight UI files from §4.2 moved with `git mv`, names kept; `src/index.ts` registers surfaces + public routes); `registry.ts` accepts `SYSTEM_PLUGINS` after crop packs; `codebaseHealth.test.ts`, `packRegistry.test.ts` and `audit-codebase.mjs` pairing checks extended (`plugins/` joins the size scan; core ↛ `plugins/*/src` except the registry).
- [x] Per-farm enable in farm plugin settings (`pufam.networkPacks.v1.{farmId}` for Freenet-native farms; cloud farms show *Coming with hybrid* — no toggle until slice C); node reconciliation by `useFreenetHostReconciler` (start when the open farm is enabled and the shell is Electron, stop only a node it started, 1.5 s debounce); *not available on this device* state on the tile when `getFreenetHostCapability()` is `null`.
- [x] Web hidden: `deploy-cloudrun.mjs` drops the baked flag and `MIST_FREENET_DISABLED`; `freenetOptionState` keys off host capability (`src/lib/freenetHostCapability.ts`); `tests/api/cloudSurface.test.ts` unchanged and passing (404 stays the documented behaviour). APK with the mist gate open keeps the option and reads through a hub until Phase 3.
- Not done in slice A, by design: `MistFarmSyncCard.tsx` / `MistWorkshopCard.tsx` moved whole — the two `audit:codebase` size warnings persist (split still owed); `src/mist/` stays where it is (moves with slice B).

**Slice B — data path** (open):

- [ ] Data path through `FreenetHostPlugin.putCiphertext/getCiphertext` on Electron; Express mist routes reduced to LAN relay; `mistFreenetClient.ts` becomes the pack's host-facing client and the UI-facing parts of `src/mist/` move into the pack.

**Slice C — hybrid** (open):

- [ ] Hybrid: Firestore farm doc gains mist FarmId + enabled flag (the `freenet_host` flag for a cloud farm lives there, replacing the tile's *Coming with hybrid*); Send builds the export envelope from local cache and publishes; join gate distinguishes mirror-join from member-join; `farmPipes.ts` third state.
- Exit: existing A→B desktop smoke still passes through the pack; a cloud farm on desktop A Sends a mirror that desktop B rehydrates from FarmCode + ticket.

### Phase 2 — native PUT, single binary, desktop

- [ ] Wire `BrowserFreenetPutClient` / `BrowserFreenetSlotClient` into Hot, bones and slot publish inside the Electron adapter.
- [ ] Remove `fdev` from `scripts/freenet-binaries.json`, `electron-builder.yml` `extraResources`, `verify-desktop-deps.mjs`; delete `freenet02-fdev-*.ts`, `fcp-freenet-transport.ts`, `fcp-protocol.ts`, and the Hyphanet-era headers in `mistFreenetRoutes.ts`, `freenetPeerHost.ts`, `freenet-mist-store.ts`.
- [ ] Re-pin node version; rebuild slot contract (`build-slot-contract.mjs`), re-pin hashes; add the cross-version check to the smoke.
- [ ] Verify the win-x64 binary (`unverified` in the manifest); first-launch on Windows.
- Exit: two fresh desktop installs (Linux and Windows), nothing else installed, enable pack, create → Send → join → see data; live tests `freenet02-native-*-live` pass against the pinned node.

### Phase 3 — Android host (absorbs `APK_FREENET_HOST.md` Phases 2–5)

- [ ] aarch64 `libfreenet.so` build chain for the pinned version; `android-arm64` entry in `freenet-binaries.json`; AGPL kept at the process boundary (separate process, no linkage into the WebView process).
- [ ] `:freenet` process with foreground service, loopback WS `127.0.0.1:7509`, attach-if-port-taken; Capacitor `FreenetHost` plugin implementing the same `FreenetHostPlugin` shape.
- [ ] Freenet APK flavour (`build-android-web.mjs`); size budget recorded; Doze/battery behaviour measured on the SM-T545.
- [ ] Lift `detectFreenetReadOnly` when a host adapter reports `running`; tablet-minted tickets appear in the local People list; operator copy replaces `FREENET_NO_HOST_LABEL`.
- Exit: two fresh tablet installs, no laptop, no second app: enable pack, create → Send → join → see data.

### Phase 4 — two-terminal acceptance

- [ ] Scripts in `FREENET_OPERATOR_FLOW.md` for desktop↔desktop, tablet↔tablet, desktop↔tablet, each from a clean install; one run per shell pair logged with date and node version.
- [ ] Hole 5 closed in §8; E-08 marked done in ROADMAP.

## 6. Risks and unknowns

- **Android build chain** is the long pole: no official aarch64 freenet-core release, one third-party alpha with weekly drops. Budget a spike before committing Phase 3 dates.
- **Freenet 0.2 churn.** Weekly releases; exit 42 "update required" already handled on desktop, must be handled identically in the `:freenet` process. Every re-pin moves slot addresses; 7-day tickets absorb it, long-lived addresses would not.
- **Re-pinning mid-plan.** If the pinned version is retired by the network before Phase 3 lands, Phase 2's smoke must be re-run.
- **Hybrid mirror cost.** Building a full export envelope on every Send is cheap for a small farm; measure before enabling per-save mirroring or the auto-sync rung.
- **FarmCode is the whole boundary.** A hybrid farm's Firestore roles do not constrain who can read the mirror. Copy must say this plainly at enable time.
- **Battery / Doze / size** on tablets (~196 MB RSS observed for the sideloaded node; ~100 MB APK flavour).
- **Unauthenticated loopback WS** on the tablet: any app on the device can drive the node. Ciphertext-only payloads limit the damage; note in §8 as a hole if it persists.

## 7. Out of scope

Two-way merge between a Freenet-native copy and a cloud farm; Hot → Archive / Manifest sealing (`FREENET_OPERATOR_FLOW.md` §9.2); `contribute_storage` doing real replication; Reticulum; QR JoinEnvelope / invite index; a web-shell sidecar; revoke-that-kicks (Hole 4) beyond stating it applies to the mirror.

## 8. Supersedes

| Statement | Where | Status after this plan |
|-----------|-------|------------------------|
| Drop-fdev blocked upstream | `reference/DESKTOP_FREENET_PLUGIN.md` §4.3 | superseded by decision 1 |
| In-APK node rejected (AGPL, 4 blockers) | `reference/APK_FREENET_PLUGIN.md` §3a, §8c row 4 | superseded by decision 3 |
| Phone/tablet will not run a peer | `reference/DESKTOP_FREENET_PLUGIN.md` §11; `reference/MIST_NETWORK_STORAGE.md` § Mobile policy | superseded by decision 3 |
| Production web as Freenet client via sidecar (Phase 10b) | `reference/MIST_TWO_FEDORA_FREENET.md` § Production UI | superseded by decision 5 |
| Farm is cloud XOR Freenet | `src/lib/farmPipes.ts`, login chooser | superseded by decision 7 |
| InviteToken / JoinEnvelope / invite index | `reference/MIST_NETWORK_STORAGE.md` § Invitation | not adopted; FarmCode + short ticket stands |
| `FreenetHostPlugin` put/get as frozen v1 contract, unused | `reference/DESKTOP_FREENET_PLUGIN.md` §5.2 | becomes the live seam (decision 2) |
