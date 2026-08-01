# Freenet mist backup — architecture workshop

**Status:** workshop / design sketch (not implemented)  
**Created:** 2026-08-01  
**Companion:** [OFFLINE_MAP_APK.md](./OFFLINE_MAP_APK.md) Phase 3 · [AUTH_INVITE_PIN.md](./AUTH_INVITE_PIN.md) · [CREW_PRESENCE.md](./CREW_PRESENCE.md) P3  
**Goal:** Durable farm records without a paid cloud-storage subscription — local cache for day-to-day use, encrypted Freenet contracts as multi-redundant “mist” backup, Reticulum for live on-farm traffic only.

---

## Confirmed split (from Grok workshop)

| Data type | Transport / storage | Notes |
|-----------|---------------------|-------|
| Live telemetry, personnel movement, temporary messages | **Reticulum only** (device-to-device / on-farm mesh) | Low latency. Maps onto CREW_PRESENCE P3 + future LoRa RNodes. No Freenet. |
| Boundaries, infrastructure, static farm features | Local storage + one-time / change-only sync | Already: `farmGeometryIdb` + `.pufom` / LAN. Rarely touches Freenet. |
| Diary, records, plans, issues | Local cache (user retention) + **encrypted Freenet mist** | Day-to-day from IndexedDB. Occasional older-record fetch / full restore from mist. |

```
Device outbox ──► Firebase Firestore        (today — optional later)
              ├──► LAN shelf / .pufom       (done)
              └──► Freenet mist contracts   (proposed durable layer)
```

This keeps high-frequency traffic on the fast local mesh and puts only durable, lower-frequency records into the global redundant layer.

---

## Why this fits PUF-AM today

We already have the hard parts of a local-first stack:

| Piece | Path | Reuse for mist |
|-------|------|----------------|
| Universal outbox | `localFarmRepo.ts`, `flushFarmOutbox.ts` | Add a Freenet flush adapter alongside Firestore / LAN |
| LWW entity merge | `shared/sync/pufomBundle.ts` `mergeByLww` | Same stamp rules inside contract `update_state` |
| Bundle shape | `PufomBundleV1` (geometry + issues + diary) | Mist contracts carry **records only**; geometry stays local / Reticulum |
| Invite material | invite PIN → farm membership | Derive Freenet contract params + encryption keys (see §2) |
| LAN hub | `lanSyncRoutes.ts`, mDNS / NSD | Preferential hosts: shed Pi / workshop PC also run Freenet peers |

**Photos** stay out of mist contracts for v1 (Storage outbox / local files). Mist is text/JSON records.

---

## Freenet realities (mid-2026)

- Per-contract hard cap ≈ **50 MiB** (`MAX_STATE_SIZE`).
- Default node hosting budget ≈ **1 GiB** of contract state (configurable); eviction under pressure.
- Sync = `summarize_state` → `get_state_delta` → `update_state` (deltas must be commutative).
- Streaming OK for multi-hundred KB to low-MB; tens of MB need efficient deltas + healthy peers.
- Phones: on-demand / lightweight peers. Shed Pi or always-on terminal for active hosting.

A season of diary + issues as gzip JSON is typically well under a few hundred KB → low MB. Comfortable if we keep contracts modest and deltas append-oriented.

---

## Pressure test 1 — Records contract shape

### Recommended: hot + seasonal archive family

One growing contract forever is simplest but eventually fights eviction and delta cost. Prefer:

| Contract | Contents | Typical size | Mutability |
|----------|----------|--------------|------------|
| `farm:{id}:hot` | Last N days of diary + open issues + recent archive stubs | tens–hundreds of KB | Append / LWW upsert often |
| `farm:{id}:season:{yyyy}` or `:{yyyy}-S{n}` | Closed season diary + archived issues | hundreds of KB–low MB | Mostly append; rare corrections |
| `farm:{id}:meta` (tiny) | Season index, retention policy, key epoch, member device labels | < 10 KB | Rare |

Geometry / farm setup stay in local IDB + `.pufom` / Reticulum when in range. Optional later: a separate `farm:{id}:static` mist snapshot for disaster recovery only (change-only pushes).

### State bytes (opaque to Freenet; our format)

Encrypt **before** the contract sees them. Contract state is ciphertext + small public envelope:

```text
MistEnvelope {
  schema: "pufom-mist-1"
  farmId: string          // also in contract Parameters (public)
  keyEpoch: u32           // rotation counter
  nonce: bytes
  ciphertext: bytes       // AEAD(JSON payload)
  sig: bytes              // Ed25519 over envelope fields (member signing key)
}
```

Inner plaintext (after decrypt) for a **hot** contract:

```text
MistHotPayload {
  farmId: string
  updatedAt: ISO
  diary: DiaryEvent[]          // same shape as farmDiary.ts
  issues: FieldIssue[]
  issuesArchive: FieldIssue[]  // recent only; older seasons in archive contracts
  // each entity keeps id + updatedAt for LWW
}
```

Inner plaintext for a **season** archive:

```text
MistSeasonPayload {
  farmId: string
  seasonId: string             // "2026" or "2026-S1"
  range: { start: date, end: date }
  diary: DiaryEvent[]
  issuesArchive: FieldIssue[]
}
```

### How a new diary entry becomes a delta

1. User saves spray / plan → write IndexedDB (`localFarmRepo`) + enqueue outbox (unchanged).
2. When mist sync is due (Wi‑Fi / shed peer / user “Backup now”):
   - Build plaintext upsert `{ kind: "diary", entity }` (or batch of outbox ops).
   - Encrypt → `MistEnvelope`.
   - Submit as Freenet update.
3. Contract `update_state`:
   - Verify signature against member verifying keys in **Parameters**.
   - Decrypt is **not** done in WASM if we keep payload opaque — better: contract only validates envelope auth + size; **merge of plaintext happens on the client** after decrypt, then client publishes the new full encrypted state *or* an encrypted delta blob the contract appends as a log entry.
4. Prefer **append-only encrypted log** inside the contract for cheap deltas:

```text
MistState {
  head: u64
  entries: [{ seq, envelope }]   // each entry = one encrypted upsert/delete batch
}
```

- `summarize_state` → `{ head, hash_of_entry_ids or max_seq }`
- `get_state_delta` → entries with `seq > peer.max_seq`
- Client materializes IndexedDB view by replaying entries it does not yet have (decrypt locally).

This mirrors Freenet’s own “posts by id” example and keeps day-to-day sync small even as history grows.

**Retrieval of one old entry:** scan local cache first; if missing, fetch the season contract (or hot), decrypt, find by `id`. No need for Freenet-side query — targeted fetch is “get this contract’s state / missing deltas,” then local index.

**Full restore:** pull `meta` → all season contracts + hot → replay into IDB. Slow path; acceptable.

### Merge / conflict rules

Reuse existing LWW:

- Same `id` → higher `updatedAt` wins (`mergeByLww`).
- Deletes = tombstone entity with `deleted: true` + stamp (do not silently drop; keep tombstones in hot until compacted into season archive).
- Commutativity: applying encrypted log entries in `seq` order (or LWW on materialize) must converge. Prefer **seq-ordered append log** at the contract layer; LWW only when materializing to the app model.

### Compaction

When hot exceeds a soft budget (e.g. 256 KB plaintext or 90 days):

1. Client (or shed peer) copies closed entries into the current season contract.
2. Appends a “compact” log entry that drops those ids from hot’s materialized view.
3. Updates `meta.seasonIndex`.

WASM must still enforce hard size caps so a buggy client cannot blow past 50 MiB.

---

## Pressure test 2 — Invite code → Freenet params + keys

### What invite PIN is today

- Owner creates farm → `farmId` + recovery PIN.
- Worker redeem → Firebase custom token + `users/{uid}` membership.
- PIN hashed server-side (`access_pins`); **never stored on device**.
- Device gets Firebase session; optional local unlock PIN.

Mist must work **without Firebase** for restore on a wiped device. Invite / recovery material therefore has to carry crypto, not just Auth.

### Proposed key hierarchy

```text
FarmMasterSecret (32 bytes)
  ├── mist_root = HKDF(FarmMasterSecret, "pufom-mist-v1"|farmId)
  │     ├── enc_key   = HKDF(mist_root, "enc"|keyEpoch)     // AEAD for envelopes
  │     └── mac_key   = HKDF(mist_root, "mac"|keyEpoch)     // optional
  ├── member_signing (Ed25519) per device or per UID
  └── reticulum_channel_key (separate — live mesh only)
```

| Material | How obtained | Role |
|----------|--------------|------|
| **Farm recovery code** | Shown once at create-farm (extend today’s recovery PIN) | Encodes or wraps `FarmMasterSecret` + `farmId`. Enough to restore mist + re-join. |
| **Worker invite** | Short PIN as today for Auth; **plus** one-time QR / deep link for mist bootstrap | After redeem, device receives wrapped `enc_key` + its signing keypair (or derives member key from invite secret). |
| **Contract Parameters** (public) | `farmId`, `keyEpoch`, list of member **verifying** keys, soft size limits, schema id | WASM uses these to accept/reject envelopes. No decryption keys in Parameters. |
| **Contract Instance** | Deterministic from WASM code hash + Parameters | All farm members subscribe to the same hot / season keys. |

### Invite flows

**A. Create farm (owner)**

1. Generate `FarmMasterSecret` on device (or server once, returned once — prefer device-generated so server never sees mist keys).
2. Derive mist keys; generate owner signing keypair.
3. Show **recovery kit**: farm name, `farmId`, recovery code (encodes master secret), optional printable QR.
4. Publish empty `meta` + `hot` contracts (via shed peer or first online Freenet node).
5. Existing Firebase create-farm still runs if cloud Auth is enabled — orthogonal.

**B. Invite worker**

1. Admin mints invite: role + modules (unchanged) **and** a mist bootstrap blob:
   - `farmId`, `keyEpoch`, wrapped `enc_key` (wrapped to invite ephemeral key or to a code-derived key),
   - permission to register a new verifying key into Parameters (admin-signed “add member” update).
2. Worker redeems PIN for Firebase (optional path) **and** scans QR / pastes bootstrap for mist.
3. Device stores mist keys in secure storage (Android Keystore / encrypted IDB), not in plaintext prefs.

**C. New device / wipe restore**

1. Enter recovery code (or worker re-invite).
2. Derive keys → subscribe to `meta` + `hot` → pull seasons as needed → materialize IDB.
3. Re-register device signing key (admin approval or recovery-code authority).

### Security notes

- Firebase PIN hash alone must **not** be sufficient to decrypt mist (PIN entropy is weak). Recovery / bootstrap material needs high entropy (e.g. 128-bit in a QR + short human checksum).
- Revoke member = bump Parameters (remove verifying key) and optionally rotate `keyEpoch` (re-encrypt hot; archives can stay under old epoch labels).
- Preferential replication: farm members’ nodes + shed Pi pin the farm’s contracts so random global eviction hurts less.

---

## Pressure test 3 — One contract vs family

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Single growing contract | Simplest WASM; one subscribe | Deltas eventually heavy; eviction risk; restore always full | Reject for long-lived farms |
| Hot only + local prune | Easy | No deep history in mist | OK for demo only |
| **Hot + season archives + meta** | Small daily deltas; restore can be selective; maps to diary mental model | Slightly more client logic; season rollover job | **Adopt** |
| Per-entity contracts | Max parallelism | Contract sprawl; param/key overhead | Reject |

**Season boundary:** calendar year for broadacre / tree crops; optional half-year for intensive hort. User override in Farm setup → written into `meta`.

**Static geometry:** not in the hot family. Optional annual `static` mist snapshot for off-site disaster recovery; day-to-day remains IDB + Reticulum / LAN `.pufom`.

---

## Mapping onto existing adapters

Proposed flush order when connectivity allows:

1. Always: IndexedDB (source of truth on device).
2. If LAN hub: push `.pufom` / shelf (done).
3. If Freenet peer available (local node or shed): enqueue mist log entries from outbox ops (`diary` / `issues` / `issues_archive`).
4. If Firebase configured: existing `flushFarmOutbox` (unchanged until product decides cloud is optional).

UI: extend **Settings → Offline & sync** with Mist status (peer up?, last backup seq, “Backup now”, “Restore from mist”).

Crew presence / telemetry: continue CREW_PRESENCE P1–P2; P3 mesh should target **Reticulum**, not Freenet.

---

## Implementation slices (when we leave workshop)

| Slice | Scope | Depends |
|-------|-------|---------|
| M0 | This doc + ADR decision: mist for records, Reticulum for live | — |
| M1 | Pure TS: mist envelope encrypt/decrypt, log materialize, LWW replay (unit tests, no Freenet) | M0 |
| M2 | Rust WASM contract: append-only log, summarize/delta, param member keys | M1 |
| M3 | Capacitator / shed Freenet peer glue + Offline & sync UI | M2 |
| M4 | Invite / recovery QR carrying mist bootstrap; key epoch rotate | M3 + AUTH |
| M5 | Season compaction job; preferential pin on shed Pi | M3 |
| M6 | Optional: drop Firebase as required path for records (product call) | M4–M5 stable |

---

## Open questions

1. **Who runs the Freenet node on Android?** Embedded lightweight peer vs “backup only when shed Pi is reachable”? (Battery argues for shed-first.)
2. **Photos / basemap packs** — keep local + optional USB / object store; never Freenet mist in v1?
3. **Firebase role after mist** — dual-write indefinitely, or cloud becomes optional weather/auth only?
4. **Reticulum identity** — same farm master secret derivation, or fully separate channel keys from LoRa provisioning?

---

## Bottom line

- Telemetry / presence → Reticulum (extends CREW_PRESENCE P3). Correct.
- Geometry → local + LAN / Reticulum change-sync. Already mostly built.
- Diary / issues / plans → local IDB + **encrypted Freenet append-log contracts** (hot + seasons + meta). Feasible within 50 MiB; deltas stay small.
- Invite PIN Auth stays for membership UX; **high-entropy recovery / QR bootstrap** carries mist keys so wipe-restore does not depend on Firebase.
- Next build step when ready: **M1** (crypto + log materialize in TS against fixtures) before any WASM/network work.
