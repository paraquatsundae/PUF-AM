# mist-freenet (PUF-AM unit)

Experimental **Mist unit** for PUF-AM: encrypted durable storage over a Freenet-style peer layer (farm bones, Hot / Archive / Manifest contracts).

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| **1 — Contract** | Frozen TypeScript API, key helpers, `FarmStore` adapter sketch, in-memory stub | **Done** |
| **2 — Local disk** | `DiskMistStore`, hot→archive seal helper, vitest persistence tests | **Done** |
| **3 — Freenet adapter** | `FreenetMistStore`, FCP transport, mock + disk cache hybrid | **Done** |
| **4 — App wiring** | FarmCode, FarmStore factory, mist first-run, bones workshop | **Done** |
| **5 — Hot bridge** | Local diary/issues → `hot/current` (AEAD, farm-export adapter) | **Done** |
| **5 — Reload survival** | IndexedDB `MistStore`, device PIN unlock on reload, session encrypt | **Done** |
| **6 — FarmCode recovery** | `/login/mist-recover` — laptop B joins with paper FarmCode; same `farmId`, local-only blobs | **Done** |
| **7 — Two-laptop smoke** | Pre-Freenet A→B recovery on localhost; bones/Hot per-device (expected) | **Done** (~2026-08-03) |
| **8+** | Reticulum unit, invite join QR, in-process Freenet plug-in, cross-device bone sync | **Phase 9 in-process plug-in — build started** (~2026-08-03); see Phase 9 below |

Phase 3 does **not** wire the React app, Firebase auth, or ship a Freenet node binary.

## Non-goals (phases 1–3)

- No React components or app routes
- No Firebase Auth / Firestore / `access_pins` changes
- No FarmCode encoding, recovery UX, or invite join flows
- No Reticulum transport
- No production build flag wiring
- No bundled Hyphanet/Freenet node — use a local install for live FCP tests

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
| `src/freenet-mist-store.ts` | `FreenetMistStore` — disk cache + FCP transport (phase 3) |
| `src/freenet-transport.ts` | `FreenetTransport` interface |
| `src/fcp-freenet-transport.ts` | `FcpFreenetTransport` — real FCPv2 over TCP (`node:net`) |
| `src/mock-freenet-transport.ts` | `MockFreenetTransport` — in-memory CHK simulation for tests |
| `src/fcp-protocol.ts` | FCP message encode / stream parse |
| `src/freenet-keys.ts` | Mist key → CHK URI index + outbox paths |
| `src/farm-code.ts` | FarmCode mint/parse (`mist-fc-1`) + FarmSeed HKDF |
| `src/farm-seed.ts` | HKDF-SHA-256 helpers (Web Crypto) |
| `src/crockford.ts` | Crockford Base32 + check symbol |
| `src/seal-hot.ts` | `sealHotPeriod()` — hot/current → archive + manifest + hot trim |
| `src/index.ts` | Browser-safe public exports (memory, keys, seal helper) |
| `src/node.ts` | Node entry — disk + Freenet backends |
| `src/freenet.ts` | Freenet/FCP exports (re-exported by `node.ts`) |

Key naming follows [`Plans/MIST_NETWORK_STORAGE.md`](../../Plans/MIST_NETWORK_STORAGE.md) (farm-scoped mist keys, not Firestore paths). HKDF contract labels (`freenet-hot`, `freenet-bones`, etc.) are documented in the plan; this unit uses **storage key strings** only.

## Phase 3 architecture — Freenet adapter

```
┌─────────────────────────────────────────────────────────┐
│ FreenetMistStore (MistStore)                            │
│  put/get/list/watch/contribute/health/stats             │
└────────────┬───────────────────────────────┬────────────┘
             │                               │
     ┌───────▼────────┐              ┌───────▼────────────┐
     │ DiskMistStore  │              │ FreenetTransport   │
     │ local cache    │              │ Fcp / Mock         │
     │ + outbox index │              │ CHK put/get        │
     └────────────────┘              └─────────┬──────────┘
                                               │ FCPv2 TCP
                                     ┌─────────▼──────────┐
                                     │ Freenet transport  │
                                     │ in-process plug-in │
                                     │ (PUF-FN fork later)│
                                     └────────────────────┘
```

> **Workshop note (~2026-08-03):** Production target is an **in-process** Freenet client inside PUF-AM, not a farmer-managed Hyphanet daemon. The external node in dev tests (`localhost:9481`) is optional for FCP validation only.

**Design choices (v1):**

1. **Hybrid cache** — every `put` lands in `DiskMistStore` first (latency, offline reads). FCP insert runs when a node is reachable.
2. **Encrypt before upload (frozen ~2026-08-03)** — callers seal farm bytes with AEAD / FarmSeed keys **before** `put()`. CHK insert carries ciphertext only; Freenet is not farm encryption.
3. **CHK addressing** — ciphertext blobs insert as content-addressed **CHK** blocks. Local `_mist/freenet-index.json` maps mist key → CHK URI + `content_hash`.
4. **Mutable keys (hot, manifest)** — each update is a new CHK insert; the local index pointer is replaced. USK/SSK in-place updates deferred.
5. **Node down** — cache serves reads/writes; failed inserts queue in `_mist/freenet-outbox.json`; `flushOutbox()` retries when FCP reconnects.
6. **`contribute=false` (default)** — own inserts still run (durability), but FCP uses low priority (`PriorityClass=6`) and `ExtraInsertsSingleBlock=0`. Does not enable foreign replication (future `replicate()` still gated).
7. **Browser** — cannot run FCP or `fs`; import `./index.ts` only. Production target: **in-process Freenet plug-in** inside PUF-AM (workshop frozen ~2026-08-03); external Hyphanet node remains for dev/live FCP tests.

### FCP configuration

| Env / option | Default | Purpose |
|--------------|---------|---------|
| `FREENET_FCP_HOST` | `127.0.0.1` | Hyphanet node FCP host |
| `FREENET_FCP_PORT` | `9481` | FCP port (enabled by default on Hyphanet) |
| `FcpFreenetTransportOptions.clientName` | `PUF-AM-mist` | FCP ClientHello name |

Install [Hyphanet](https://www.hyphanet.org/) locally, ensure FCP is enabled, then:

```ts
import { FcpFreenetTransport, FreenetMistStore } from '../units/mist-freenet/src/node.ts';

const transport = new FcpFreenetTransport({ host: '127.0.0.1', port: 9481 });
const store = new FreenetMistStore({
  rootDir: '/var/pufam/mist',
  transport,
  contribute: false,
});
await store.init();
```

### Limitations (phase 3)

- No USK/SSK mutable Freenet keys — hot/manifest use replace-pointer-via-local-index.
- No splitfile support for **KiB-class** payloads (workshop frozen ~2026-08-03) — Hot/bones/manifest use single-block CHK. Splitfiles deferred for larger assets (tile packs, multi-MiB archives).
- No cross-device watch/push — `watch()` is local disk only.
- No `replicate()` for foreign copies — `contribute` flag is persisted and reflected in health/stats only.
- FCP client covers ClientHello, ClientPut (direct CHK), ClientGet (direct) — not persistent queue / global watch / TestDDA disk paths.
- Real network behavior (HTL, churn, insert success rate) requires a running node and manual verification.

### Phase 5 — reload survival (done)

- `IndexedDbMistStore` — browser FarmStore persists across full page reload (`pufam-mist-v1` IndexedDB; see [`Plans/NAMING.md`](../../Plans/NAMING.md) §7)
- Device session encrypted in `localStorage` (`pufam.mist.session.v1`); FarmSeed never plaintext when PIN mode is on
- Optional **4-digit device PIN** → unlock gate after reload; skip-PIN workshop mode auto-restores (weaker)
- Sign out clears session blob + IndexedDB mist entries
- **Two-laptop smoke (done, ~2026-08-03):** Laptop B FarmCode recovery → same `farmId`; bones/Hot per-device until Freenet or interim LAN sync

### Phase 9 — in-process Freenet plug-in (build started ~2026-08-03)

- **`FreenetPeer` / `createFreenetPeer`** — `start` / `stop` / `status` lifecycle wrapping `FcpFreenetTransport` + `FreenetMistStore` (`src/freenet-peer.ts`; Node via `./node.ts`, browser-safe status type via `./index.ts`).
- **Server-hosted FCP** — PUF-AM has no Electron main; the peer runs **in-process with Express** (`server/freenetPeerHost.ts`, `server/mistFreenetRoutes.ts`). Optional auto-start when `MIST_FREENET=1`.
- **Browser proxy** — `src/mist/mistFreenetClient.ts` + Settings **Mist workshop** card: peer connect/disconnect, Publish/Pull Hot via `/api/mist/freenet/...`.
- **Encrypt before upload** — `assertCiphertextForFreenet` on `FreenetMistStore.put()`; Hot must be AEAD envelope from `encryptHotBlob`.
- **Hyphanet still required** for live network — FCP talks to `localhost:9481`; full JVM in-browser is out of scope. Mock transport tests cover sync without a node.

**Enable locally:**

```bash
VITE_MIST_EXPERIMENTAL=true MIST_FREENET=1 npm run dev
# Settings → Mist workshop → Connect Freenet peer → Publish Hot to Freenet
# With Hyphanet installed + FCP on 9481: status shows connected
# Without Hyphanet: peer starts, status disconnected (graceful); mock tests still pass
```

**Two-laptop (with Hyphanet on each PC):** Laptop A publish Hot to Freenet; Laptop B recover FarmCode → Pull Hot from Freenet (same Freenet mesh).

### Phase 8+ (remaining — not started)

Workshop captured design constraints before live Freenet wiring. **Do not implement the in-app client in this pass** — document-only freeze. Full checklist: [`Plans/MIST_NETWORK_STORAGE.md`](../../Plans/MIST_NETWORK_STORAGE.md) § Pre-Freenet workshop decisions.

**Frozen architecture (Freenet client):**

| Decision | Implication for this unit |
|----------|---------------------------|
| **Encrypt before upload** | `FreenetMistStore.put()` must receive **already AEAD-sealed** bytes (Hot via `hot-crypto.ts`, bones/manifest same pattern). CHK insert is transport only — Freenet does not replace farm encryption. |
| **KiB-class = single CHK** | Hot, bones, manifest stay on **direct CHK** (`ClientPut` / `ClientGet`). No splitfiles for KiB payloads; splitfile client deferred until tile packs / multi-MiB archives need it. |
| **In-process plug-in** | Freenet host runs **inside PUF-AM** as a compartmentalized unit (this package + future transport layer), **not** a separate Hyphanet daemon the farmer manages. External node remains optional for dev/live FCP tests only. |
| **Future fork: PUF-FN** | Transport/host layer should expose a narrow interface so it can split into **PUF-FN** repo later without rewriting `MistStore` / `FarmStoreAdapter`. See [`Plans/NAMING.md`](../../Plans/NAMING.md) §1. |

**Still per prior milestones:**

- **Experimental fork** — Firebase default unchanged.
- **Two-laptop FarmCode recovery** done (~2026-08-03); bones/Hot **per-device** until Freenet sync ships.

**Next implementation (not started):**

- Reticulum transport unit + map heads-up
- Invite join QR (crew join path)
- In-process Freenet client wired to `FreenetMistStore` (Electron/main or embedded host)
- Cross-device Hot/bones sync via FCP
- Optional later: USK for manifest, splitfiles for large archives

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
- FCP inserts use minimal replication priority (see phase 3 architecture).
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

**Optional live FCP test** (requires running Hyphanet node with FCP on `9481`):

```bash
FREENET_FCP_HOST=127.0.0.1 npm test -- units/mist-freenet/freenet-mist-store.test.ts
```

The `FcpFreenetTransport (live node)` describe is skipped unless `FREENET_FCP_HOST` is set.

## References

- [`Plans/MIST_NETWORK_STORAGE.md`](../../Plans/MIST_NETWORK_STORAGE.md)
- [`DEVELOPER_NOTES.md`](../../DEVELOPER_NOTES.md) § Mist (experimental)
- [Hyphanet FCPv2 wiki](https://github.com/hyphanet/wiki/wiki/FCPv2)
