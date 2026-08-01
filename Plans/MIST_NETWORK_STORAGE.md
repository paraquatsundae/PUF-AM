# Mist network & storage (experimental fork)

**Status:** Design workshop — **not** the production path.  
**Date:** 2026-08-01  
**Product:** PUF-AM (Ag Manager)

Firebase Auth + invite PINs + Firestore remain the **working production stack**. Mist work must land as an **experimental fork** (branch / feature flag / separate package path) so it cannot break PIN login or Cloud Run hosting.

Authoritative short pointer: [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) § Mist (experimental).

---

## Vision (“mist”, not cloud)

Users download APK / web / Windows–Linux EXE (macOS later). After setup the farm is **fully offline-capable**: local ESRI/basemap packs, boundaries, features, diary/records. No email registration — **name + invite token**; administrator holds a **one-time farm code** (paper wallet).

Connectivity and durability layers:

| Plane | Role |
|-------|------|
| **Local-first** | Authoritative day-to-day copy on each terminal |
| **Reticulum** | On-farm mesh (LoRa RNodes / multi-hop): telemetry, temp messages, map heads-up + asset pull — no Wi‑Fi infrastructure required |
| **Freenet-style mist** | Encrypted, compressed, fragmented durable **records** across opt-in peers worldwide |
| **Offline backups** | Automated encrypted exports (USB/NAS/user cloud) — real multi-year insurance |

Anyone running the app *may* host opaque encrypted fragments. Preferential replication to the farm’s own members and optional shed/Pi pins. No subscriptions; no central operator required for core operation.

---

## Data placement (locked workshop decisions)

| Data | Primary home | Signal / sync |
|------|----------------|---------------|
| Live telemetry, personnel movement, temporary messages | — | **Reticulum only** |
| Boundaries, infrastructure, static map features, tile packs | **Local** on each terminal | Change-only; Reticulum heads-up + Resource pull |
| Diary, records, plans (recent) | Local cache + **Freenet Hot contract** | Freenet sync |
| Older diary/records/plans | Local cache (user retention) + **Freenet Archive contracts** | Manifest → on-demand pull |
| Full restore | Mist + any member’s local copy + offline backup | Slow path — acceptable |

### Freenet shape: hot + archive + manifest

Freenet replicates each **contract** across peers; it does **not** automatically split one logical archive into many contracts or apply erasure coding. Application-level design:

- **Manifest** — small index: hot key, archive keys, periods, content hashes.
- **Hot** — last 30–90 days of records; append-friendly deltas.
- **Archive** — sealed time slices (season/year); mostly immutable; keep each well under tens of MB (hard cap ~50 MiB per contract).
- Optional: 2–3 location-diverse copies of critical archives; compression (e.g. zstd) before state bytes.
- Phones: lightweight / on-demand Freenet peer; prefer one always-on **shed pin** per farm.

**Longevity:** treat Freenet as multi-device sync + short-to-medium redundancy. Multi-year survival = local caches + automated offline backups + at least one subscribed pin. Re-seed from any member who still has data.

### Map heads-up (Reticulum)

On map change: bump `map_version`, announce short `map_update` to farm destination; terminals compare hashes and pull assets over Reticulum Resource (hash-verify before replace). Large tiles never enter the global mist day-to-day.

---

## Experimental fork rules

1. **Do not** replace Firebase Auth / `access_pins` / Cloud Run in `master` until mist path is proven.
2. Mist prototypes live under an explicit flag or package path (e.g. `src/mist/` / `Plans` spikes / branch `exp/mist-*`).
3. Production invite PIN flow ([`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md)) stays source of truth for shipping builds.
4. DPIRD / optional online APIs remain temporary enhancements during migration; local data model must not require them.

Prototype order:

1. Invitation → key derivation → contract / destination material (**this doc § Invitation**).
2. Local event log / CRDT-friendly store.
3. Reticulum map heads-up + small geometry sync.
4. Freenet Hot contract.
5. Archive sealing + Manifest.

---

## Invitation → key derivation → contract keys

Goal: map **paper farm code** + **invite token** + **member name** onto cryptographic material for (a) decrypting farm mist contracts, (b) joining Reticulum farm destinations, (c) proving invite without a central account DB — while remaining compatible with a future bridge from today’s PIN system.

### Roles of secrets

| Secret | Held by | Purpose |
|--------|---------|---------|
| **Farm root code** (`FarmCode`) | Admin only; paper wallet | High-entropy secret that seeds all farm-scoped keys. Shown once at farm creation. Losing it without a backup = loss of mist recovery keys (local data may still exist). |
| **Invite token** | New member (shared out-of-band) | Short capability to join once (or N uses / expiry). Does **not** equal FarmCode. |
| **Member display name** | User | Human label; with invite, binds a stable member/device identity (same spirit as today’s PIN+name → UID). |
| **Device keypair** | Each terminal | Long-lived device identity for signing records and Reticulum destinations. |

### Recommended derivation (v1 sketch)

Use a standard KDF (HKDF-SHA-256). All labels are ASCII domain-separation strings. Exact byte layouts can freeze when the experimental package lands.

```
FarmSeed     = HKDF(ikm = FarmCode_bytes, salt = "pufam-mist-v1", info = "farm-seed")
FarmId       = first 16 bytes of HKDF(FarmSeed, info = "farm-id")   // public farm handle
ManifestKey  = HKDF(FarmSeed, info = "freenet-manifest")
HotKey       = HKDF(FarmSeed, info = "freenet-hot")
ArchiveSalt  = HKDF(FarmSeed, info = "freenet-archive-salt")
# archive contract key for period P:
ArchiveKey(P) = HKDF(ArchiveSalt, info = "archive:" || P)

ReticulumFarmDest = HKDF(FarmSeed, info = "reticulum-farm-dest")  // group destination material
MapAnnounceDest   = HKDF(FarmSeed, info = "reticulum-map-announce")

InviteMaster = HKDF(FarmSeed, info = "invite-master")
```

**Invite token mint (admin device, offline-capable):**

```
InviteId     = random 128-bit
InviteToken  = encode(InviteId || MAC)   // human-typable: Crockford base32 / grouped digits
InviteRecord = {
  invite_id, role, modules?, expires?, max_uses?,
  wrapped_join_secret = AEAD(InviteMaster, InviteId, JoinSecret)
}
JoinSecret   = random 256-bit   // enough to receive FarmSeed unwrap OR a join capability
```

Store `InviteRecord` only on admin device / mist invite index contract (experimental) — **not** in production Firestore for the fork spike unless bridged deliberately.

**Join (new device):**

1. User enters farm discovery handle (optional nearby / QR) + **name** + **InviteToken**.
2. Device verifies MAC, unwraps `JoinSecret`, runs join protocol to obtain `FarmSeed` (or a wrapped `FarmSeed` decryptable with `JoinSecret`).
3. Device generates **DeviceKeypair**; registers member record `{ member_id, name, device_pub, role }` into local DB + (later) Hot/membership contract.
4. Derive Manifest/Hot/Archive/Reticulum keys from `FarmSeed` as above.
5. Mark invite used / decrement uses.

**Paper wallet contents (admin):**

- Farm display name  
- `FarmCode` (full secret)  
- Optional: first recovery invite  
- Created date / schema version `mist-v1`

**Recovery:** any device that still holds `FarmSeed` (or an offline backup of encrypted state + `FarmCode`) can re-derive keys and re-publish Manifest/Hot/Archives. Without `FarmCode` and without a seeded peer, mist ciphertext is unreadable by design.

### Bridge note (production Firebase)

Today: PIN → SHA-256 → `access_pins` → custom token ([`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md)).  
Mist fork: do **not** replace that path in shipping builds. Optional later bridge: “export FarmCode from admin after PIN login” or dual-write invite material — only after experimental crypto is stable.

### Record IDs (for Hot merge)

```
record_id = ulid_or_timeordered || "-" || short_device_id || "-" || counter
```

Prefer globally unique IDs so Hot merge is append-by-id + tombstone union (see Freenet Hot sketch below).

---

## Contract state sketches (reference)

### Manifest

```json
{
  "farm_id": "…",
  "version": 1,
  "hot_contract_key": "…",
  "archives": [
    {
      "key": "…",
      "period": "2025",
      "from": "2025-01-01T00:00:00Z",
      "to": "2025-12-31T23:59:59Z",
      "record_count": 1842,
      "content_hash": "sha256:…",
      "created": "2026-01-02T04:12:00Z"
    }
  ],
  "schema_version": 1
}
```

### Hot

```json
{
  "farm_id": "…",
  "window_start": "2026-05-01T00:00:00Z",
  "records": [
    {
      "id": "…",
      "type": "spray|harvest|observation|plan|diary|…",
      "ts": "…",
      "author": "member-or-device-id",
      "payload": {},
      "sig": "optional"
    }
  ],
  "tombstones": [],
  "last_sealed": null
}
```

Merge: append-only by `id`; union tombstones; summary = ids + window_start + count.

### Archive (sealed)

```json
{
  "farm_id": "…",
  "period": "2025",
  "from": "…",
  "to": "…",
  "records": [],
  "content_hash": "sha256:…",
  "sealed_at": "…",
  "sealed_by": "admin-device-id"
}
```

Or compressed opaque blob + hash check.

### Map update heads-up (Reticulum)

```json
{
  "type": "map_update",
  "farm_id": "…",
  "map_version": 17,
  "updated": "…",
  "changed_assets": ["boundaries-v3", "infrastructure-2026"],
  "priority": "normal",
  "sender": "device-id"
}
```

---

## Open items (next pressure tests)

- [ ] Freeze HKDF info strings + FarmCode encoding (entropy, printable alphabet).
- [ ] Invite index storage location in pure-offline first join (QR / Reticulum announce vs mist).
- [ ] Exact Reticulum destination naming from `ReticulumFarmDest`.
- [ ] Seal/cron rules for Hot → Archive.
- [ ] Mobile peer policy (default contribute-storage = off).

---

## Related docs

- [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) — production PIN auth (do not break).  
- [`OFFLINE_MAP_APK.md`](OFFLINE_MAP_APK.md) — local basemap packs / device transfer.  
- [`CREW_PRESENCE.md`](CREW_PRESENCE.md) — live presence (maps to Reticulum telemetry later).  
- [`ROADMAP.md`](ROADMAP.md) — product roadmap (mist remains experimental until promoted).
