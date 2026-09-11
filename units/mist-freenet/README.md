# mist-freenet (PUF-AM unit)

Experimental **Mist unit** for PUF-AM: encrypted durable storage over a Freenet-style peer layer (farm bones, Hot / Archive / Manifest contracts).

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| **1 — Contract** | Frozen TypeScript API, key helpers, `FarmStore` adapter sketch, in-memory stub | **Done** |
| **2 — Local disk** | `DiskMistStore`, hot→archive seal helper, vitest persistence tests | **Done** |
| **3 — Freenet adapter** | `FreenetMistStore`, Freenet transport, mock + disk cache hybrid | **Done** (the original Hyphanet FCP backend was removed 2026-09-11; Freenet 0.2 WebSocket is the one wire) |
| **4 — App wiring** | FarmCode, FarmStore factory, mist first-run, bones workshop | **Done** |
| **5 — Hot bridge** | Local diary/issues → `hot/current` (AEAD, farm-export adapter) | **Done** |
| **5 — Reload survival** | IndexedDB `MistStore`, device PIN unlock on reload, session encrypt | **Done** |
| **6 — FarmCode recovery** | `/login/mist-recover` — laptop B joins with paper FarmCode; same `farmId`, local-only blobs | **Done** |
| **7 — Two-laptop smoke** | Pre-Freenet A→B recovery on localhost; bones/Hot per-device (expected) | **Done** (~2026-08-03) |
| **8+** | Reticulum unit, invite join QR, in-process Freenet plug-in, cross-device bone sync | **Phase 9 in-process plug-in — build started** (~2026-08-03); see Phase 9 below |
| **Join slot** | Rust/WASM slot contract + ticket-derived addressing, so a short join ticket resolves **off the owner's Wi‑Fi** | **Done** (~2026-08-09) — see § Join slot contract |
| **Native PUT** | `BrowserFreenetPutClient` / `BrowserFreenetSlotClient` are the only publish path on every shell; `fdev` CLI and Hyphanet FCP deleted | **Done** (2026-09-11, [`Plans/FREENET_NETWORK_PACK.md`](../../Plans/FREENET_NETWORK_PACK.md) Phase 2) |

Phase 3 does **not** wire the React app, Firebase auth, or ship a Freenet node binary.

## Non-goals (phases 1–3)

- No React components or app routes
- No Firebase Auth / Firestore / `access_pins` changes
- No FarmCode encoding, recovery UX, or invite join flows
- No Reticulum transport
- No production build flag wiring
- No bundled Freenet node in this unit — the desktop bundles one via `units/puf-freenet-host`; live tests use `npm run mist:smoke:native` or a local `freenet network`

## What lives here

| Module | Role |
|--------|------|
| `src/types.ts` | `MistMeta`, `MistEntry`, `PutResult`, health/stats types |
| `src/keys.ts` | Farm-scoped key string conventions (`bones` / `hot` / `archive` / `manifest`) |
| `src/mist-store.ts` | `MistStore` interface — put / get / list / watch / contribute / health / stats |
| `src/farm-store.ts` | Thin `FarmStoreAdapter` — mist vs cloud backend boundary for the app |
| `src/memory-mist-store.ts` | `MemoryMistStore` — in-memory implementation for contract tests |
| `src/indexeddb-mist-store.ts` | `IndexedDbMistStore` — **browser** durable persistence (phase 5) |
| `src/disk-mist-store.ts` | `DiskMistStore` — **Node-only** disk persistence (phase 2) |
| `src/freenet-peer.ts` | `FreenetPeer` / `createFreenetPeer` — in-process lifecycle (phase 9) |
| `src/ciphertext-guard.ts` | Encrypt-before-upload guard for Freenet puts |
| `src/freenet-mist-store.ts` | `FreenetMistStore` — disk cache + Freenet transport (phase 3) |
| `src/freenet-transport.ts` | `FreenetTransport` interface |
| `src/freenet02-ws-transport.ts` | `Freenet02WsTransport` — the one real transport: flatbuffers GET + native PUT over the node's WS API (**Node only**) |
| `src/create-freenet-transport.ts` | `createFreenetTransport()` — builds the ws02 transport; no selector since 2026-09-11 |
| `src/freenet02-native-bincode.ts` | Native (bincode) `ClientRequest` PUT / UPDATE frames and `HostResponse` decode (browser-safe) |
| `src/freenet02-native-ws.ts` | One-shot native WS request; `webSocket` injection for runtimes without a global (browser-safe) |
| `src/freenet02-native-put.ts` | `BrowserFreenetPutClient` — pack-contract PUT (browser-safe) |
| `src/freenet02-native-slot.ts` | `BrowserFreenetSlotClient` — slot PUT, then `UpdateData::State` on "already exists" (browser-safe) |
| `src/freenet02-slot-publish.ts` | `putJoinSlotNative()` — loads the pinned slot WASM off disk and calls the slot client (**Node only**) |
| `src/freenet02-browser-get.ts` | `BrowserFreenetGetClient` — flatbuffers GET with a plain `WebSocket` (browser-safe) |
| `src/mock-freenet-transport.ts` | `MockFreenetTransport` — in-memory simulation for tests |
| `src/freenet-keys.ts` | Mist key → URI index + outbox paths |
| `src/farm-code.ts` | FarmCode mint/parse (`mist-fc-2`, 80-bit; decodes legacy `mist-fc-1`) + FarmSeed HKDF |
| `src/farm-seed.ts` | HKDF-SHA-256 helpers (Web Crypto) |
| `src/crockford.ts` | Crockford Base32 + check symbol |
| `src/seal-hot.ts` | `sealHotPeriod()` — hot/current → archive + manifest + hot trim |
| `src/index.ts` | Browser-safe public exports (memory, keys, seal helper) |
| `src/node.ts` | Node entry — disk + Freenet backends |
| `src/freenet.ts` | Freenet exports (re-exported by `node.ts`) |
| `src/freenet02-slot.ts` | **Join slot** addressing — slot id / signing key derivation, signed state codec (browser-safe) |
| `src/join-slot-crypto.ts` | AEAD seal for the join manifest inside a slot |
| `contracts/slot-contract/` | The Rust/WASM slot contract itself — see § Join slot contract |

Key naming follows [`Plans/reference/MIST_NETWORK_STORAGE.md`](../../Plans/reference/MIST_NETWORK_STORAGE.md) (farm-scoped mist keys, not Firestore paths). HKDF contract labels (`freenet-hot`, `freenet-bones`, etc.) are documented in the plan; this unit uses **storage key strings** only.

## Phase 3 architecture — Freenet adapter

```
┌─────────────────────────────────────────────────────────┐
│ FreenetMistStore (MistStore)                            │
│  put/get/list/watch/contribute/health/stats             │
└────────────┬───────────────────────────────┬────────────┘
             │                               │
     ┌───────▼────────┐              ┌───────▼────────────┐
     │ DiskMistStore  │              │ FreenetTransport   │
     │ local cache    │              │ ws02 / Mock        │
     │ + outbox index │              │ blob put/get       │
     └────────────────┘              └─────────┬──────────┘
                                               │ WebSocket (:7509)
                                               │ GET  flatbuffers
                                               │ PUT  native bincode
                                     ┌─────────▼──────────┐
                                     │ Freenet 0.2 node   │
                                     │ bundled + supervised│
                                     │ (puf-freenet-host) │
                                     └────────────────────┘
```

> **Workshop note (~2026-08-03):** Production target is an **in-process** Freenet client inside PUF-AM, not a farmer-managed daemon. The desktop now bundles and supervises the node (`units/puf-freenet-host`); a workshop `freenet network` on `:7509` is attached to, never killed.

**Design choices (v1):**

1. **Hybrid cache** — every `put` lands in `DiskMistStore` first (latency, offline reads). The network put runs when a node is reachable.
2. **Encrypt before upload (frozen ~2026-08-03)** — callers seal farm bytes with AEAD / FarmSeed keys **before** `put()`. The network carries ciphertext only; Freenet is not farm encryption. `assertCiphertextForFreenet` guards every put path.
3. **Content addressing** — ciphertext blobs publish to the pack contract, whose address is a function of the bytes (§ Freenet 0.2 addressing). Local `_mist/freenet-index.json` maps mist key → URI + `content_hash`.
4. **Mutable keys (hot, manifest)** — each update is a new publish; the local index pointer is replaced. The join slot is the one mutable address, and it is a separate contract.
5. **Node down** — cache serves reads/writes; failed puts queue in `_mist/freenet-outbox.json`; `flushOutbox()` retries when the node reconnects.
6. **`contribute=false` (default)** — own puts still run (durability); the flag is persisted and reflected in health/stats. Does not enable foreign replication (future `replicate()` still gated).
7. **Browser** — cannot run `fs`; import `./index.ts` only. The native clients (`freenet02-native-*.ts`, `freenet02-browser-get.ts`) *are* browser-safe: they need nothing but a `WebSocket`.

### WebSocket configuration

There is one wire. `FREENET_TRANSPORT`, `FDEV_BIN`, `FREENET_FCP_HOST` and `FREENET_FCP_PORT` were removed on 2026-09-11 and are ignored (`Plans/NAMING.md` §3).

| Env / option | Default | Purpose |
|--------------|---------|---------|
| `FREENET_WS_URL` | `ws://127.0.0.1:7509/v1/contract/command` | Freenet 0.2 node WebSocket API — GET and PUT both go here |
| `FREENET_WS_AUTH` | _(empty)_ | Optional WS auth token (localhost usually needs none) |
| `FREENET_PACK_WASM` | `units/mist-freenet/assets/pack-contract.wasm` | Pack-contract WASM the native PUT sends as contract code |
| `FREENET_SLOT_WASM` | `units/mist-freenet/assets/slot-contract.wasm` | Slot-contract WASM for join-slot PUT / UPDATE |

Both WASM paths default from `import.meta.url`; desktop main sets them explicitly because a bundled CJS main has no `import.meta.url` (`freenetHostEnv` in `units/puf-freenet-host`).

**Freenet 0.2 workshop (Rust node on :7509):**

```bash
VITE_MIST_EXPERIMENTAL=true MIST_FREENET=1 npm run dev
# Settings → Mist workshop → Connect Freenet peer → Publish Hot to Freenet
```

**Programmatic:**

```ts
import { createFreenetTransport, FreenetMistStore } from '../units/mist-freenet/src/node.ts';

const transport = createFreenetTransport({
  ws02: { wsUrl: 'ws://127.0.0.1:7509/v1/contract/command' },
});
const store = new FreenetMistStore({
  rootDir: '/var/pufam/mist',
  transport,
  contribute: false,
});
await store.init();
```

### How a PUT reaches the node

`Freenet02WsTransport.putBlob` → `BrowserFreenetPutClient.putPackBlob` → one short-lived socket to
`FREENET_WS_URL?encodingProtocol=native` carrying a bincode `ClientRequest::ContractOp(Put)` with the
pack WASM (package header stripped) as code. Slots: `putJoinSlotNative` → `BrowserFreenetSlotClient.putJoinSlot`
tries PUT, and on "already exists" sends `UpdateData::State` carrying the **real** code hash — a zero
hash, which is what the old CLI sent, comes back `missing contract`. GET stays on the flatbuffers SDK
(`@freenetorg/freenet-stdlib`) over the long-lived socket. Native is used for PUT because the SDK's
flatbuffers PUT hangs on 0.2.11x+ (spike log in `Plans/APK_FREENET_HOST.md`).

The clients take an optional `webSocket` constructor; Node 22 and Electron provide `globalThis.WebSocket`,
and the hermetic wire test (`freenet02-native-wire.test.ts`) injects a fake one.

### Freenet 0.2 addressing (mist keys → network)

Freenet 0.2 has no CHK insert API. Mist uses the **freenet-git pack-contract** WASM:

- **Parameters** = BLAKE3-32(ciphertext)
- **State** = ciphertext bytes (already AEAD-sealed by caller)
- **URI** = `FN02@<base58-contract-instance-id>` where instance id = `BLAKE3(BLAKE3(wasm) || parameters)`
- Local `_mist/freenet-index.json` maps mist key → URI + `content_hash`

Pull on laptop B: resolve mist key from local index (or re-publish flow) → `getBlob(FN02@…)` → disk cache.

### Limitations (phase 3 + ws02)

- No USK/SSK mutable Freenet keys — hot/manifest use replace-pointer-via-local-index.
- **Freenet 0.2:** pack-contract (64 KiB single blob) and join-slot PUT/UPDATE use native bincode over `encodingProtocol=native` — flatbuffers SDK PUT hangs on 0.2.11x+; GET uses `@freenetorg/freenet-stdlib` flatbuffers. Every shell publishes through these clients (Phase 2, 2026-09-11).
- **`CHK@…` URIs from the removed Hyphanet backend cannot be fetched** — `freenet-uri-normalize.ts` still parses them so an old index does not throw, but only `FN02@…` resolves.
- No splitfile support for **KiB-class** payloads (workshop frozen ~2026-08-03) — Hot/bones/manifest use single-block blobs. Splitfiles deferred for larger assets (tile packs, multi-MiB archives).
- No cross-device watch/push — `watch()` is local disk only.
- No `replicate()` for foreign copies — `contribute` flag is persisted and reflected in health/stats only.
- Real network behavior (churn, propagation, success rate) requires a running node — `npm run mist:smoke:native` for the local-node check, two machines for A→B.

### Phase 5 — reload survival (done)

- `IndexedDbMistStore` — browser FarmStore persists across full page reload (`pufam-mist-v1` IndexedDB; see [`Plans/NAMING.md`](../../Plans/NAMING.md) §7)
- Device session encrypted in `localStorage` (`pufam.mist.session.v1`); FarmSeed never plaintext when PIN mode is on
- Optional **4-digit device PIN** → unlock gate after reload; skip-PIN workshop mode auto-restores (weaker)
- Sign out clears session blob + IndexedDB mist entries
- **Two-laptop smoke (done, ~2026-08-03):** Laptop B FarmCode recovery → same `farmId`; bones/Hot per-device until Freenet or interim LAN sync

### Phase 9 — in-process Freenet plug-in (build started ~2026-08-03)

- **`FreenetPeer` / `createFreenetPeer`** — `start` / `stop` / `status` lifecycle wrapping `Freenet02WsTransport` + `FreenetMistStore` (`src/freenet-peer.ts`; Node via `./node.ts`, browser-safe status type via `./index.ts`).
- **Server-hosted peer** — on the web/LAN shells the peer runs **in-process with Express** (`server/freenetPeerHost.ts`, `server/mistFreenetRoutes.ts`), auto-started when `MIST_FREENET=1`. On desktop the same code runs in Electron main behind `FreenetHostPlugin` (`server/freenetHostWire.ts`).
- **Browser proxy** — `src/mist/mistFreenetClient.ts` + Settings **Mist workshop** card: peer connect/disconnect, Publish/Pull Hot via `/api/mist/freenet/...`.
- **Encrypt before upload** — `assertCiphertextForFreenet` on `FreenetMistStore.put()` and in the host wire; Hot must be AEAD envelope from `encryptHotBlob`.
- **A node is still required** for live network — the desktop bundles one; a dev laptop runs `freenet network` (0.2.135 pinned). Mock transport tests cover sync without a node.

**Enable locally:**

```bash
VITE_MIST_EXPERIMENTAL=true MIST_FREENET=1 npm run dev
# Settings → Mist workshop → Connect Freenet peer → Publish Hot to Freenet
# With a `freenet network` on :7509: status shows connected
# Without one: peer starts, status disconnected (graceful); mock tests still pass
```

**Two-laptop (a node on each PC):** Laptop A publish Hot to Freenet; Laptop B recover FarmCode → Pull Hot from Freenet (same Freenet mesh).

### Phase 8+ (remaining — not started)

Workshop captured design constraints before live Freenet wiring. **Do not implement the in-app client in this pass** — document-only freeze. Full checklist: [`Plans/reference/MIST_NETWORK_STORAGE.md`](../../Plans/reference/MIST_NETWORK_STORAGE.md) § Pre-Freenet workshop decisions.

**Frozen architecture (Freenet client):**

| Decision | Implication for this unit |
|----------|---------------------------|
| **Encrypt before upload** | `FreenetMistStore.put()` must receive **already AEAD-sealed** bytes (Hot via `hot-crypto.ts`, bones/manifest same pattern). CHK insert is transport only — Freenet does not replace farm encryption. |
| **KiB-class = single blob** | Hot, bones, manifest stay on a **single pack-contract blob** (64 KiB ceiling). No splitfiles for KiB payloads; a splitfile client is deferred until tile packs / multi-MiB archives need it. |
| **In-process plug-in** | Freenet host runs **inside PUF-AM** as a compartmentalized unit (this package + `units/puf-freenet-host`), **not** a separate daemon the farmer manages. An external node remains optional for dev/live tests only. |
| **Future fork: PUF-FN** | Transport/host layer should expose a narrow interface so it can split into **PUF-FN** repo later without rewriting `MistStore` / `FarmStoreAdapter`. See [`Plans/NAMING.md`](../../Plans/NAMING.md) §1. |

**Still per prior milestones:**

- **Experimental fork** — Firebase default unchanged.
- **Two-laptop FarmCode recovery** done (~2026-08-03); bones/Hot **per-device** until Freenet sync ships.

**Next implementation (not started):**

- Reticulum transport unit + map heads-up
- Invite join QR (crew join path)
- In-process Freenet client wired to `FreenetMistStore` (Electron/main or embedded host)
- Cross-device Hot/bones sync over Freenet
- Optional later: a mutable manifest contract, splitfiles for large archives

### Phase 4 — app wiring (done)

- `src/mist/` — backend toggle (`pufam.farmStoreBackend`), `createAppFarmStore`, device session, bones workshop
- `/login/mist-new-farm` — show-once FarmCode first-run (gated by `VITE_MIST_EXPERIMENTAL=true` or mist backend)
- Settings → **Mist workshop** card — bones put/get smoke via `IndexedDbMistStore` (survives reload)
- Default remains **Firebase**; production invite PIN login unchanged

**Try locally:**

```bash
# Enable experimental entry on login screen
VITE_MIST_EXPERIMENTAL=true npm run dev
```

Then: Login → *Experimental: create offline mist farm* → write down FarmCode → optional device PIN → Farm setup → Settings → Mist workshop → *Bones put/get smoke* → **reload the page** → PIN unlock (if set) → *Read last blob* still works.

**Reload + PIN manual test (one laptop):**

1. `VITE_MIST_EXPERIMENTAL=true npm run dev`
2. Create mist farm with a 4-digit device PIN (do not skip).
3. Settings → Mist workshop → *Bones put/get smoke* → note success message.
4. Hard refresh (F5). Expect violet **Unlock mist farm** screen — enter device PIN (not FarmCode).
5. Settings → *Read last blob* — should return the same workshop payload.
6. Sign out → confirm session cleared; creating again requires new mist farm or FarmCode recovery (future).

## Hot contract shape (v1)

Hot is a **single blob** at `hotKey(farmId)` → `mist/v1/farm/{farmId}/hot/current`. Payload is JSON **`HotState`** (records array + window metadata). Each record’s `payload` reuses **farm-export-shaped** diary/issue rows (`src/mist/hotAdapter.ts`).

**At rest (app bridge):** when FarmSeed is unlocked, bytes are **AES-256-GCM** wrapped (`units/mist-freenet/src/hot-crypto.ts`, HKDF `info = "freenet-hot"`). Plaintext HotState JSON is still accepted on read for `sealHotPeriod()` workshop tests.

**App bridge:** `src/mist/mistHotBridge.ts` — publish/read, auto-mirror after local diary/issue saves when mist device session is active. Status: `localStorage` `pufam.mist.hotPublish.v1.{farmId}`.

`sealHotPeriod()` reads hot/current, seals matching calendar-year records into `archive/{period}`, updates `manifest`, and trims sealed records from hot.

## Disk layout (`DiskMistStore` / `FreenetMistStore` cache)

```
{rootDir}/
  _mist/
    state.json           # { contribute, maxBytes }
    index.json           # { [mistKey]: MistMeta }
    freenet-index.json   # { [mistKey]: { uri, content_hash, pending? } }  (phase 3)
    freenet-outbox.json  # [{ key, content_hash, queuedAt }]                 (phase 3)
  blobs/
    mist/v1/farm/{farmId}/{kind}/…/
      data.bin           # ciphertext bytes
      meta.json          # MistMeta sidecar
```

Paths under `blobs/` mirror mist key segments. Atomic writes use temp file + rename.

## Mobile peer policy (contract default)

`MemoryMistStore`, `DiskMistStore`, and `FreenetMistStore` default **`contribute_storage = false`** (client-only mist peer). Desktop / shed-pin backends may opt in via `setContribute(true)`.

When `contribute = false`:

- **Own** put/get/list/watch and local cache reads still work.
- Own puts still run; the flag only records intent (see phase 3 architecture).
- The flag persists on disk and appears in `health()` / `stats()`.
- Phase 4 `replicate()` (foreign copies) should refuse inbound replication when false — not implemented yet.

Disk budget defaults to **512 MiB** (`maxBytes`); configurable via ctor / `setMaxBytes()`. Excess puts throw `MistStorageFullError`.

## How PUF-AM consumes (phase 4 — wired)

App layer: `src/mist/createFarmStore.ts` selects `cloud` (Firebase default) vs `IndexedDbMistStore` in the browser. Backend preference: `localStorage` key `pufam.farmStoreBackend` (`firebase` | `mist`).

```ts
import { createAppFarmStore } from '@/src/mist/createFarmStore.ts';
import { mintFarmCode, parseFarmCode } from '@/units/mist-freenet/src/index.ts';

const adapter = createAppFarmStore(farmId); // respects pufam.farmStoreBackend
// Future: in-process Freenet plug-in (PUF-FN) behind FreenetMistStore — see Phase 8+
```

Feature modules still use Firestore directly today; bones workshop in Settings proves mist put/get end-to-end.

## Tests

From repo root (vitest includes `units/**/*.test.ts`):

```bash
npm test -- units/mist-freenet
```

Typecheck this unit only:

```bash
cd units/mist-freenet && npm run lint
```

**Live tests** are skipped unless `FREENET_LIVE_WS=1`. The one-command version starts a throwaway
node from the vendored binary, runs them, stops it, and prints a verdict with the node version:

```bash
npm run desktop:vendor          # once
npm run mist:smoke:native       # native PUT, slot PUT/UPDATE, browser GET, transport round-trip
```

Against a node you already have on `ws://127.0.0.1:7509`:

```bash
FREENET_LIVE_WS=1 npm test -- units/mist-freenet/freenet02-native-put-live.test.ts \
  units/mist-freenet/freenet02-native-slot-live.test.ts \
  units/mist-freenet/freenet02-browser-get-live.test.ts \
  units/mist-freenet/freenet02-live.test.ts
```

`FREENET_WS_URL` points them elsewhere (an `adb forward` to a tablet's node, for instance). The
hermetic counterpart is `freenet02-native-wire.test.ts`, which drives the same publish paths through
an injected fake socket and needs no node.

## Join slot contract

`contracts/slot-contract/` is a **Rust/WASM Freenet 0.2 contract** — the only compiled artifact this unit owns. It exists because the bundled pack contract sets `parameters = blake3(state)`, which makes an address a function of its content: a joiner holding only `PUF-K7M2-9Q4X` cannot compute where to look, because the address would depend on the bytes it is trying to fetch. The slot contract puts a **derived slot id** in `parameters` instead, so both sides land on the same address from the FarmSeed and the ticket alone.

```text
slot id     = HKDF(FarmSeed, "freenet-join-slot:" + ticket)   32 bytes
parameters  = slot id ‖ farm ed25519 public key               64 bytes
instance id = BLAKE3(code hash ‖ parameters)
```

Its state is a signed, sequence-numbered envelope around an AEAD-sealed manifest the contract never reads. Format, ordering rules, and rationale: [`contracts/slot-contract/src/lib.rs`](contracts/slot-contract/src/lib.rs).

```bash
# Rust tests. --features contract is required: the #[contract] macro expands into
# freenet-stdlib export shims that are feature-gated, so a bare `cargo test` fails.
cargo test --manifest-path units/mist-freenet/contracts/slot-contract/Cargo.toml --features contract

# Rebuild the WASM and check it still matches the pin (needs cargo and the
# wasm32-unknown-unknown target; the script writes the contract package header
# itself). Refuses to re-pin without --accept-new-hash.
npm run mist:build:slot

# Both pinned hashes vs the shipped artifact.
npm run desktop:verify:pack
```

**The vendored `assets/slot-contract.wasm` is the authority, not the source.** Every slot address is `BLAKE3(code hash ‖ parameters)`, so re-pinning the code hash moves every slot and any ticket already in the field stops resolving over Freenet. The hash is pinned twice — `SLOT_CONTRACT_CODE_HASH_B58` in `src/freenet02-slot.ts` and `slotContract.codeHashB58` in `scripts/freenet-binaries.json` — and both are checked against the artifact by `desktop:verify:pack` and `tests/freenetVendorManifest.test.ts`.

## References

- [`Plans/reference/MIST_NETWORK_STORAGE.md`](../../Plans/reference/MIST_NETWORK_STORAGE.md)
- [`DEVELOPER_NOTES.md`](../../DEVELOPER_NOTES.md) § Mist (experimental)
- [`Plans/FREENET_NETWORK_PACK.md`](../../Plans/FREENET_NETWORK_PACK.md) — Phase 2 (native PUT, node pin)
- [freenet-core](https://github.com/freenet/freenet-core) — the node this unit talks to
