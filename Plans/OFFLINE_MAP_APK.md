# Offline Map + Android APK Roadmap

**Created:** 13 July 2026  
**Last updated:** 27 July 2026  
**Status:** Phase 1–3 done for workshop (NSD + photo queue + weather IDB); later: SQLite / PWA / NearMap

---

## Phase 1 — Local farm basemap (done)

First open of **Orchard Map** without a local pack prompts:

1. Location search (Nominatim)
2. Region preview + size warning (auto maxZoom shrink; hard cap 20k tiles)
3. Download Esri World Imagery (z12–max) into IndexedDB
4. Map uses cached tiles first; works offline for that region
5. **Skip for now** persists per farm; header shows Offline / Save / Update / Clear

| Module | Path |
|--------|------|
| Pack store | `src/lib/basemapPack.ts` (v2: tiles shared by `z/x/y` across farms) |
| Downloader | `src/lib/tileDownloader.ts` (skips tiles already on device) |
| Setup UI | `src/components/map/FarmBasemapSetup.tsx` (device scan / reuse / delete) |
| Cached layer | `src/components/map/CachedTileLayer.tsx` |
| Wire-up | `src/pages/OrchardMap.tsx` |

Failed updates do **not** wipe an existing pack. When offline, the cached layer does not hit the network.

### Tablet display fix (2026-07-27)

Blank sat imagery on Capacitor (pack **and** Skip for now) was addressed:

1. **Cached tiles** — stop revoking `blob:` URLs in `img.onload` (Android WebView blanks tiles); revoke on Leaflet tile remove. Network fallback if a blob fails to decode.
2. **Skip / online** — native Capacitor prefers Esri World Imagery over Google Mutant (LAN live-reload origins often fail Maps JS referrer checks). Desktop still uses Google when a real key is set; Mutant failure falls back to Esri.
3. **Online detection** — use `@capacitor/network` alongside `navigator.onLine` so packs are not stuck `offlineOnly` with dark placeholders.

**Device scan / dedupe (2026-07-27):** Setup UI lists packs already in IndexedDB. **Use for this farm** links an existing pack without re-download. Downloads skip tiles already cached (shared `z/x/y` keys). Clearing a pack purges only tiles no other pack still needs.

### Farm geometry (local-first, done)

Blocks, pins, tracks, and viewport use IndexedDB (`sentinut_farm_geometry`) the same way tiles do:

| Module | Path |
|--------|------|
| IDB store + pending queue | `src/lib/farmGeometryIdb.ts` |
| Load / persist / flush sync | `src/lib/farmGeometrySync.ts` |
| UI store | `src/lib/mapStore.ts` |

Writes always hit the device first; when online they mirror to Firestore. Offline edits queue and flush on `online`.

---

## Phase 2 — Capacitor Android APK (scaffold done)

Installable paddock shell using the same Vite build. Tiles still live in **IndexedDB** (Filesystem migration later if quota bites).

| Item | Value |
|------|--------|
| App ID | `com.sentinut.farm` (unchanged for install continuity) |
| App name | PUFAM (Ag Manager) |
| Launcher icon | `PUFom_icon.png` → `assets/pufom-apk-icon-master.png` (emu in orchard circle) |
| In-app logo | Same mark (`public/logo.png`) |
| Config | `capacitor.config.ts` |
| Native project | `android/` |
| Web dir | `dist` (Vite `base: './'`) |

### Workshop build

```powershell
cd C:\Projects\Walnut_farm_manager
npm run build:android
npm run open:android
```

In Android Studio: run on a device/emulator. Set `VITE_WORKSHOP_MODE=true` in `.env` before `build:android` for demos without Google login.

### CI releases (GitHub Actions)

Public downloads come from **GitHub Releases**, not PUFworks-site `public/downloads/`.

| Item | Value |
|------|--------|
| Workflow | `.github/workflows/release-apk.yml` |
| Triggers | `workflow_dispatch` or tag `v*` |
| Default artefact | `PUFAM.apk` (debug unless signing secrets set) |
| Latest URL | https://github.com/paraquatsundae/PUF-AM/releases/latest |
| Baked API URL | `https://am.pufworks.farm` |

**Required secret (Firebase client config):** `firebase-applet-config.json` is gitignored and imported by `src/firebase.ts`. CI writes it from repo secret `FIREBASE_APPLET_CONFIG` (raw JSON) before `vite build`:

```powershell
cd C:\Projects\Walnut_farm_manager
gh secret set FIREBASE_APPLET_CONFIG --repo paraquatsundae/PUF-AM < firebase-applet-config.json
```

(Locally: `cp firebase-applet-config.example.json firebase-applet-config.json` and fill values.)

**Windows — dispatch a build:**

```powershell
cd C:\Projects\Walnut_farm_manager
gh workflow run release-apk.yml
# watch: gh run watch
```

Or: GitHub → **Actions** → **Release Android APK** → **Run workflow**.

**Tag release:**

```powershell
git tag v0.1.0
git push origin v0.1.0
```

**Signed release later (optional):** add repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, then run the workflow with `build_type=release`. Never commit the keystore. Full domain cutover notes: `Plans/DEPLOY_CLOUD_RUN.md`.

### DPIRD weather cache (historic + daily)

Safeguard against the 100-day API page trap:

| Layer | Behaviour |
|-------|-----------|
| `weather_cache/{station}` | Stores ~800 days of daily summaries |
| Cloud Function hourly | Merges **last 14 days** only; backfills historic when thin |
| Dev `POST /api/weather/ensure-cache` | Bootstraps/fills gaps into Firestore from Express |
| Blight client | Reads cache first; calls ensure-cache in dev if coverage missing |

### Invite PIN / API from the emulator

By default Capacitor **live-loads** the app from your PC (`http://10.0.2.2:3000`) so invite PIN `/api` works:

1. Keep `npm run dev` running (listens on `0.0.0.0:3000`).
2. `npx cap sync android` (or `npm run build:android`) then Run ▶ in Android Studio.
3. Emulator must have network (not airplane mode) while signing in.

Packaged shell (no live server): `CAP_PACKAGED=1 npx cap sync android` — then API uses `http://10.0.2.2:3000` from `apiBase.ts`.

Physical phone / tablet (same Wi‑Fi as the PC):

```powershell
# Keep npm run dev running, then:
npm run sync:android:lan
npm run open:android
```

That detects the PC Wi‑Fi IP and sets Capacitor `server.url` (e.g. `http://192.168.x.x:3000`). Or set manually: `$env:CAP_SERVER_URL="http://<pc-lan-ip>:3000"; npx cap sync android`.

Phone **browser** (no APK): open `http://<pc-lan-ip>:3000` while `npm run dev` is up.

Packaged APK (no live server): `CAP_PACKAGED=1` before sync, and set `VITE_API_BASE_URL=http://<pc-lan-ip>:3000` before `vite build`.

### Airplane-mode check

1. Online: open Orchard Map → download a farm pack for a tight place (e.g. Manjimup WA).
2. Enable airplane mode.
3. Confirm satellite imagery still paints inside the pack bounds; missing tiles stay dark.
4. Confirm previously synced blocks/issues still load from local caches.

### Still to do (later)

- Move large tile packs to Capacitor Filesystem
- Splash + icon polish
- Play Store packaging

---

## Phase 3 — Sync adapters (in progress)

```
Device outbox ──► Firebase Firestore (current)
              └──► LAN shelf on workshop PC (Express) / .pufom file share
```

### Done

| Piece | Path |
|-------|------|
| Universal outbox (issues + diary) | `src/lib/localFarmRepo.ts`, `flushFarmOutbox.ts` |
| Geometry outbox | `farmGeometryIdb.ts` / `farmGeometrySync.ts` |
| Photo Storage outbox | `photoOutbox.ts`, `flushPhotoOutbox.ts` |
| `.pufom` v1 format + LWW merge | `shared/sync/pufomBundle.ts` |
| Gzip encode/decode | `src/lib/pufomCodec.ts` |
| Export / import / LAN client | `src/lib/pufomSync.ts` |
| LAN shelf API | `server/lanSyncRoutes.ts` → `POST/GET /api/sync/lan/:farmId` |
| Native NSD + hub scan | `PufomNsdPlugin.java`, `nsdPeers.ts`, `mdnsPeers.ts` |
| Offline weather IDB | `weatherCacheIdb.ts` + OfflineSyncCard **Cache weather** |
| Settings UI | `src/components/OfflineSyncCard.tsx` |
| Listener cost (issues + archive) | poll + cache instead of live `onSnapshot` |

### Workshop LAN flow

1. PC: `npm run dev` (listens on LAN, advertises mDNS `_pufom-sync._tcp`).
2. Tablet A: open via LAN URL / live-reload, then **Settings → Offline & sync → Scan mDNS peers** → select hub → **Push to LAN**.
3. Tablet B (same farm, same Wi‑Fi): scan / select same hub → **Pull from LAN** → LWW merge into IndexedDB.
4. Or share a downloaded `.pufom` file (USB / AirDrop / chat).

Shelf files persist under `tmp/lan-sync/` (gitignored) while the PC is the hub.

### mDNS peer discovery

| Piece | Path |
|-------|------|
| Advertise + browse | `server/mdnsHub.ts` (`bonjour-service`) |
| Service type | `_pufom-sync._tcp` (`shared/sync/mdnsConstants.ts`) |
| APIs | `GET /api/sync/self`, `GET /api/sync/peers?waitMs=2500` |
| Client | `src/lib/mdnsPeers.ts` + Offline & sync peer picker |

- Set `PUFOM_MDNS=0` to disable advertise/browse (wire name stays `pufom` until rename Phase B).
- Windows: allow Node.js through the firewall for private networks (UDP 5353 + TCP app port).
- Browsers cannot browse mDNS themselves — clients ask the current Express hub to scan. First tablet connection still needs a LAN IP / `npm run sync:android:lan`; after that, **Scan mDNS peers** finds other workshop hubs.
- Console logs the hub URL and `http://<hostname>.local:<port>` when advertising.

### Phase 3 leftovers closed (2026-07-27)

| Piece | Path |
|-------|------|
| Photo outbox (Storage) | `src/lib/photoOutbox.ts`, `flushPhotoOutbox.ts`, FieldMode enqueue + preview `photoData` |
| Storage rules | `storage.rules` (wired in `firebase.json`) — deploy with `firebase deploy --only storage` |
| Weather IDB | `src/lib/weatherCacheIdb.ts`; `weatherService` mirrors + offline read; Offline & sync **Cache weather** |
| Native NSD | `android/.../PufomNsdPlugin.java` + `src/lib/nsdPeers.ts`; Offline & sync **Scan for hubs** |
| Last hub | `localStorage` `pufom_last_sync_hub` + `setRuntimeApiBaseUrl` for packaged cold start |

### Still later

- Optional SQLite adapter (Capacitor) if IDB quota bites
- PWA service worker (APK path preferred for paddock)
- NearMap / paid AU imagery
- Tile packs on Capacitor Filesystem
- Mapping issues (separate track)
- **Freenet mist backup** (encrypted durable layer for diary/issues without paid cloud storage) — workshop: [FREENET_MIST_BACKUP.md](./FREENET_MIST_BACKUP.md)
