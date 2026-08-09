# PUF-AM naming & documentation conventions

**Authoritative naming reference for this repo.**  
**Product:** PUF-AM (Ag Manager) · **Repo:** [paraquatsundae/PUF-AM](https://github.com/paraquatsundae/PUF-AM)

When display names, wire formats, storage keys, or doc titles disagree, **this file wins** for PUF-AM. Cross-repo cab/sprayer rules live in workspace [`AGENTS.md`](../../AGENTS.md) (PUFworks); they do not override identifiers listed here.

Related plans (not duplicated here):

| Doc | Scope |
|-----|--------|
| [`RENAME_TO_PUFAM.md`](RENAME_TO_PUFAM.md) | Phase A/B rebrand checklist (UI done; infra deferred) |
| [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) | Mist crypto, FarmCode, Hot/Archive, pre-Freenet workshop decisions (experimental) |
| [`MIST_TWO_LAPTOP_SMOKE.md`](MIST_TWO_LAPTOP_SMOKE.md) | Pre-Freenet two-laptop smoke — recovery pass done ~2026-08-03 |
| [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md) | Fedora + Windows desktop installers; Freenet as an in-app plugin (Electron frozen) |
| [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) | Android/Capacitor: why no Freenet host on tablets, hub options, APK build wiring |
| [`FREENET_CONTRIBUTE_AND_STORAGE.md`](FREENET_CONTRIBUTE_AND_STORAGE.md) | Contribute vs communicate, what is published, what is sealed, what is not on Freenet |
| [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) | Operational inventory of every local store — contents, authority, how it is cleared |
| [`FARM_EXPORT_JSON_XLSX.md`](FARM_EXPORT_JSON_XLSX.md) | Human-readable `farm-export.json` sketch |
| [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) | Architecture audit, roadmap checklist, mist phase log |

---

## 1. Product & repo names

| Name | Use when | Do **not** use for |
|------|----------|-------------------|
| **PUF-AM** | Short mark, headers, GitHub repo name, chat/docs shorthand | npm package name, Android `applicationId`, wire magic bytes |
| **PUF-Ag Manager** / **Ag Manager** | Full product title in UI (`src/brand.ts`), Capacitor `appName`, legal/About | Replacing `PUFOM` in sync filenames |
| **PUFAM** | Marketing copy, site module cards, `package.json` description | Hyphenated repo slug (prefer **PUF-AM** in GitHub) |
| **PUFOM** | Legacy wire/sync brand: `.pufom`, `PUFOM1`, `_pufom-sync._tcp`, `pufom_*` keys | New user-facing hero copy (use PUF-AM) |
| **Sentinut** | Historical company/Android namespace only (`com.sentinut.farm`, `@sentinut.local` Auth emails) | Product name in new docs or UI |
| **Walnut_farm_manager** | Local clone folder name only — **no rename required** | Implies walnut-only product (mixed-enterprise app) |
| **Walnut-Farm-Manager** | Archived GitHub repo — reference/history only | Active remote or deploy target |
| **PUF-AM Desktop** | The Electron shell + installers (Fedora `rpm`/AppImage, Windows NSIS/portable). Docs shorthand for the packaged app | A separate product — it *is* PUF-AM; do not brand installers differently |
| **PUF Freenet Host** | The in-app Freenet lifecycle plugin — unit `units/puf-freenet-host/`, package `@pufworks/puf-freenet-host`, `hostId` `puf-freenet-host` | The mist storage unit (`mist-freenet`); a user-visible app or service name |
| **PUF-FN** | Future product name for the **Freenet client unit** when `units/puf-freenet-host/` forks into its own repo (in-app plugin today → standalone repo later) | Current mist storage unit (`mist-freenet`) or the host unit's present package name; not a shipping product yet |

**Brand source of truth (UI strings):** `src/brand.ts` — `APP_SHORT_NAME` = `PUF-AM`, `APP_NAME` = `PUF-Ag Manager`.

**Former names (context only):** PUFOM = Orchard Manager; Sentinut = early Android publisher id.

---

## 2. Package, build & deploy identifiers

| Identifier | Current value | Rename policy |
|------------|---------------|---------------|
| npm `name` | `walnut-farm-manager` | Optional Phase B — breaks scripts if rushed |
| GitHub repo | `PUF-AM` | Display name done; folder may stay `Walnut_farm_manager` |
| Capacitor / Android `appId` | `com.sentinut.farm` | **Frozen** — Play / sideload continuity |
| Capacitor `appName` | `PUF-Ag Manager` | User-facing; update with brand |
| Desktop (Electron) `appId` | `farm.pufworks.am` | Desktop only — **do not** reuse the Android `com.sentinut.farm` |
| Desktop `productName` | `PUF-AM` | Set in `package.json`. Drives `~/.config/PUF-AM` and `%APPDATA%\PUF-AM`; renaming strands operator data (Freenet identity + mist cache) |
| Desktop Linux `executableName` | `puf-am` | Binary + `.desktop` entry name |
| Desktop `desktopName` | `puf-am.desktop` | In `package.json`. Electron's Wayland/X11 `app_id`; must match the generated `.desktop` filename (`linux.syncDesktopName`) or the running window gets its own iconless shell entry |
| Desktop rpm package name | `puf-am` | `rpm.packageName` — otherwise the package inherits npm's `walnut-farm-manager` |
| electron-builder config | `electron-builder.yml` | Repo root. `productName`, `main`, `desktopName` stay in `package.json` because Electron reads them |
| electron-builder output dir | `release/` | **Not** `dist/` — that is Vite's output |
| electron-builder build resources | `desktop/resources/` (`icon.png`) | **Not** the default `build/` — gitignored here |
| Bundled Freenet binaries (build input) | `vendor/freenet/<os>-<arch>/` | `<os>` is electron-builder `${os}` (`linux`/`win`/`mac`); gitignored |
| Cloud Run service | `pufom-…a.run.app` | Phase B — DNS cutover planned |
| Public URL | `https://am.pufworks.farm` | Canonical; `APP_URL` / `VITE_APP_URL` |
| mDNS LAN sync | `_pufom-sync._tcp` (`PUFOM_MDNS_TYPE`) | Dual-advertise if renamed |
| Android Java package | `com.sentinut.farm` | Keep with `appId` |
| Site asset paths | `/assets/pufom/`, `/downloads/pufom/` | Alias `/pufam/` when APK renamed |

---

## 3. Environment variables

| Variable | Scope | Notes |
|----------|--------|-------|
| `APP_URL` | Server | Self-referential links, OAuth, deploy canonical URL |
| `VITE_APP_URL` | Client (build-time) | Published app URL after Cloud Run / custom domain |
| `VITE_API_BASE_URL` | Client (build-time) | Physical device → LAN IP of dev hub |
| `VITE_GOOGLE_MAPS_API_KEY` | Client | Restrict to `com.sentinut.farm` + HTTP referrers — see [`API_KEY_SECURITY.md`](API_KEY_SECURITY.md) |
| `VITE_CAPACITOR` | Build script | Set by `build:android` — not usually in `.env` |
| `VITE_WORKSHOP_MODE` | Client | Local UI without Firestore — **opt-in** |
| `VITE_REQUIRE_AUTH` | Client | Forces login even if workshop enabled |
| `VITE_MIST_EXPERIMENTAL` | Client (build-time) | Shows the mist storage chooser on login. **Inlined by Vite** — no runtime flag can un-gate a bundle built without it. Defaulted to `true` by `scripts/build-desktop-web.mjs` and `scripts/build-android-web.mjs` |
| `VITE_MIST_FREENET_API` | Client (build-time) | Origin for `/api/mist/freenet/*` when it is not same-origin. On Capacitor this is what makes the runtime `android-hub` instead of `android-no-host` — see [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md) §7 |
| `CAP_PACKAGED` | Build script | `1` drops `server.url` from the Capacitor config so the WebView loads its own assets. Set by `apk:debug`; without it the APK points at the emulator address `http://10.0.2.2:3000` |
| `CAP_SERVER_URL` | Build script | Live-reload origin for a workshop APK (`npx cap sync`) |
| `MIST_FREENET` | Server / desktop main | `1` enables the in-process Freenet peer (and, on desktop, starts the bundled node) |
| `PUF_FREENET_BIN` | Desktop / server | Workshop override for the `freenet` binary — outranks bundled and `PATH` |
| `PUF_FDEV_BIN` | Desktop / server | Same for `fdev` (still required for PUT on 0.2.118) |
| `PUF_CLOUD_API_BASE` | Desktop main | Override for cloud-only routes (`/api/auth/*`, `/api/weather/*`); default `https://am.pufworks.farm` |
| `DPIRD_API_KEY` | **Server only** | Never `VITE_*` — would bake into APK |

Template: [`.env.example`](../.env.example). **Rule:** secrets and provider keys that must not ship in the client bundle **never** use the `VITE_` prefix.

---

## 4. Browser storage — IndexedDB databases

Names and rename policy live here; **contents, authority, and how each store is cleared** are in [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md).

| DB name | Module | Legacy? | Notes |
|---------|--------|---------|-------|
| `pufom_farm_local` | `localFarmRepo.ts` | PUFOM wire era | Diary, issues, outbox — **keep** |
| `sentinut_farm_geometry` | `farmGeometryIdb.ts` | Sentinut | Blocks, pins, tracks, viewport — **keep** |
| `sentinut_basemap` | `basemapPack.ts` | Sentinut | Esri tile packs — **keep** |
| `pufom_weather_cache` | `weatherCacheIdb.ts` | PUFOM | Device weather mirror — **keep** |
| `pufom_photo_outbox` | `photoOutbox.ts` | PUFOM | Issue photo upload queue — **keep** |
| `pufam-mist-v1` | `units/mist-freenet` | **Preferred** mist | MistStore persistence — new mist-only |
| Firebase Auth / Firestore | SDK-managed | — | Not renamed |

**Policy:** Do **not** mass-rename existing DB names without a migration — operators lose offline data. New mist-only stores use **`pufam-*`**. Operational entity store stays **`pufom_farm_local`** until a deliberate codec migration (Phase B).

---

## 5. Browser storage — localStorage / sessionStorage keys

### `pufom_*` (sync / session — keep)

| Key | File |
|-----|------|
| `pufom.auth.lastDisplayName` | `deviceSession.ts` |
| `pufom.auth.deviceRemembered` | `deviceSession.ts` |
| `pufom.auth.lastFarmId` | `deviceSession.ts` |
| `pufom.auth.lastFarmName` | `deviceSession.ts` |
| `pufom.unlock.sessionUnlocked` | `unlockPin.ts` |
| `pufom.farmSettings.{farmId}` | `farmSettingsLocal.ts` |
| `pufom_sync_peer_base` | `mdnsPeers.ts` (sessionStorage) |
| `pufom_last_sync_hub` | `mdnsPeers.ts`, `apiBase.ts` |
| `pufom_bread_trail_prefs` | `breadTrails.ts` |
| `pufom_share_crew_location` | `crewPresence.ts` |
| `pufom_presence_device_id` | `crewPresence.ts` |

### `sentinut_*` (pre-PUFOM local — keep)

| Key pattern | File |
|-------------|------|
| `sentinut_basemap_skip_{farmId}` | `basemapPack.ts` |
| `sentinut_field_issues_{farmId}` | `localFieldIssues.ts` (legacy; superseded by IDB) |
| `sentinut_field_issues_archive_{farmId}` | `localFieldIssues.ts` |
| `sentinut_diary_events_{farmId}` | `localDiaryEvents.ts` (legacy) |
| `sentinut_local_map_{farmId}` | `localMapStore.ts` (legacy) |

### `pufam.*` (mist / new UI — preferred for new mist keys)

| Key | File |
|-----|------|
| `pufam.farmStoreBackend` | `farmStoreBackend.ts` |
| `pufam.mist.session.v1` | `mistDeviceSession.ts` |
| `pufam.mist.sessionMeta.v1` | `mistDeviceSession.ts` |
| `pufam.mist.deviceKey` | `mistDeviceSession.ts` |
| `pufam.mist.hotPublish.v1.{farmId}` | `mistHotPublishMeta.ts` — last Hot publish hash/ts, FN02 URIs, minted join ticket |
| `pufam.mist.bonesPublish.v1.{farmId}` | `mistHotPublishMeta.ts` — same for the geometry bones publish |

### CSS / DOM (non-storage)

New map overlay classes use **`pufam-*`** (`pufam-track-line`, `pufam-fill-water`, …) — safe to use in new UI; no migration.

---

## 6. Export & sync formats

Three distinct formats — **do not conflate**:

| Format | Discriminator | Extension / filename | Purpose |
|--------|---------------|----------------------|---------|
| **PUFOM bundle** | `format: "pufom"`, magic `PUFOM1\n`, gzip JSON | `.pufom` | Device-to-device / LAN sync; geometry + diary + issues (`pufomSync.ts`, `shared/sync/pufomBundle.ts`) |
| **Farm export** | `format: "farm-export"`, `v: 1` | `*_farm-export.json` | Human-readable archive → Excel — see [`FARM_EXPORT_JSON_XLSX.md`](FARM_EXPORT_JSON_XLSX.md) |
| **Mist join envelope** | (mist-v1) | `.pufam-join` (sketch) | Air-gapped crew join — see [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md) |

**Rules:**

- Teach operators **`.pufom`** for sync and **`farm-export.json`** for spreadsheets — never rename one to the other.
- Future codec may accept both `PUFOM1` and `PUFAM1` magic — not implemented; document in Phase B before changing bytes.
- `farm-export` `source` field: `"firebase"` | `"local"` | `"mist"` — aligns with assembly path, not product name.

---

## 7. Mist storage keys (experimental)

Two layers — do not confuse:

| Layer | Example | Meaning |
|-------|---------|---------|
| **MistStore path** | `mist/v1/farm/{farmId}/hot/current` | Opaque storage key in `MistStore` (`units/mist-freenet/src/keys.ts`) |
| **HKDF domain** | `salt = "pufam-mist-v1"`, `info = "farm-seed"` | Derives `FarmSeed`, Freenet contract keys — frozen in mist-v1 |

**Kinds under `mist/v1/farm/{farmId}/`:** `bones/{assetId}`, `hot/{segment}`, `archive/{period}`, `manifest`.

**FarmCode (recovery root — not day-to-day login):**

- Printable form: **`mist-fc-2  XXXXX-XXXXX-XXXXX-XX`** — 17 Crockford Base32 symbols (16 payload = 80 bits, + 1 check). Legacy **`mist-fc-1`** (27 symbols, 128-bit) is still accepted on entry but never minted. See MIST doc § FarmCode encoding.
- On entry the operator types **symbols only** — the `mist-fc-N` prefix and the dashes are filled in by the app, same as the join ticket.
- **FarmCode ≠ invite PIN** — production PINs use Firebase `access_pins`; mist uses InviteToken + JoinEnvelope.
- **FarmCode ≠ device unlock PIN** — 4–8 digit local lock only (`unlockPin.ts` / mist device PIN).

**Join ticket (short — points at a farm, does not open it):**

- Printable form: **`PUF-XXXX-XXXX`** — prefix `PUF`, then 8 Crockford Base32 symbols (`shared/sync/joinTicket.ts`).
- Resolves to a **join manifest v2** `{ v: 2, farmId, hotUri, bonesUri, role, permissions?, expires?, ticket }`.
- Roles use the mist vocabulary **`owner | admin | farmer | viewer`** — never `worker`. Default for a shared ticket: `farmer`.
- **Join ticket ≠ FarmCode.** The ticket says *where* the farm is on Freenet; the FarmCode is what decrypts it. A ticket alone grants nothing.
- **Short join ticket ≠ raw Freenet ticket** — the v1 `{ hotUri, bonesUri }` JSON is the *Advanced* fallback, not the thing operators are taught.
- LAN shelf: `tmp/lan-sync/join-manifests.json`; routes under `/api/sync/join-ticket`.

**IndexedDB for mist:** `pufam-mist-v1` (not `sentinut_*` or `pufom_*`).

---

## 8. Firestore path conventions

Top-level collections (production):

| Path | Purpose |
|------|---------|
| `farms/{farmId}` | Farm doc (`enabledModules`, `farmProfile`, …) |
| `farms/{farmId}/events/{id}` | Diary events (maps from local `diary` kind) |
| `farms/{farmId}/issues/{id}` | Active field issues |
| `farms/{farmId}/archived_issues/{id}` | Archived issues |
| `farms/{farmId}/blocks|pins|tracks|viewport/…` | Map geometry (cloud mirror) |
| `farms/{farmId}/settings/{doc}` | e.g. `safety`, `model_params` |
| `farms/{farmId}/harvests/{id}` | Harvest records |
| `farms/{farmId}/tasks/{id}` | Tasks |
| `farms/{farmId}/presence/{uid}` | Crew GPS |
| `farms/{farmId}/mapHighlights/{id}` | Map overlay highlights |
| `farms/{farmId}/environmental_cache/{key}` | Per-farm env cache |
| `farms/{farmId}/nutrition_data/{id}` | Nutrition uploads |
| `farms_public/{farmId}` | Nearby discovery (name + coarse location) |
| `users/{uid}` | Membership, role, modules, `authEpoch` |
| `users_public/{uid}` | Display-safe profile |
| `access_pins/{hash}` | Invite PIN hashes (admin SDK only) |
| `chill_cache/{station-season}` | Shared chill aggregates |
| `weather_cache/…` | DPIRD station cache (functions) |

**Naming rule:** Subcollection ids are **domain nouns** (`events`, not `diary`), while local IndexedDB uses kind `diary` — mapping lives in `flushFarmOutbox.ts`.

---

## 9. Documentation procedures

### Where plans live

| Location | Use for |
|----------|---------|
| **`Plans/*.md`** | Durable design, roadmaps, acceptance criteria, naming-adjacent specs |
| **`DEVELOPER_NOTES.md`** | Architecture audit, quick checklist, pointers to Plans — **not** a second naming glossary |
| **`README.md`** | Operator/dev onboarding, links into Plans |
| **`units/*/README.md`** | Package-local API notes (e.g. mist-freenet, puf-freenet-host) |
| **`desktop/README.md`** | Electron shell layout + build commands (plan stays in `Plans/`) |
| **`SITE_SYNOPSIS.txt`** | PUFworks-site module blurb — keep aligned with `brand.ts` |

### Adding or updating a plan

1. **Filename:** `SCREAMING_SNAKE.md` for topic plans (`FARM_EXPORT_JSON_XLSX.md`); short verb phrases OK (`RENAME_TO_PUFAM.md`).
2. **Header block:** Status, date, product name **PUF-AM**, one-line scope.
3. **Cross-link:** Add row to README “Development roadmap” table and a pointer in `DEVELOPER_NOTES.md` if the plan affects architecture or checklist.
4. **Experimental vs production:** Plans for mist, pre-release spikes, or workshop-only paths must state **“experimental — not production”** in the first screen (see [`MIST_NETWORK_STORAGE.md`](MIST_NETWORK_STORAGE.md)). Production auth remains [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md).
5. **Naming changes:** Update **this file** first, then dependent plans — not the reverse.
6. **Commits:** Commit docs in the **same PR** as the feature they describe (user policy: no drive-by doc-only commits unless requested).

### When to touch `DEVELOPER_NOTES.md`

- New major subsystem or danger zone in §2 / §4.
- Roadmap step status changes (§5) — mirror [`ROADMAP.md`](ROADMAP.md).
- New Plan that operators/agents need from the architecture index — **one link**, not full duplication.

---

## 10. Legacy vs preferred — decision matrix

| Context | Preferred (new work) | Keep legacy (do not rename without migration) |
|---------|----------------------|-----------------------------------------------|
| UI / docs / marketing | **PUF-AM**, Ag Manager | — |
| npm / Cloud Run / mDNS | — until Phase B | `walnut-farm-manager`, `pufom-*` service |
| Sync bundle | — | `.pufom`, `PUFOM1`, `format: "pufom"` |
| Local entity IDB | — | `pufom_farm_local` |
| Geometry / basemap IDB | — | `sentinut_*` DB names |
| localStorage session/sync | — | `pufom_*`, `sentinut_*` |
| Mist IDB + HKDF | **`pufam-mist-v1`**, `pufam.*` keys | — |
| MistStore paths | **`mist/v1/...`** | — |
| Android | — | `com.sentinut.farm` |
| Auth synthetic email | — | `@sentinut.local` |
| CSS map classes | **`pufam-*`** | — |

**New IndexedDB or localStorage keys:** use **`pufam.`** or **`pufam-`** prefix unless extending an existing `pufom_*` / `sentinut_*` store.

---

## 11. Code rename backlog (docs only — not this pass)

Track in [`RENAME_TO_PUFAM.md`](RENAME_TO_PUFAM.md) Phase B. High-impact items:

- Cloud Run service + URL alias
- mDNS `_pufam-sync._tcp` dual-advertise
- Optional `PUFAM1` magic alongside `PUFOM1`
- npm package rename
- Migrate legacy `localStorage` issue/diary keys fully into `pufom_farm_local` (code cleanup)
- GitHub folder rename `Walnut_farm_manager` → optional

Do **not** rename `com.sentinut.farm` or wipe `sentinut_*` / `pufom_*` storage without explicit migration design.
