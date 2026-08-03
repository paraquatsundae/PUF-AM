# Mist two-laptop smoke (pre-Freenet)

**Status (2026-08-03):** **Recovery pass achieved** — two-laptop FarmCode recovery succeeded on localhost (Laptop A create → Laptop B recover → same `farmId`). Bones and Hot remain per-device; no cross-laptop sync yet. **Live Freenet is not next** without a pre-Freenet workshop ([`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Pre-Freenet workshop).

Validate **FarmCode identity**, **IndexedDB mist store**, and **local → Hot bridge** on two Fedora laptops **without** a Hyphanet/Freenet node. Each browser profile keeps its own IndexedDB and `localStorage`; there is no cross-device sync until Freenet ships.

## What you CAN test (no Freenet)

| Area | Laptop A | Laptop B |
|------|----------|----------|
| Repo | `git pull` on `master` | Clone or `git pull` same commit |
| Dev server | `localhost:3000` only | `localhost:3000` only — **not** LAN URL to A |
| Create farm | Login → *Experimental: create offline mist farm* → copy **FarmCode** (`mist-fc-1`) | — |
| Recover farm | — | Login → *Recover with FarmCode* → same paper code + device PIN if A used one |
| Same `farmId` | Settings → note farm id / FarmCode decodes to same id on B | After recover, farm id matches A |
| Device PIN | Optional 4-digit PIN; unlock gate after reload | Same PIN as A (derived from same FarmSeed) |
| Bones workshop | Settings → Mist workshop → *Bones put/get smoke* → reload → *Read last blob* | Same flow on **B’s empty** IndexedDB (B’s own blob, not A’s) |
| Local diary/issues | Dashboard / map — add diary entry or issue | B’s diary/issues are **empty** until entered locally |
| Hot publish | Settings → *Publish local diary/issues to mist Hot* | Same buttons work on B’s **local** data only |
| Hot read | *Read Hot back (smoke)* after publish | Reads B’s hot/current (empty until B publishes) |
| Auto Hot mirror | Save diary/issue while mist session unlocked → debounced auto-publish | Same on B for B’s saves |
| Farm export JSON | Settings / export — download `*_farm-export.json` (proves A has data) | **No import path** — export is evidence only |

## What you CANNOT test (honest limits)

- **B will not see A’s IndexedDB** bones, Hot blobs, or local diary/issues. FarmCode recovery only restores **cryptographic identity** (`farmId`, FarmSeed HKDF keys), not another device’s browser storage.
- **No Freenet wire** — `FreenetMistStore` / FCP / Hyphanet are not in the browser app path yet. Hot lives in **this device’s** `IndexedDbMistStore` only.
- **No farm-export import** — there is no UI or API to load A’s `farm-export.json` into B’s local store or Hot. Optional manual JSON inspection on B does not prove sync.
- **No cross-laptop Hot read** — even with identical FarmCode, A’s *Read Hot* and B’s *Read Hot* are independent unless Freenet (or manual blob copy) is added later.

**Bottom line:** A proves create → local data → Hot publish/read end-to-end. B proves **recover with paper FarmCode → same farmId → empty local mist until Freenet**.

---

## Prerequisites (both laptops, Fedora)

```bash
# Node 20+ and git
sudo dnf install -y nodejs npm git   # or nvm/fnm if you prefer

git clone <repo-url> Walnut_farm_manager   # B only, once
cd Walnut_farm_manager
git checkout master && git pull            # both before test

npm ci
```

Keep dev server alive if using Cursor/agent shells (optional):

```bash
nohup bash scripts/dev-keepalive.sh >/tmp/pufam-dev-keepalive.out 2>&1 & disown
# health: http://localhost:3000/api/health
```

---

## Laptop A — owner setup

1. **Start app**

   ```bash
   cd Walnut_farm_manager
   VITE_MIST_EXPERIMENTAL=true npm run dev
   ```

   Open **http://localhost:3000** (this machine only).

2. **Create mist farm**

   - Login → *Experimental: create offline mist farm*
   - Farm name: e.g. `Two-Laptop Smoke`
   - **Write down FarmCode** (`mist-fc-1…`) on paper — this is the only handoff to B
   - Set a **4-digit device PIN** (recommended; do not skip for this test)
   - Complete farm setup

3. **Confirm backend**

   - Settings → Mist workshop → backend **Mist IndexedDB** (not Firebase)

4. **Bones smoke (single device persistence)**

   - *Bones put/get smoke* → success message
   - Hard refresh (F5) → enter **device PIN** (not FarmCode)
   - *Read last blob* → same payload

5. **Local data → Hot**

   - Add at least one **diary** entry and one **field issue** (Dashboard / map)
   - Settings → Mist workshop → *Publish local diary/issues to mist Hot*
   - Note: record count, content hash prefix, “AEAD” if shown
   - *Read Hot back (smoke)* → same record count
   - Optional: edit diary → wait ~3 s → confirm last-published timestamp updates (auto-mirror)

6. **Optional evidence for B**

   - Export farm JSON (`*_farm-export.json`) — proves A has diary/issues; B cannot import it today

---

## Laptop B — recovery (identity only)

1. **Same commit as A**

   ```bash
   cd Walnut_farm_manager
   git pull origin master
   npm ci
   VITE_MIST_EXPERIMENTAL=true npm run dev
   ```

   Open **http://localhost:3000** on **B only** (do not browse to A’s IP).

2. **Recover with FarmCode**

   - Login → *Recover with FarmCode*
   - Enter A’s paper **FarmCode** (`mist-fc-1…`)
   - Device PIN: same 4 digits as A
   - Complete setup if prompted

3. **Verify identity**

   - Settings → Mist workshop → backend **Mist IndexedDB**
   - Confirm **farm id** matches A (from FarmCode decode or Settings)
   - Local diary/issues: **empty** (expected)
   - *Read last blob* (bones): **no blob** or B’s own prior workshop run — **not** A’s bones text
   - Hot: *Read Hot back* → **no hot/current** until B adds local data and publishes

4. **B-only Hot smoke (optional)**

   - Add a diary entry on B → *Publish local diary/issues to mist Hot* → *Read Hot back*
   - Confirms Hot pipeline works on B; still unrelated to A’s Hot blob

---

## Pass criteria

| # | Check |
|---|--------|
| 1 | A and B on same `git` commit |
| 2 | A: FarmCode copied; bones survive reload + PIN |
| 3 | A: Hot publish + read after local diary/issue |
| 4 | B: FarmCode recover → **same `farmId`** |
| 5 | B: local bones/Hot **empty** until B writes locally (proves no silent cross-device sync) |
| 6 | Team accepts: **Freenet required** for A→B Hot/bones replication |

---

## Automated checks (either laptop)

```bash
npm test -- tests/mistHotBridge.test.ts units/mist-freenet/hot-crypto.test.ts src/mist/mistDisasterRecovery.test.ts
```

---

## Single-laptop disaster-recovery smoke (Freenet 0.2)

Validates **record → Hot → Freenet → wipe local → recover** on one machine. Requires a running Freenet 0.2 node with WebSocket on `localhost:7509`.

### Server env (restart dev server after setting)

```bash
export FREENET_TRANSPORT=ws02
export VITE_MIST_EXPERIMENTAL=true
npm run dev
```

Optional: `FREENET_WS_URL=ws://127.0.0.1:7509/v0/websocket` if not default.

### UI flow (Settings → Mist workshop)

1. Unlock mist device session (FarmCode + PIN if set).
2. Add at least one **diary** entry and one **field issue**.
3. **Connect Freenet peer** — status should show `connected (ws02 @ …)`.
4. **1. Publish backup (Hot → Freenet)** — local AEAD Hot, then FN02 insert.
5. **Local counts** — note diary/issue counts (optional).
6. **2. Simulate local loss** — confirm destructive dialog. Wipes:
   - `pufom_farm_local` diary, issues, issues_archive, outbox for this `farmId`
   - mist `hot/current` in `pufam-mist-v1`
   - last Hot publish metadata in `localStorage`
7. **Local counts** again — should show zeros.
8. **3. Recover from Freenet** — pull ciphertext, decrypt with FarmSeed, rehydrate local store + refresh UI.

### Preserved vs wiped

| Preserved | Wiped (workshop smoke) |
|-----------|-------------------------|
| FarmCode / mist device session (`FarmSeed`) | `pufom_farm_local` diary/issues/archive + outbox |
| Farm geometry (`farmGeometryIdb`) | Local mist `hot/current` blob |
| Freenet peer copy of Hot (after step 1) | Last Hot publish status in `localStorage` |
| Bones workshop blob (unless you extend wipe opts) | In-memory diary/issue UI until refresh |



### Milestone (~2026-08-03)

Operator workshop: after publish → wipe → recover, **3 diary** entries rehydrated from Freenet 0.2 ws02 (`localhost:7509`); Hot contract hash prefix **`a31a5a98…`**.


**Not committed** — workshop-only; run before field demos.

---

## What remains (post-recovery)

| Item | Status |
|------|--------|
| FarmCode identity recovery (B → same `farmId`) | **Done** (~2026-08-03) |
| Per-device bones / Hot on localhost | **Done** (expected isolation) |
| Cross-device Hot/bones replication (A → B) | **Blocked** — Freenet wire or interim LAN after pre-Freenet workshop |
| Live Hyphanet / FCP go-live | **Blocked** — team workshop on remaining items first |
| Workshop outcome capture | **Pending** — paste team discussion notes into [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Pre-Freenet workshop when ready |

---

## After Freenet (out of scope here)

- Electron main + `FreenetMistStore` + local Hyphanet node
- B pulls A’s Hot/bones via FCP CHK inserts
- `sealHotPeriod()` app trigger + archive/manifest on network

See [`units/mist-freenet/README.md`](../units/mist-freenet/README.md) and [`Plans/MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md).
