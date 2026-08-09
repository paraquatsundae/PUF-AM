# Mist two-Fedora Freenet 0.2 smoke (Opennet)

**Status: PASSED on the packaged AppImage (~2026-08-04).** All six pass criteria met with **zero terminals** on either laptop — see [§ AppImage A→B](#appimage-ab-passed-2026-08-04). The `npm run dev` + sidecar route below is kept as the **workshop/web** path; it is no longer how the desktop app is meant to be run.

**Target:** two Fedora laptops on **real Freenet 0.2 Opennet** — A sets up farm, B joins via FarmCode, B pulls **Hot (diary/issues) + bones (boundaries)** from Freenet.

**Cross-device sync (v2 — current):** **short join ticket, resolved over LAN or Freenet.** Laptop A publishes Hot + farm-geometry bones to Freenet as before, then mints a ticket like `PUF-K7M2-9Q4X`, registers a **join manifest** on its own LAN hub, **and** writes the same manifest to a Freenet **slot** the ticket addresses. Laptop B recovers with the FarmCode, is **immediately** asked for the ticket, and resolves it — LAN first, Freenet second — to get the FN02 URIs, then pulls the farm from Freenet. Freenet carries all farm data; a resolver only supplies the *addresses*.

The raw FN02 ticket (v1, below) survives under **Advanced** on both sides. It is no longer the only off-Wi‑Fi route, but it remains the one that needs no node on the joiner's side beyond the fetch itself.

**Shipped ~2026-08-09 — Freenet slot contract.** A ticket now resolves **without the owner's Wi‑Fi**. A purpose-built Rust/WASM contract takes a derived **slot id** as its `parameters`, so the owner and the joiner compute the same address from the FarmSeed and the ticket alone. LAN stays the first resolver and Freenet is the fallback: [`src/mist/joinTicketResolver.ts`](../src/mist/joinTicketResolver.ts). See [§ Freenet slot contract](#freenet-slot-contract-shipped-2026-08-09).

Related: [`MIST_TWO_LAPTOP_SMOKE.md`](MIST_TWO_LAPTOP_SMOKE.md) (pre-Freenet identity), [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist network.

---

## Short join ticket (v2)

An operator carries **eight Crockford Base32 symbols** with a `PUF-` prefix:

```
PUF-K7M2-9Q4X
```

40 bits of randomness. Crockford's alphabet drops `I`, `L`, `O`, `U`, and input is folded on the way in (`O`→`0`, `I`/`L`→`1`, `U`→`V`), so a ticket read off a whiteboard or a phone photo still resolves. Case, spaces, and hyphens are all ignored; `puf k7m2 9q4x` is the same ticket. Format lives in [`shared/sync/joinTicket.ts`](../shared/sync/joinTicket.ts).

**A ticket is a capability, not a key.** It reveals *where* a farm's blobs sit on Freenet. Those blobs are AEAD-sealed under a FarmSeed-derived key, so the ticket is worthless without the FarmCode — it replaces a copy/paste, never the recovery key.

### Join manifest (v2)

What a ticket resolves to:

```json
{
  "v": 2,
  "farmId": "…",
  "hotUri": "FN02@…",
  "bonesUri": "FN02@…",
  "role": "farmer",
  "permissions": { "preset": "field_only", "modules": "dashboard,map,diary" },
  "expires": "2026-08-11T00:00:00.000Z",
  "ticket": "PUF-K7M2-9Q4X",
  "hotContentHash": "optional sha256 hex",
  "bonesContentHash": "optional sha256 hex"
}
```

| Field | Notes |
|-------|-------|
| `role` | `owner \| admin \| farmer \| viewer` — the mist vocabulary, and the write ceiling. Default for a shared ticket is **`farmer`**. |
| `permissions` | The crew preset and the nav modules it grants. Four presets share the `farmer` role, so this is what separates "Field only" from "Crop scout". Values are `boolean \| number \| string` only, hence the comma-joined module list. Absent on tickets minted before ~2026-08-09; those land on the role's defaults. See [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §3b. |
| `expires` | Defaults to **7 days**. A hub refuses to serve an expired manifest and prunes it. |

`role` is an **authority label, not a crypto boundary** — anyone with the FarmCode can decrypt the farm. It decides what the app puts in front of them (the owner's setup wizard vs. the crew's diary).

### LAN resolution

| Route | Who calls it |
|-------|--------------|
| `POST /api/sync/join-ticket` | Owner's own hub, on publish. LAN/loopback callers only. |
| `GET /api/sync/join-ticket/:ticket` | A peer hub, on behalf of a joiner. Own shelf only, no fan-out. |
| `GET /api/sync/join-ticket/:ticket/resolve?farmId=&base=` | The **joiner's own** hub. Own shelf → owner-address hint → mDNS peers. |
| `DELETE /api/sync/join-ticket/:ticket` | Owner, to revoke. |

The joiner's browser never fetches the owner's hub directly: `am.pufworks.farm` is HTTPS and cannot fetch `http://192.168.x.x` without being blocked as mixed content. The LAN hop happens in Node, which also keeps CORS out of it. Shelf: [`server/joinManifestStore.ts`](../server/joinManifestStore.ts); routes: [`server/joinTicketRoutes.ts`](../server/joinTicketRoutes.ts).

**Closed ~2026-08-07 — the AppImage can now be the hub.** This used to read as a known gap: the Electron shell bound loopback only and never advertised on mDNS, so one AppImage could not discover another. It now offers an opt-in LAN bind — *Settings → Tablet hub → Serve tablets on this Wi‑Fi* starts a second listener on `0.0.0.0:3000`, advertises `_pufom-sync._tcp`, and asks a joining device for a one-time pairing code (desktop plan §6.4). The owner-address field and the raw FN02 ticket both still work as fallbacks when multicast is blocked.

### Freenet resolution (fallback)

When no hub answers, the same ticket is looked up on Freenet at an address derived from the ticket and the FarmSeed — no owner's laptop in the loop. The resolvers run in order (LAN, then Freenet) in [`src/mist/joinTicketResolver.ts`](../src/mist/joinTicketResolver.ts), and the join flow never learns which one answered.

| Route | Who calls it |
|-------|--------------|
| `POST /api/mist/freenet/slot/publish` | Owner's own hub, on send. Takes already-signed, already-sealed bytes. |
| `GET /api/mist/freenet/slot/:instanceId` | The **joiner's own** hub, straight to the wire — a slot has no mist key to cache under. |

Both sit behind the paired-device token like the rest of `/api/mist/freenet/*`. Details: [§ Freenet slot contract](#freenet-slot-contract-shipped-2026-08-09).

### Raw Freenet ticket (v1 — still supported)

```json
{
  "v": 1,
  "hotUri": "FN02@…",
  "bonesUri": "FN02@…",
  "hotContentHash": "optional sha256 hex",
  "bonesContentHash": "optional sha256 hex"
}
```

Also accepted on laptop B: **two lines** (hot URI, then bones URI). Reachable under **Advanced** in the send and join cards.

Bones asset: `mist/v1/farm/{farmId}/bones/farm-geometry` — AEAD under HKDF `freenet-bones`. Plaintext payload includes **blocks, pins, tracks, viewport** from `sentinut_farm_geometry`.

---

## Prerequisites (both laptops)

### OS packages

```bash
sudo dnf install -y nodejs npm git
# Node 20+ recommended (nvm/fnm OK)
```

### Freenet 0.2 node (Opennet)

| Tool | Laptop A | Laptop B | Purpose |
|------|----------|----------|---------|
| `freenet network` (daemon) | ✓ | ✓ | Opennet peer, WS API `:7509` |
| `fdev` on PATH | **✓ required** | optional | PUT via pack-contract |
| SDK GET (in-app) | ✓ | ✓ | Pull via WebSocket `@freenetorg/freenet-stdlib` |

```bash
freenet network
# Confirm: ws://127.0.0.1:7509/v1/contract/command
```

### PUF-AM repo

```bash
git clone <repo-url> Walnut_farm_manager   # B once
cd Walnut_farm_manager
git pull origin master
npm ci
```

---

## Server env (both laptops)

```bash
export FREENET_TRANSPORT=ws02
export VITE_MIST_EXPERIMENTAL=true
# Laptop A only — if fdev not on default PATH:
# export FDEV_BIN=/path/to/fdev

npm run dev
# Open http://localhost:3000 on THIS laptop only
```

---

## Laptop A — create, publish, read out the ticket

1. **Create mist farm** — Login → *Experimental: create offline mist farm* → write **FarmCode** → set device PIN. This device is the **`owner`** and is the only one sent to `/farm-setup`.
2. **Settings → Mist workshop** — backend **Mist IndexedDB**; unlock device session.
3. Draw **boundaries** on Orchard map (blocks/pins/tracks).
4. Add **diary** + **field issue**.
5. Settings → **Farm sync between laptops** → **Connect** (node, then peer) — status `connected (ws02 @ …)`.
6. Pick **what this ticket grants** — a crew preset (Full farmer, Field only, Crop scout, Records, Viewer, Admin, or Owner for your own second device), not a bare role → **Send this farm to Freenet**.
7. Read the short ticket out to B: **FarmCode**, **device PIN**, **`PUF-XXXX-XXXX`**.
8. Staying on, on the same Wi‑Fi, is still the **fast** path — this hub answers the ticket lookup instantly. It is no longer required: the send also writes the manifest to a Freenet slot, so B can resolve the same ticket from anywhere once Opennet has propagated it.

---

## Laptop B — recover, enter ticket, verify

1. Same commit: `git pull && npm ci`.
2. Same env: `FREENET_TRANSPORT=ws02`, `VITE_MIST_EXPERIMENTAL=true`, `npm run dev`.
3. Start **local Freenet 0.2 Opennet** node. Join the **same Wi‑Fi as A**.
4. Login → **Recover with FarmCode** → A’s code + same PIN → *Continue to join ticket*.
5. The app opens on a blocking **Enter join ticket** screen. Type `PUF-XXXX-XXXX`.
   - No geometry wizard: a joiner’s blocks arrive with the farm.
   - If the hub cannot be found, an **owner’s address** field appears — A reads theirs off *Settings → Farm sync*.
6. **Join this farm** → ticket resolves over the LAN → Hot + bones pull from Freenet → diary/issues + map boundaries appear.
   - **Off the owner's Wi‑Fi?** The LAN lookup fails and the **Freenet slot** answers instead, provided this device's own node is running and the device session is unlocked. Give Opennet a few minutes after A's send.
7. Verify: Dashboard diary count, Orchard map blocks, optional **Local counts**. The confirmation names the preset ("Joined as Field only"), and the nav holds that preset's modules and nothing else.

Offline satellite basemap packs stay available to a joiner — *Look around first* defers the gate for an operator who is out of range of the owner’s Wi‑Fi.

---

## Pass criteria

| # | Check |
|---|--------|
| 1 | Both laptops: Freenet 0.2 node running, ws02 peer **connected** |
| 2 | A: **Send this farm to Freenet** succeeds; short ticket shown |
| 3 | B: FarmCode recover → **same `farmId`**, and B lands on **Enter join ticket** without hunting in Settings |
| 4 | B: short ticket resolves over LAN → diary/issues match A |
| 5 | B: map shows A’s **blocks/pins/tracks/viewport** |
| 6 | B: never sees `/farm-setup`; the session takes the manifest’s role, and the nav matches the preset — a `field_only` ticket gives Map and Diary and **not** Financials or Farm Management |
| 7 | B: indexed pull alone **fails** before the ticket (empty index) |
| 8 | B **off** the owner’s Wi‑Fi, own Freenet node running: the same ticket resolves via the Freenet slot (§ Freenet slot contract). Allow a few minutes after A’s send for Opennet to propagate |
| 9 | B off the owner’s Wi‑Fi with **no** node of its own: a clear message naming both routes, not a stack trace |

---

## AppImage A→B (passed ~2026-08-04)

**The milestone run.** Both laptops ran only `release/PUF-AM-0.1.0.AppImage` — no repo clone, no `npm ci`, no `npm run dev`, no `freenet network`, no browser. The Freenet node is the one bundled inside the AppImage (`mode=managed source=bundled`), living under `~/.config/PUF-AM/freenet/`.

> **Historical record — the steps below describe the raw FN02 ticket flow as it was on 2026-08-04.** That path still works and is now reached under **Advanced** in the send and join cards. The current flow is the short ticket above.

| Pass criterion | AppImage result |
|---|---|
| 1 · both nodes up, ws02 peer connected | ✓ bundled node on each laptop |
| 2 · A publishes, join ticket copied | ✓ Hot + bones URIs |
| 3 · B FarmCode recover → same `farmId` | ✓ from a blank machine |
| 4 · B fetch → diary/issues match A | ✓ |
| 5 · B map shows A's blocks/pins/tracks/viewport | ✓ |
| 6 · indexed pull alone fails before ticket paste | ✓ empty index, by design |

### The flow that passed

**Laptop A**

1. Launch the AppImage with `MIST_FREENET=1` (or launch plain and use Settings → *Mist workshop* → **Start Freenet node**).
2. Login → *Experimental: create offline mist farm* → **write the FarmCode down** → set device PIN.
3. Settings → *Mist workshop* → backend **Mist IndexedDB**, unlock the device session.
4. Draw boundaries on the Orchard map; add a diary entry.
5. **Connect Freenet peer** → **Publish farm to Freenet (Hot + bones)** → **Copy join ticket**.
6. Hand B three things: **FarmCode**, **device PIN**, **join ticket**.

**Laptop B** (blank — never had this farm)

1. Launch the same AppImage.
2. Login → **Recover with FarmCode** → A's code + same PIN. Same `farmId`; diary and map are empty, which is correct.
3. Settings → *Mist workshop* → **Connect Freenet peer**.
4. Paste the join ticket → **Fetch farm from Freenet**.
5. Diary entries and A's boundaries appear.

### What this proves and what it does not

**Proves:** a farm recovers onto a machine that has never seen it, from a paper code plus an encrypted blob on Opennet, with no account, no server, and no operator-installed Freenet. Everything on the wire was sealed before it left A.

**Does not prove:** field conditions (this was a bench pass on two laptops), Windows (`freenet.exe` still unlaunched), or unattended sync — the join ticket is still a manual handoff, though since ~2026-08-09 it no longer has to be handed over on the owner's Wi‑Fi (see [§ Freenet slot contract](#freenet-slot-contract-shipped-2026-08-09)). Opennet bootstrap latency is still real: expect a wait between A's publish and B's first successful fetch.

---

## Opennet gaps (expect in workshop)

| Gap | Symptom | Mitigation |
|-----|---------|------------|
| **Bootstrap time** | GET 404 for minutes after A’s PUT | Wait 5–15 min; retry Fetch |
| **Peer count / NAT** | Slow GET behind CGNAT | Both on Opennet; avoid VPN |
| **No deterministic URI** (Hot/bones) | Each re-publish = **new** FN02 ids for the *pack* blobs | Use the **latest** join ticket; a re-send mints a new one. The **slot** address is stable — it is the pack URIs behind it that move |
| **Slot not yet propagated** | B off the owner's Wi‑Fi gets *"No join slot at that address yet"* | Opennet needs a few minutes after A's send. Retry, or join on A's Wi‑Fi where the LAN resolver answers instantly |
| **Joiner has no node** | Freenet resolver cannot run at all | The slot lifts the need for the *owner's* Wi‑Fi, not the need for a network. Start the node (Settings → Mist workshop) or use A's Wi‑Fi |
| **Joiner device locked** | *"Unlock this device (device PIN)"* before a Freenet ticket works | The slot address derives from the FarmSeed, so the PIN must be entered first. LAN resolution does not need it |
| **Two AppImages, no mDNS** | Loopback-only desktop hubs cannot see each other | Owner-address field, or raw FN02 ticket |
| **fdev missing on A** | PUT fails / pending | Install Freenet 0.2 dev tools; `FDEV_BIN` |
| **Split index** | B has empty `freenet-index.json` | By design — use join ticket |
| **LAN vs localhost** | B browsing A’s `:3000` breaks IDB | Each laptop uses **own** `localhost:3000` |

---

## Automated tests (either laptop)

```bash
npm test -- src/mist/bonesGeometry.test.ts \
  src/mist/mistJoinTicket.test.ts \
  src/mist/joinTicketResolver.test.ts \
  src/mist/mistJoinRouting.test.ts \
  tests/joinTicket.test.ts \
  tests/api/joinTicketRoutes.test.ts \
  units/mist-freenet/freenet02-transport.test.ts \
  src/mist/mistDisasterRecovery.test.ts \
  units/mist-freenet/freenet02-slot.test.ts \
  src/mist/joinSlotFreenet.test.ts \
  tests/freenetVendorManifest.test.ts
```

The slot contract's own tests are Rust, and need `--features contract` — the `#[contract]` macro expands into freenet-stdlib export shims that are feature-gated, so a bare `cargo test` fails to compile:

```bash
cargo test --manifest-path units/mist-freenet/contracts/slot-contract/Cargo.toml --features contract
```

Confirm the vendored WASM is what that source produces, and that both pinned hashes still match it:

```bash
npm run mist:build:slot        # rebuild; refuses to re-pin without --accept-new-hash
npm run desktop:verify:pack    # checks pack-contract AND slot-contract
```

Live node (optional):

```bash
FREENET_LIVE=1 npm test -- units/mist-freenet/freenet02-live.test.ts

# Real put → get of a join slot, at an address derived from a ticket alone.
# The only test where our derivation, the vendored code hash, and a node's idea
# of where a contract lives all have to agree.
FREENET_LIVE_WS=1 npm test -- units/mist-freenet/freenet02-slot-live.test.ts
```

---

## Single-laptop regression

Single-machine publish → wipe → recover still works via indexed URI. See [`MIST_TWO_LAPTOP_SMOKE.md`](MIST_TWO_LAPTOP_SMOKE.md).

---

## Production UI + local Freenet sidecar (`am.pufworks.farm`) — **workshop / web only**

> **Not the desktop path.** The AppImage carries its own Freenet node and its own Express on loopback, so it never calls `am.pufworks.farm` for `/api/mist/freenet/*` and never needs `npm run dev`. This section stays for browser-based workshop use and for anyone driving the Cloud Run UI from a laptop. See [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) §6.2.

Cloud Run hosts the **Firebase + mist UI** at `https://am.pufworks.farm`. Freenet 0.2 still runs **on each laptop** (`freenet network` → `127.0.0.1:7509`). The container cannot reach your Fedora node.

**Pattern:** browse production HTTPS; Freenet publish/pull API calls go to **local Express** on the same laptop.

| Surface | Where it runs |
|---------|----------------|
| UI, Firebase Auth, maps, weather | `https://am.pufworks.farm` (Cloud Run) |
| `/api/mist/freenet/*` | `http://127.0.0.1:3000` (local `npm run dev` sidecar) |
| Freenet 0.2 node | `127.0.0.1:7509` (local `freenet network`) |

Build bakes `VITE_MIST_EXPERIMENTAL=true`. When the page is HTTPS on `am.pufworks.farm` (or `*.run.app`), the client defaults `VITE_MIST_FREENET_API` to `http://127.0.0.1:3000`. Override in `.env` if your sidecar uses another port.

### Each laptop (A and B)

```bash
# Terminal 1 — Freenet Opennet
freenet network

# Terminal 2 — local API sidecar (Freenet peer in-process)
cd Walnut_farm_manager
git pull origin master && npm ci
export FREENET_TRANSPORT=ws02
export MIST_FREENET=1
npm run dev
# listens on http://127.0.0.1:3000 — CORS allows https://am.pufworks.farm
```

### Browser

1. Open **`https://am.pufworks.farm`** (not `localhost:3000` — IndexedDB is per-origin).
2. Login / mist farm / Settings → Mist workshop.
3. Amber banner confirms sidecar URL when production routing is active.
4. Run the same A → B join-ticket flow as localhost dev (FarmCode, publish, paste ticket, fetch).

Cloud Run sets `MIST_FREENET_DISABLED=1` so production container Freenet routes return 503 — intentional.

---

## Freenet slot contract (shipped ~2026-08-09)

A short ticket now resolves **off the owner's Wi‑Fi**. The joiner still needs a Freenet node of its own — the bundled one in the AppImage, or `freenet network` beside `npm run dev` — but it no longer needs the *owner's* laptop awake, reachable, or on the same network.

### Why it was blocked — it was our contract, not Freenet (checked 2026-08-07)

An earlier note here said "needs a **mutable** Freenet 0.2 contract", which pointed at the wrong thing. Freenet already does what this design needs:

| Freenet 0.2 fact | Consequence |
|---|---|
| An instance is addressed `id = blake3(code_hash ‖ parameters)` | The address can be **anything we can derive**, provided it goes in `parameters` |
| `parameters` is an arbitrary byte blob — conventionally the owner's public key | A 32-byte `HKDF(farmSeed, …)` slot id is a normal thing to put there |
| `ContractInterface` has `update_state` / `get_state_delta` | Mutability is a property of the **WASM**, not a capability the network withholds |

The blocker was the **bundled pack contract's own convention**: it sets `parameters = blake3(state)` ([`units/mist-freenet/src/freenet02-pack.ts`](../units/mist-freenet/src/freenet02-pack.ts), `packContractInstanceId()`). That makes its address a function of its content, which is exactly right for immutable blobs and fatally wrong for a slot: **a joiner holding only `PUF-XXXX-XXXX` cannot compute where to look, because the address depends on the manifest bytes they are trying to fetch.** It is circular, so no key-derivation scheme on our side rescues it — and note this is a *different* problem from "cannot update in place", which is what the old wording implied.

### How the slot breaks the circle

The slot contract puts a **derived slot id** in `parameters` instead of a hash of the state. Both machines compute it from things they already hold — the owner after publishing, the joiner after FarmCode recovery:

```text
slot id     = HKDF(FarmSeed, "freenet-join-slot:PUF-K7M2-9Q4X")   32 bytes
signing key = HKDF(FarmSeed, "freenet-join-slot-key")             32-byte ed25519 seed
parameters  = slot id ‖ ed25519 public key                        64 bytes
instance id = BLAKE3(code hash ‖ parameters)                      32 bytes
URI         = FN02@<base58 instance id>
```

Three properties this buys, each of which is a decision rather than a side effect:

| Property | Why it holds |
|---|---|
| **The address is stable across re-publishes** | It depends on the ticket and the farm, not on the manifest bytes. Re-sending a farm refreshes the slot in place instead of minting a new URI. |
| **A ticket overheard on its own is useless** | The FarmSeed is in the derivation, so `PUF-K7M2-9Q4X` alone points nowhere and the network never sees a value derived from the ticket in the clear. |
| **Only a FarmCode holder can write the slot** | The verifying key is in `parameters`, so it is part of the address. A peer that learns the address by watching a PUT cannot serve its own manifest at it. |

The verifying key has to be in `parameters` rather than in the state — if it lived in the state, anyone could put their own key at the same address. And because the two slots of one farm share a verifying key, the **slot id is inside the signed message**, or a state signed for one ticket would verify in another ticket's slot.

State layout, sequence-number rules, and the byte-for-byte conformance test with the TypeScript encoder are documented in [`units/mist-freenet/contracts/slot-contract/src/lib.rs`](../units/mist-freenet/contracts/slot-contract/src/lib.rs).

### What shipped

| Piece | Where |
|---|---|
| Rust/WASM slot contract (17 unit tests) | [`units/mist-freenet/contracts/slot-contract`](../units/mist-freenet/contracts/slot-contract) |
| Vendored artifact + pinned sha256 / code hash | `units/mist-freenet/assets/slot-contract.wasm`, `scripts/freenet-binaries.json` → `slotContract` |
| Rebuild + re-pin script | `npm run mist:build:slot` ([`scripts/build-slot-contract.mjs`](../scripts/build-slot-contract.mjs)) |
| Slot id / signing / state codec (browser-safe) | [`units/mist-freenet/src/freenet02-slot.ts`](../units/mist-freenet/src/freenet02-slot.ts) |
| AEAD seal for the manifest payload | [`units/mist-freenet/src/join-slot-crypto.ts`](../units/mist-freenet/src/join-slot-crypto.ts) |
| `fdev` PUT/update path (Node only) | [`units/mist-freenet/src/freenet02-fdev-slot.ts`](../units/mist-freenet/src/freenet02-fdev-slot.ts) |
| Hub routes (dumb byte movers) | `POST /api/mist/freenet/slot/publish`, `GET /api/mist/freenet/slot/:instanceId` |
| Publish on send, resolve on join | [`src/mist/joinSlotFreenet.ts`](../src/mist/joinSlotFreenet.ts) |
| `FreenetSlotJoinTicketResolver`, second in the walk | [`src/mist/joinTicketResolver.ts`](../src/mist/joinTicketResolver.ts) |

**Two pinned hashes, one artifact.** Every slot address is `BLAKE3(code hash ‖ parameters)`, so `SLOT_CONTRACT_CODE_HASH_B58` in `freenet02-slot.ts` and `slotContract.codeHashB58` in `scripts/freenet-binaries.json` must agree with the shipped WASM. If they drift, publishes still succeed and land where nothing looks. Both are checked by `npm run desktop:verify:pack` and by the hermetic [`tests/freenetVendorManifest.test.ts`](../tests/freenetVendorManifest.test.ts). Re-pinning **moves every slot**, so a ticket already read out to a joiner stops resolving over Freenet — `mist:build:slot` refuses to overwrite the pin without `--accept-new-hash` for that reason.

**Rebuilding** needs `cargo`, `rustup target add wasm32-unknown-unknown`, and `fdev`; the build is reproducible on one toolchain, which is why the artifact is committed rather than built during packaging. Verified bit-for-bit against the pin on rustc 1.97.1 / freenet-stdlib 0.8.5 / fdev 0.3.285.

### What was not traded away

- **Hub auth is unchanged.** `/api/mist/freenet/` is already in `LAN_SCOPE_PREFIXES`, so the two slot routes sit behind the same paired-device token as the rest of the Freenet API (desktop plan §6.4). An unauthenticated publish path bound to `0.0.0.0` would let any device on the shed Wi‑Fi write farm state to the network — worse than the same-Wi‑Fi restriction this work removes.
- **LAN is still first.** `defaultJoinTicketResolvers()` returns LAN then Freenet, so a hub on the same Wi‑Fi still answers in milliseconds and still works with no internet at all.
- **The hub cannot read what it publishes.** The slot id, the signature, and the AEAD seal are all produced in the page from the FarmSeed, so Express moves bytes it can neither read nor forge — the same encrypt-before-upload split Hot and bones already have, extended to the pointer.

### Still open

- The manifest's `permissions` bag: named grants or bitflags. Unchanged by this work.
- **No revocation over Freenet.** A hub prunes an expired manifest off its shelf; nothing prunes a slot. The joiner enforces `expires` after decrypting, so an expired ticket is refused — but the sealed bytes stay at the address until the owner overwrites them with a higher sequence number.
- Sequence numbers are wall-clock milliseconds. Two devices publishing the same ticket within the same millisecond is a tie the contract breaks by keeping what it has.

**No longer queued with it:** whether the Electron shell should offer an **opt-in LAN bind**. It shipped ~2026-08-07 as the **tablet hub** — a second listener on `0.0.0.0`, off until the operator enables it, behind a pairing code that mints per-device tokens (desktop plan §6.4). Two AppImages can now resolve tickets between them over the LAN without the owner-address field, and a tablet can use one as its hub. That removes the "Known gap" noted in § Short join ticket above; the off-network problem it did **not** touch is what the slot contract above closes.
