# Mist two-Fedora Freenet 0.2 smoke (Opennet)

**Status: PASSED on the packaged AppImage (~2026-08-04).** All six pass criteria met with **zero terminals** on either laptop — see [§ AppImage A→B](#appimage-ab-passed-2026-08-04). The `npm run dev` + sidecar route below is kept as the **workshop/web** path; it is no longer how the desktop app is meant to be run.

**Target:** two Fedora laptops on **real Freenet 0.2 Opennet** — A sets up farm, B joins via FarmCode, B pulls **Hot (diary/issues) + bones (boundaries)** from Freenet.

**Cross-device sync (v1):** **Option A — join ticket handoff.** Laptop A publishes Hot + farm-geometry bones → copy **join ticket** (`{ hotUri, bonesUri }`). Laptop B after FarmCode recovery has an **empty index**; B pastes the ticket and **Fetch farm from Freenet**.

**Option B (deferred):** deterministic addressing from `farmId` requires a **mutable** Freenet 0.2 contract. Current **pack-contract** is **immutable** — each publish gets a new URI. See [`units/mist-freenet/src/freenet-keys.ts`](../units/mist-freenet/src/freenet-keys.ts).

Related: [`MIST_TWO_LAPTOP_SMOKE.md`](MIST_TWO_LAPTOP_SMOKE.md) (pre-Freenet identity), [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist network.

---

## Join ticket format (v1)

```json
{
  "v": 1,
  "hotUri": "FN02@…",
  "bonesUri": "FN02@…",
  "hotContentHash": "optional sha256 hex",
  "bonesContentHash": "optional sha256 hex"
}
```

Also accepted on laptop B: **two lines** (hot URI, then bones URI).

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

## Laptop A — create, publish, copy join ticket

1. **Create mist farm** — Login → *Experimental: create offline mist farm* → write **FarmCode** → set device PIN.
2. **Settings → Mist workshop** — backend **Mist IndexedDB**; unlock device session.
3. Draw **boundaries** on Orchard map (blocks/pins/tracks).
4. Add **diary** + **field issue**.
5. **Connect Freenet peer** — status `connected (ws02 @ …)`.
6. **Publish farm to Freenet (Hot + bones)** — copies join ticket with both URIs.
7. Hand off to B: **FarmCode**, **device PIN**, **join ticket** (USB, paper, Signal).

---

## Laptop B — recover, paste ticket, fetch, verify

1. Same commit: `git pull && npm ci`.
2. Same env: `FREENET_TRANSPORT=ws02`, `VITE_MIST_EXPERIMENTAL=true`, `npm run dev`.
3. Start **local Freenet 0.2 Opennet** node.
4. Login → **Recover with FarmCode** → A’s code + same PIN.
5. Confirm **same `farmId`** in Settings; local diary/issues/geometry **empty** (expected).
6. Settings → Mist workshop → **Connect Freenet peer**.
7. Paste A’s **join ticket** into the textarea.
8. **Fetch farm from Freenet** → diary/issues + map boundaries appear.
9. Verify: Dashboard diary count, Orchard map blocks, optional **Local counts**.

---

## Pass criteria

| # | Check |
|---|--------|
| 1 | Both laptops: Freenet 0.2 node running, ws02 peer **connected** |
| 2 | A: **Publish farm to Freenet** succeeds; join ticket copied |
| 3 | B: FarmCode recover → **same `farmId`** |
| 4 | B: **Fetch farm from Freenet** → diary/issues match A |
| 5 | B: map shows A’s **blocks/pins/tracks/viewport** |
| 6 | B: indexed pull alone **fails** before ticket paste (empty index) |

---

## AppImage A→B (passed ~2026-08-04)

**The milestone run.** Both laptops ran only `release/PUF-AM-0.1.0.AppImage` — no repo clone, no `npm ci`, no `npm run dev`, no `freenet network`, no browser. The Freenet node is the one bundled inside the AppImage (`mode=managed source=bundled`), living under `~/.config/PUF-AM/freenet/`.

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

**Does not prove:** field conditions (this was a bench pass on two laptops), Windows (`freenet.exe` still unlaunched), or unattended sync — the join ticket is still a manual handoff because pack-contract URIs are immutable (Option B, below). Opennet bootstrap latency is still real: expect a wait between A's publish and B's first successful fetch.

---

## Opennet gaps (expect in workshop)

| Gap | Symptom | Mitigation |
|-----|---------|------------|
| **Bootstrap time** | GET 404 for minutes after A’s PUT | Wait 5–15 min; retry Fetch |
| **Peer count / NAT** | Slow GET behind CGNAT | Both on Opennet; avoid VPN |
| **No deterministic URI** | Each re-publish = **new** FN02 ids | Copy **latest** join ticket |
| **fdev missing on A** | PUT fails / pending | Install Freenet 0.2 dev tools; `FDEV_BIN` |
| **Split index** | B has empty `freenet-index.json` | By design — use join ticket |
| **LAN vs localhost** | B browsing A’s `:3000` breaks IDB | Each laptop uses **own** `localhost:3000` |

---

## Automated tests (either laptop)

```bash
npm test -- src/mist/bonesGeometry.test.ts \
  src/mist/mistJoinTicket.test.ts \
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

## Next (Option B)

- Mutable mist contract so B can GET without URI paste.
- Until then, join ticket handoff is the supported two-laptop path.
