# Freenet issue photos (packet size)

**Status:** Active plan — **planned 2026-09-15, not shipped**  
**Date:** 2026-09-15  
**Product:** PUF-AM  
**Scope:** How to share issue and diary photos over Freenet 0.2 when the product JPEG cap is **600 KB** and the pack PUT ceiling is **64 KiB**. Approach only — **implementation not started.**  
**Experimental — not production.** Firebase Auth + invite PIN remains the shipping path. Freenet / mist stays behind the workshop bake.

Index: [`README.md`](README.md). Day-run tick: [`DAY_RUN_2026_09_15.md`](DAY_RUN_2026_09_15.md) §4. Operator dated line: [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §9.4. Naming: [`NAMING.md`](NAMING.md) §8. Photo decisions already on disk: [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Decision — 2026-09-14; [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) §9 (do not renumber). Crypto / CHK rules: [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Freenet peer implementation (KiB-class CHK) and § Pre-Freenet workshop decisions **#2** (no splitfiles for KiB-class). **Do not renumber those `§` headings.**

---

## What is already true (do not invent a new photo policy)

Hosted Storage path already landed (`cd26d09`). Freenet helpers exist (`src/mist/mistPhotoFreenet.ts`, `src/mist/photoPayload.ts`, `src/lib/photoCompress.ts`) but Opennet photo transfer is **not** field-validated. A Freenet-native attach already calls `publishIssuePhotoToFreenet` with the **whole** compressed JPEG — that path cannot succeed on today's pack PUT.

| Constraint | Value | Home |
|------------|--------|------|
| Max photos | **5** per issue and per diary event (`MAX_PHOTOS_PER_RECORD`) | `src/lib/farmPhoto.ts` |
| Who / where / when | On the record (`createdAt`, `createdBy`, optional `blockId`; `directedAt*` only when the diary/highlight already has an assignee) | [`NAMING.md`](NAMING.md) §8 |
| Stable file id | `{issueId}_{photoId}.jpg` / `{eventId}_{photoId}.jpg` (export); hosted first/legacy stays `photo.jpg` | [`NAMING.md`](NAMING.md) §8 |
| Compressor | Longest edge **1600 px**, JPEG **0.72 → 0.40**, hard cap **600 KB** (`PHOTO_HARD_CAP_BYTES`) | `src/lib/photoCompress.ts` |
| Seal | **HotKey** only — never FarmSeed, never BonesKey | `photoPayload.ts` `assertNoFarmSeedInPhotoValue` |
| Mist keys | `mist/v1/farm/{id}/hot/photo/{issueId}/{photoId}` (legacy first: `…/hot/photo/{issueId}`); events `…/hot/photo/event/{eventId}/{photoId}`; index `…/hot/photos` | `issuePhotoStorageKey` / `eventPhotoStorageKey` / `photoIndexStorageKey` |
| Watch | 20 s ping grows `photoIndexUri` / `photoIndexHash`; GET **only** new hashes. Do **not** republish Hot on every photo | [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) §9.2; `units/mist-freenet/src/hot-watch.ts` |
| Hosted writes | No original+compressed pair; no `photoData` on new writes | [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) Decision — 2026-09-14 |
| Splitfile | **Deferred.** [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Pre-Freenet workshop decisions **#2**: no Freenet splitfiles for KiB-class Hot/bones/manifest. Photos are **not** KiB-class; that does not license a splitfile project | Frozen |

---

## Confirmed pack size limit (from code, 2026-09-15)

The hurdle is **our pack PUT**, not the desktop IPC runaway guard.

| Cap | Value | Where | Role |
|-----|--------|--------|------|
| **`FREENET02_MAX_BLOB_BYTES`** | **`64 * 1024` (64 KiB)** | `units/mist-freenet/src/freenet02-pack-id.ts` | Workshop pack PUT. `assertBlobSize()` throws *“splitfiles not supported”*. `packParametersFromBlob()` calls it, so **every native pack PUT** (`units/mist-freenet/src/freenet02-native-put.ts` → `packInstanceIdBase58`) refuses a larger blob. |
| `FREENET_IPC_MAX_BLOB_BYTES` | **8 MiB** | `desktop/freenetIpcInput.ts` | Runaway guard for `puf-freenet:put`. **Not** a Freenet budget. A 600 KB JPEG can cross IPC and still die at `assertBlobSize`. |
| `FREENET_IPC_MAX_SLOT_STATE_BYTES` | **64 KiB** | `desktop/freenetIpcInput.ts` | Join/watch **slot** state only. Photos are pack blobs, not slot state. |
| `assertCiphertextForFreenet` | AEAD envelope shape, **no size cap** | `units/mist-freenet/src/ciphertext-guard.ts` | Each PUT (whole photo or part) must be a mist-v1 AES-GCM JSON envelope (`v` / `alg` / `iv` / `ct`). Plain JPEG is refused. |

**Envelope tax (must size parts against this, not against 64 KiB of JPEG):** `encryptHotBlobWithKey` (`units/mist-freenet/src/hot-crypto.ts`) stores `ct` as **hex**. Sealed size is about `2 × (plaintext + 16-byte GCM tag) + ~80` bytes of JSON. A part that should PUT at ≤ 64 KiB therefore has a **plaintext budget of ~32 KiB**, not 64 KiB. A 600 KB JPEG + `PUFPH1` header is ~19 parts after seal. A JPEG that is “only” 64 KiB still **cannot** go as one pack PUT once sealed.

---

## Why one 600 KB PUT is impossible today

`publishSealedPhoto` (`src/mist/mistPhotoFreenet.ts`) packs `PUFPH1` + JPEG, seals the whole thing with HotKey, then `publishBlob` → native pack PUT. That sealed envelope is hundreds of KiB. `assertBlobSize` fires before the node sees it. Raising **our** assert without a live 0.2.135 measurement just moves the failure into the node (and still is not a Freenet splitfile).

---

## Options (choose one; do not mix)

### A — Crush the product cap until one sealed PUT fits (~32 KiB JPEG)

Keep one blob per photo. Drop edge and/or quality until the **sealed** envelope is ≤ 64 KiB.

- **Reject.** Invents a Freenet-only photo policy. Hosted stays 600 KB / 1600 px. Day-run already called this **likely unusable**. Paddock detail (lesion, tag, spray card) is the point of the photo.

### B — Prove 0.2.135 will take a larger single pack blob; raise `FREENET02_MAX_BLOB_BYTES`

IPC already allows 8 MiB. If a peered node accepts one ~1.2 MiB hex envelope, we could PUT one photo per CHK.

- **Not the plan.** Needs a live spike (`npm run mist:smoke:native` plus a measured photo PUT). Serialized PUTs already wait up to **120 s** once On Opennet (`NATIVE_PUT_DEFAULT_TIMEOUT_MS`). One 600 KB photo is still a long insert; five photos is five of those. Do not raise the workshop assert on hope. Do not call a bigger single CHK a “splitfile.”

### C — App-level chunked PUTs (sequential `p/0`, `p/1`, …) without Freenet splitfiles

Split the packed plaintext, HotKey-seal each slice so the envelope is ≤ 64 KiB, PUT each slice, list slices on the photo index.

- **Almost the recommendation.** Works. Weaker than D: a failed middle PUT is harder to resume; two devices cannot skip a part they already have unless each slice also carries a content hash (at which point this **is** D).

### D — Content-addressed parts + existing photo index (**recommend**)

Same size math as C. Each part is its own pack PUT (HotKey AEAD, ≤ 64 KiB sealed). The **photo index** (already one small HotKey blob, already on the 20 s watch as `photoIndexHash`) lists parts by **content hash + FN02 URI**. The reader GETs **only missing hashes**, concatenates, `parseIssuePhotoBlob`, writes `pufam_issue_photos`.

- Product compressor and 600 KB cap **unchanged**.
- Pack assert and “no Freenet splitfiles” **unchanged** ([`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) § Pre-Freenet workshop decisions **#2** — this is several KiB-class CHKs, not a splitfile).
- Watch contract **unchanged**: ping still carries only `photoIndexUri` / `photoIndexHash`. Do not put part URIs on the watch slot (slot state is itself 64 KiB).
- Single-part photos that seal ≤ 64 KiB keep today’s key (`…/hot/photo/{issueId}/{photoId}`). Multi-part is additive: `…/hot/photo/{issueId}/{photoId}/p/{i}` and the same for events (`…/hot/photo/event/{eventId}/{photoId}/p/{i}`). Index entry grows optional `parts: [{ i, uri, contentHash, bytes }]`.
- Local cache still holds the **reassembled** JPEG. Export file id stays `{issueId}_{photoId}.jpg`. Who/where/when stay on the record.

### E — Refuse oversize / index + miss-warn only

Leave bytes on-device (and hosted Storage for cloud farms). Freenet index may say “photo exists”; export already **warns** when `pufam_issue_photos` has no bytes.

- Honest residual, not a share path. Keep as the **failure** behaviour when a part PUT fails or Opennet is down — not as the design.

---

## Recommendation

**D — content-addressed parts + the existing photo index.** Keep A/B/C/E off the table unless a later spike proves B on 0.2.135 (then we can *also* PUT tiny photos as one blob; we still do not crush quality and we still do not implement Freenet splitfiles).

When someone implements (not this pass):

1. Measure `compressFarmPhoto` → `packIssuePhotoBlob` → `encryptHotBlobWithKey` byte length. Size parts so **sealed** `byteLength ≤ FREENET02_MAX_BLOB_BYTES`. Put the budget next to `PHOTO_HARD_CAP_BYTES` (a part-plain cap, not a new product JPEG cap).
2. Extend `IssuePhotoIndexEntry` with optional `parts[]`. Keep `uri` / `contentHash` as the **whole-photo** hash (reassembled plaintext or sealed concat — pick one in the implement commit and test it). `assertNoFarmSeedInPhotoValue` on every part meta and on the index.
3. PUT parts first (native PUTs stay **serialized**; wait for **On Opennet**). Then PUT the index. Then bump the watch (`publishHotWatchAfterPhotoPut`). Do **not** republish Hot. Do **not** PUT Bones.
4. `applyPhotoIndexWatch`: if `parts[]` is present, GET only hashes not already in the mist store; refuse a truncated concat; then the same cache + issue/diary merge as today (`publishHot: false`). Incomplete parts → existing **miss-warn**, not a silent empty thumb.
5. Tests first: envelope-size math, `assertBlobSize` per part, no FarmSeed keys, watch still hash-only, apply does not call `refreshFarmUiAfterRecovery`.

---

## Risks

| Risk | Why | Mitigation |
|------|-----|------------|
| Many PUTs, 120 s each | 5 photos × ~19 parts, serialized, first Opennet already minutes | Wait for On Opennet before starting; show honest “sending photo N, part i”; keep `pending` on the index; do not stack a second Send |
| Envelope hex doubles bytes | Easy to size parts at 64 KiB **plaintext** and still trip `assertBlobSize` | Budget against **sealed** length; test a max-size JPEG |
| Partial arrive | Reader has 12/19 parts | Miss-warn; do not write a broken JPEG into `pufam_issue_photos`; retry missing hashes only |
| Index grows | Worst case 5 photos × 19 parts of `{i,uri,hash,bytes}` is still KiB | Keep the index as one pack PUT; if it ever nears 64 KiB sealed, that is a later problem (not today’s) |
| Hybrid / hosted | Cloud farm with a Freenet mirror | Hosted Storage stays the cloud path. Mirror must not re-enable the Firestore photo outbox. Same compressor. |
| Calling it “splitfile” | Frozen no for KiB-class; confuses a future real splitfile project | Docs and code say **parts**, never splitfile |
| Map remount | `refreshFarmUiAfterRecovery` flips `isLoaded` | Same rule as Hot apply ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) Decision — 2026-09-12 highlight diary + no remount) |

---

## What not to do

- **Do not implement in the pass that wrote this file.** Helpers stay as they are. Do not claim photos are shipped.
- **Do not put FarmSeed or a FarmCode on a photo, part, or index.** Crew unwrap Hot/Bones from the invite; photos are HotKey only ([`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) Decision — 2026-09-12).
- **Do not seal issue/diary photos with BonesKey.** Bones is geometry (`bones/{assetId}`). Photos stay under `hot/photo/…`.
- **Do not remount the map** (`refreshFarmUiAfterRecovery` / `isLoaded: false`) when a photo arrives.
- **Do not republish Hot** on every photo. Watch carries `photoIndexHash` only.
- **Do not implement Freenet splitfiles** or raise `FREENET02_MAX_BLOB_BYTES` without a measured 0.2.135 spike.
- **Do not crush** 1600 px / 0.72→0.40 / 600 KB to sneak under 64 KiB. One product.
- **Do not** store original+compressed, or put `photoData` on new hosted writes.
- **Do not** re-enable the Firestore photo outbox on Freenet-native farms.
- **Do not** enable `freenet.service`, wipe `~/.config/PUF-AM`, delete Clare Downs, or print a FarmCode.
- **Do not** renumber [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) or any `Plans/reference/*` `§`.

---

## Decision — 2026-09-15

Share issue and diary photos over Freenet as **HotKey-sealed, content-addressed parts** plus the existing photo index. Pack PUT stays **64 KiB** (`FREENET02_MAX_BLOB_BYTES`). Product JPEG cap stays **600 KB**. Freenet splitfiles stay deferred. **Not shipped.**
