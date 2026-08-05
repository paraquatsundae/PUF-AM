# PUF-AM local data storage — full inventory

**Status:** Reference. Describes what is on disk as of ~2026-08-05 across all four shells (browser, Capacitor APK, Electron desktop, LAN hub).
**Date:** 2026-08-05
**Product:** PUF-AM (Ag Manager)

Every place PUF-AM keeps data on a device, what is in it, and — the question that actually matters during a recovery — **whether it is authoritative or a cache**.

**Naming policy lives in [`NAMING.md`](NAMING.md)** §4–5 and wins on identifiers. This file is the operational view: contents, lifetime, blast radius, and how each store is cleared. Freenet-specific state is described in more depth in [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) §6.

---

## 0. The short version

| Layer | Authoritative for | Notes |
|-------|-------------------|-------|
| **IndexedDB `pufom_farm_local`** | Diary, issues, archived issues on a **local-first or mist** farm | Also the outbox for a Firebase farm |
| **IndexedDB `sentinut_farm_geometry`** | Map geometry on a local-first or mist farm | Cloud mirror in Firestore for Firebase farms |
| **Firestore** | Everything on a **Firebase** farm | The shipping path |
| **Freenet** | Nothing, ever | Durability + transfer only ([`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) §7) |
| **Paper FarmCode** | Mist recovery root | Never on any device by design |
| Everything else below | — | Cache, session, queue, or preference |

Two rules follow from that table and are worth stating before the detail:

1. **Clearing browser data on a mist device is destructive.** IndexedDB *is* the farm. On a Firebase farm the same act costs only unsynced outbox rows.
2. **A Firebase farm and a mist farm never share a store's meaning.** Same IndexedDB names, different authority.

---

## 1. IndexedDB

Browser, Capacitor WebView, and Electron renderer all use the same set — Electron's live under its own `userData` (§5), the APK's under the app sandbox (§4).

| DB | Object stores | Contents | Authority | Written by |
|----|---------------|----------|-----------|------------|
| `pufom_farm_local` | `entities`, `outbox` | Diary events, field issues, archived issues, keyed `{farmId}:{kind}:{id}`; `outbox` is the universal pending-write queue | **Authoritative** on mist / local-first; cache + queue on Firebase | [`localFarmRepo.ts`](../src/lib/localFarmRepo.ts), [`flushFarmOutbox.ts`](../src/lib/flushFarmOutbox.ts) |
| `sentinut_farm_geometry` | `geometry`, `pending` | Blocks, pins, tracks, saved viewport — one row per farm; `pending` is the geometry outbox | **Authoritative** on mist / local-first; mirrored to Firestore on Firebase | [`farmGeometryIdb.ts`](../src/lib/farmGeometryIdb.ts), [`farmGeometrySync.ts`](../src/lib/farmGeometrySync.ts) |
| `sentinut_basemap` | `basemap_packs`, `basemap_tiles` | Offline Esri tile packs: one pack row per farm, tiles keyed by `z/x/y` | **Cache** — re-downloadable, but expensive on shed Wi-Fi | [`basemapPack.ts`](../src/lib/basemapPack.ts) |
| `pufom_weather_cache` | `stations` | DPIRD station observations mirrored for offline blight/chill | **Cache** — derived, re-fetchable | [`weatherCacheIdb.ts`](../src/lib/weatherCacheIdb.ts) |
| `pufom_photo_outbox` | `photos` | Issue photo blobs queued for Firebase Storage | **Queue** — the only copy until upload succeeds | [`photoOutbox.ts`](../src/lib/photoOutbox.ts) |
| `pufam-mist-v1` | `entries`, `state` | `IndexedDbMistStore`: sealed mist entries keyed `mist/v1/farm/{farmId}/…`, plus persisted `contribute` flag | **Cache** of sealed payloads | [`units/mist-freenet/src/indexeddb-mist-store.ts`](../units/mist-freenet/src/indexeddb-mist-store.ts) |
| Firebase-managed | SDK internal | Auth token persistence, Firestore offline cache | SDK-owned — do not touch | `firebase` SDK |

**Do not rename any of these without a migration** — operators lose offline data. New mist-only stores use the `pufam-` prefix ([`NAMING.md`](NAMING.md) §4).

---

## 2. localStorage

### `pufom.*` / `pufom_*` — session, sync, preferences

| Key | Contents | Authority | File |
|-----|----------|-----------|------|
| `pufom.auth.lastDisplayName` | Last operator name, for *welcome back* | Preference | [`deviceSession.ts`](../src/lib/deviceSession.ts) |
| `pufom.auth.deviceRemembered` | Whether this device shows the fast path | Preference | `deviceSession.ts` |
| `pufom.auth.lastFarmId` / `.lastFarmName` | Last farm signed into | Preference | `deviceSession.ts` |
| `pufom.unlock.sessionUnlocked` | Device unlock satisfied this session | Session | [`unlockPin.ts`](../src/lib/unlockPin.ts) |
| `pufom.unlock.hash.{farmId}` / `pufom.unlock.salt.{farmId}` | Local device-PIN verifier — **not** farm key material, not the FarmCode | **Authoritative** for the local lock | `unlockPin.ts` |
| `pufom.unlock.setupDismissed.{farmId}` | Operator declined to set a PIN | Preference | `unlockPin.ts` |
| `pufom.farmSettings.{farmId}` | Per-farm local UI settings | Cache of Firestore settings where applicable | [`farmSettingsLocal.ts`](../src/lib/farmSettingsLocal.ts) |
| `pufom_last_sync_hub` | Last LAN hub base URL — read on cold start before any scan | Preference | [`mdnsPeers.ts`](../src/lib/mdnsPeers.ts), [`apiBase.ts`](../src/lib/apiBase.ts) |
| `pufom_bread_trail_prefs` | Bread-trail display prefs | Preference | [`breadTrails.ts`](../src/lib/breadTrails.ts) |
| `pufom_share_crew_location` | Crew GPS sharing opt-in | Preference | [`crewPresence.ts`](../src/lib/crewPresence.ts) |
| `pufom_presence_device_id` | Stable per-device presence id | **Authoritative** — regenerating creates a phantom crew member | `crewPresence.ts` |

### `sentinut_*` — pre-PUFOM local stores

| Key | Contents | Authority |
|-----|----------|-----------|
| `sentinut_basemap_skip_{farmId}` | Operator dismissed the basemap download prompt | Preference |
| `sentinut_field_issues_{farmId}` | Legacy issue list — **superseded** by `pufom_farm_local` | Legacy; read for migration |
| `sentinut_field_issues_archive_{farmId}` | Legacy archived issues | Legacy |
| `sentinut_diary_events_{farmId}` | Legacy diary | Legacy |
| `sentinut_local_map_{farmId}` | Legacy map store | Legacy |

Legacy keys are still read so an operator upgrading from an old APK does not lose records. Folding them into `pufom_farm_local` is Phase B ([`RENAME_TO_PUFAM.md`](RENAME_TO_PUFAM.md)).

### `pufam.*` — mist and new UI

| Key | Contents | Authority |
|-----|----------|-----------|
| `pufam.farmStoreBackend` | `firebase` \| `mist` — which backend this device uses | **Authoritative** for routing; flipping it changes which farm the app shows |
| `pufam.mist.session.v1` | Mist device session (unlocked state, farm binding) | **Authoritative** for the session |
| `pufam.mist.sessionMeta.v1` | Session metadata, including join-deferred state | Session |
| `pufam.mist.deviceKey` | Device key material for the mist session | **Authoritative** — losing it means re-entering the FarmCode |
| `pufam.mist.hotPublish.v1.{farmId}` | Last Hot publish: content hash, record counts, **FN02 Hot URI**, bones URI + hash, minted join ticket, role, expiry | **Authoritative** for "where this farm is on Freenet" — see below |
| `pufam.mist.bonesPublish.v1.{farmId}` | Same for the geometry bones publish | As above |

**`pufam.mist.hotPublish.v1.*` is more load-bearing than it looks.** It holds the FN02 URIs this device published. Freenet has them, but nothing on the network will tell you the address — losing this row means a joiner needs a join ticket from the owner's hub, and the owner needs to publish again. It is not a cache.

### sessionStorage

| Key | Contents | File |
|-----|----------|------|
| `pufom_sync_peer_base` | LAN peer chosen for this tab only | [`mdnsPeers.ts`](../src/lib/mdnsPeers.ts) |

---

## 3. Firestore — production cloud paths

Authoritative for a **Firebase farm**. Reproduced from [`NAMING.md`](NAMING.md) §8; that file wins on naming.

| Path | Contents |
|------|----------|
| `farms/{farmId}` | Farm doc — `enabledModules`, `farmProfile` |
| `farms/{farmId}/events/{id}` | Diary events (local kind `diary`) |
| `farms/{farmId}/issues/{id}` | Active field issues |
| `farms/{farmId}/archived_issues/{id}` | Archived issues |
| `farms/{farmId}/blocks\|pins\|tracks\|viewport/…` | Map geometry cloud mirror |
| `farms/{farmId}/settings/{doc}` | e.g. `safety`, `model_params` |
| `farms/{farmId}/harvests/{id}`, `tasks/{id}` | Harvest records, tasks |
| `farms/{farmId}/presence/{uid}` | Crew GPS |
| `farms/{farmId}/mapHighlights/{id}` | Map overlay highlights |
| `farms/{farmId}/environmental_cache/{key}` | Per-farm environment cache |
| `farms/{farmId}/nutrition_data/{id}` | Nutrition uploads |
| `farms_public/{farmId}` | Nearby discovery — name + coarse location |
| `users/{uid}` / `users_public/{uid}` | Membership, role, modules, `authEpoch` / display-safe profile |
| `access_pins/{hash}` | Invite PIN hashes — **admin SDK only** |
| `chill_cache/{station-season}`, `weather_cache/…` | Shared aggregates, DPIRD cache |

Firebase Storage holds issue photos, uploaded from `pufom_photo_outbox`.

**Local kind → Firestore collection mapping** lives in [`flushFarmOutbox.ts`](../src/lib/flushFarmOutbox.ts) (`diary` → `events`).

---

## 4. Capacitor / Android

The APK stores nothing outside the standard WebView sandbox — there is no Capacitor Filesystem or Preferences plugin in the dependency list, and no Freenet state of any kind ([`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md)).

| Path (under `/data/data/com.sentinut.farm/`) | Contents | Authority |
|----------------------------------------------|----------|-----------|
| `app_webview/Default/IndexedDB/` | Every DB in §1, namespaced by the WebView origin | Follows §1 |
| `app_webview/Default/Local Storage/` | Every key in §2 | Follows §2 |
| `cache/`, `app_webview/Default/Cache/` | HTTP + tile cache | Disposable |
| *(read-only, in the APK)* `assets/public/` | The Vite bundle copied by `cap sync` | Build output |
| *(read-only, in the APK)* `assets/capacitor.config.json` | Generated at `cap sync` — includes `server.url` when built live | Build output |

Two operational consequences:

- **The WebView origin decides which sandbox the data lands in.** A packaged APK is `https://localhost`; a live-reload APK is `http://<lan-ip>:3000`. Switching between the two makes the farm appear to vanish — the data is intact under the other origin. This is the single most common "the tablet lost my farm" report, and it is why `apk:debug` builds packaged by default.
- **Android "Clear storage" wipes an entire mist farm** with no undo and no cloud copy. On a Firebase farm it costs the outbox.

Assets and outputs on the build box:

| Path | Contents |
|------|----------|
| `android/app/src/main/assets/public/` | Web bundle, overwritten by `cap sync` |
| `android/app/build/outputs/apk/debug/app-debug.apk` | The sideload artifact |
| `android/local.properties` | `sdk.dir` — machine-local, not committed |

---

## 5. Electron desktop (`userData`)

`~/.config/PUF-AM/` on Fedora, `%APPDATA%\PUF-AM\` on Windows. The directory name comes from `productName` — renaming it strands operator data ([`NAMING.md`](NAMING.md) §2).

| Path | Contents | Authority |
|------|----------|-----------|
| `desktop-prefs.json` | `{ mistEnabled }` — the launch opt-in, read by `main.ts` before any window exists, which is why it cannot live in `localStorage` | **Authoritative** for launch behaviour |
| `Local Storage/`, `IndexedDB/` (Chromium) | §1 and §2, for the renderer | Follows §1–2 |
| `freenet/config/` | App-owned node configuration | Node-owned |
| `freenet/data/` | Contract store and **peer identity** — deliberately not `~/.local/share/freenet`, which is why run 1 is a fresh Opennet peer | **Authoritative** for peer identity; deleting costs another 5–15 min bootstrap |
| `freenet/logs/` | Node logs | Disposable |
| `mist-freenet/` | `MIST_FREENET_ROOT` — see §6 | Mixed |

Shipped read-only beside the app:

| Path | Contents |
|------|----------|
| `resources/freenet/{freenet,fdev,LICENSE.md}` | Pinned 0.2.119 binaries |
| `resources/contracts/pack-contract.wasm` | Pinned pack contract — outside the asar because `fdev --code` needs a real path |
| `resources/app.asar` | Renderer bundle + main + inlined `server/`, `units/` |

`nsis.deleteAppDataOnUninstall: false` — an uninstall must not take the Freenet identity and mist cache with it.

---

## 6. Node-side mist root (`MIST_FREENET_ROOT`)

Set to `<userData>/mist-freenet` by the desktop at boot; the dev server falls back to `<cwd>/tmp/mist-freenet`.

| Path | Contents | Authority |
|------|----------|-----------|
| `_mist/freenet-index.json` | mist key → FN02 URI + content hash, **per device** | **Authoritative** for local addressing. Empty on a device that recovered from FarmCode — which is exactly why the pull path is `pullByUri` |
| `_mist/freenet-outbox.json` | Inserts queued while the node was down | **Queue** — the publish has not happened yet |
| `blobs/` | `DiskMistStore` sealed payload cache | Cache |
| `index.json` | Disk store entry index | Rebuildable |
| `state.json` | Persisted `contribute` flag and `maxBytes` budget | Preference |

---

## 7. LAN hub and temporary shelves

Relative to the hub process's `process.cwd()` — the repo root under `npm run dev`. Gitignored.

| Path | Contents | Authority | Lifetime |
|------|----------|-----------|----------|
| `tmp/lan-sync/join-manifests.json` | Short join ticket → join manifest v2 `{ v, farmId, hotUri, bonesUri, role, permissions?, expires?, ticket }` | **Authoritative** — the only place a `PUF-XXXX-XXXX` ticket resolves. Immutable Freenet URIs mean there is nowhere else to put it | Until expiry or the hub's tree is cleaned |
| `tmp/lan-sync/*` | Other LAN sync shelf files | Transfer buffer | Session |
| `tmp/mist-freenet/` | §6, when `MIST_FREENET_ROOT` is unset | Mixed | Until cleaned |

**These are on the owner's machine, not on Freenet.** Losing `join-manifests.json` invalidates outstanding short tickets; the farm is unaffected, but the owner must publish and mint again.

---

## 8. Build-time and machine-local files (not operator data)

| Path | Contents | Committed? |
|------|----------|------------|
| `dist/` | Vite output | No |
| `release/` | electron-builder artifacts | No |
| `vendor/freenet/<os>-<arch>/` | Fetched Freenet binaries, ~93 MB | No — `vendor/README.md` only |
| `secrets/`, `firebase-applet-config.json` | Firebase Admin credentials — **server only**, never in a desktop or Android build | No |
| `.env` | Local build/runtime flags | No — [`.env.example`](../.env.example) is |
| `android/local.properties` | `sdk.dir` | No |

---

## 9. Clearing data — what each action actually costs

| Action | Firebase farm | Mist farm |
|--------|---------------|-----------|
| Browser "clear site data" | Unsynced outbox rows, tile packs, weather cache | **The farm.** Recoverable only from the paper FarmCode + a Freenet publish, or another device |
| Android → Clear storage | As above | As above, plus the mist device session |
| Sign out | Session keys; local stores remain | Mist session locks; `pufam-mist-v1` remains |
| Uninstall desktop app | `userData` is left in place (`deleteAppDataOnUninstall: false`) | Same — the Freenet identity and mist cache survive |
| Delete `<userData>/freenet/data` | Nothing | Peer identity; another 5–15 min Opennet bootstrap. Published data is unaffected |
| Delete `_mist/freenet-index.json` | Nothing | Local URI addressing — need a join ticket or a republish |
| Delete `tmp/lan-sync/join-manifests.json` | LAN sync shelf | Outstanding short join tickets stop resolving |

---

## 10. Related

- [`NAMING.md`](NAMING.md) §4–5, §8 — authoritative names for every store and key
- [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) — what is published, what is sealed, what is not on Freenet
- [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) — why the Android column has no Freenet rows
- [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) — mist key design, FarmCode, Hot/Archive
- [`OFFLINE_MAP_APK.md`](OFFLINE_MAP_APK.md) — basemap packs and device transfer
- [`FARM_EXPORT_JSON_XLSX.md`](FARM_EXPORT_JSON_XLSX.md) — the human-readable export that reads all of the above
