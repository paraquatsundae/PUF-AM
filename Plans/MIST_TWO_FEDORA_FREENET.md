# Mist two-Fedora Freenet 0.2 smoke (Opennet)

**Status: PASSED on the packaged AppImage (~2026-08-04).** All six pass criteria met with **zero terminals** on either laptop — see [§ AppImage A→B](#appimage-ab-passed-2026-08-04). The `npm run dev` + sidecar route below is kept as the **workshop/web** path; it is no longer how the desktop app is meant to be run.

**Target:** two Fedora laptops on **real Freenet 0.2 Opennet** — A sets up farm, B joins via FarmCode, B pulls **Hot (diary/issues) + bones (boundaries)** from Freenet.

**Cross-device sync (v2 — current):** **short join ticket resolved over LAN.** Laptop A publishes Hot + farm-geometry bones to Freenet as before, then mints a ticket like `PUF-K7M2-9Q4X` and registers a **join manifest** on its own LAN hub. Laptop B recovers with the FarmCode, is **immediately** asked for the ticket, resolves it over the LAN to get the FN02 URIs, and pulls the farm from Freenet. Freenet still carries all farm data; the LAN only carries the *addresses*.

The raw FN02 ticket (v1, below) survives under **Advanced** on both sides — it needs no Wi‑Fi to the owner, at the cost of being a JSON blob nobody can read off a whiteboard.

**Deferred — Freenet slot contract:** resolving a ticket without being on the owner's Wi‑Fi needs a **mutable** Freenet 0.2 contract. The current **pack-contract** is **immutable**, so every publish gets a new URI and there is nowhere to put a manifest a joiner can look up remotely. Seam is in place: [`src/mist/joinTicketResolver.ts`](../src/mist/joinTicketResolver.ts) `TODO(mist-freenet-slot)`. See [`units/mist-freenet/src/freenet-keys.ts`](../units/mist-freenet/src/freenet-keys.ts).

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
  "permissions": { "…": true },
  "expires": "2026-08-11T00:00:00.000Z",
  "ticket": "PUF-K7M2-9Q4X",
  "hotContentHash": "optional sha256 hex",
  "bonesContentHash": "optional sha256 hex"
}
```

| Field | Notes |
|-------|-------|
| `role` | `owner \| admin \| farmer \| viewer` — the mist vocabulary. Default for a shared ticket is **`farmer`**. |
| `permissions` | Reserved. The four role names will not survive contact with real crews; a v2 manifest that already carries a grants bag means the next step is not a v3 wire format. |
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

**Known gap — the Electron shell binds loopback only** (`desktop/localApi.ts`, plan §6.3) and does not advertise on mDNS, so one AppImage cannot yet discover another. Between two AppImages, use the owner-address field (the owner reads their address off *Settings → Farm sync*) or fall back to the raw FN02 ticket. Deciding whether the desktop shell should offer an opt-in LAN bind is queued with the Freenet-slot work.

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
6. Pick **what this ticket grants** (default `farmer`) → **Send this farm to Freenet**.
7. Read the short ticket out to B: **FarmCode**, **device PIN**, **`PUF-XXXX-XXXX`**.
8. **Stay on and on the same Wi‑Fi** while B joins — this hub answers the ticket lookup.

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
7. Verify: Dashboard diary count, Orchard map blocks, optional **Local counts**. Session role is whatever the manifest granted.

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
| 6 | B: never sees `/farm-setup`; session role is the manifest’s role (`farmer` by default) |
| 7 | B: indexed pull alone **fails** before the ticket (empty index) |
| 8 | B off the owner’s Wi‑Fi: clear *“Join on the same Wi‑Fi as the farm owner for now”* error, not a stack trace |

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

**Does not prove:** field conditions (this was a bench pass on two laptops), Windows (`freenet.exe` still unlaunched), or unattended sync — the join ticket is still a manual handoff because pack-contract URIs are immutable (see *Next — Freenet slot contract*). Opennet bootstrap latency is still real: expect a wait between A's publish and B's first successful fetch.

---

## Opennet gaps (expect in workshop)

| Gap | Symptom | Mitigation |
|-----|---------|------------|
| **Bootstrap time** | GET 404 for minutes after A’s PUT | Wait 5–15 min; retry Fetch |
| **Peer count / NAT** | Slow GET behind CGNAT | Both on Opennet; avoid VPN |
| **No deterministic URI** | Each re-publish = **new** FN02 ids | Use the **latest** join ticket; a re-send mints a new one |
| **Ticket needs owner's Wi‑Fi** | B off-network cannot resolve `PUF-…` | Same Wi‑Fi, or owner-address field, or raw FN02 ticket under *Advanced* |
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
  src/mist/mistDisasterRecovery.test.ts
```

Live node (optional):

```bash
FREENET_LIVE=1 npm test -- units/mist-freenet/freenet02-live.test.ts
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

## Next — Freenet slot contract (deferred)

Short tickets work today but only inside the owner's Wi‑Fi. Lifting that needs a **mutable** Freenet 0.2 contract:

- Owner writes the join manifest to a slot addressed by `HKDF(farmSeed, "freenet-join-slot" | ticket)`.
- Joiner GETs that slot instead of asking a LAN hub — a ticket then works from a phone anywhere.
- Drop-in point: add `FreenetSlotJoinTicketResolver` beside `LanJoinTicketResolver` in `defaultJoinTicketResolvers()` ([`src/mist/joinTicketResolver.ts`](../src/mist/joinTicketResolver.ts)). Nothing else in the join flow should need to change.
- Same blocker as the immutable FN02 URIs: pack-contract cannot be updated in place.

Also queued with it: whether the Electron shell should offer an **opt-in LAN bind** so two AppImages can resolve tickets without the owner-address field, and whether the manifest's `permissions` bag becomes named grants or bitflags.
