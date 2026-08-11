# PUF-AM — Ag Manager

Paddock-first farm tools for mixed enterprises — map areas and issues, diary plans, seasonal records, and optional crop packs (walnut blight / chill first).

**Repo:** [https://github.com/paraquatsundae/PUF-AM](https://github.com/paraquatsundae/PUF-AM) (local folder may still be `Walnut_farm_manager`).

**Brand:** **PUF-AM** = **PUF** (Prototype Until Failure workshop) + **AM** (Ag Manager). Formerly PUFOM / Orchard Manager — see [`Plans/NAMING.md`](Plans/NAMING.md) and rebrand checklist [`Plans/RENAME_TO_PUFAM.md`](Plans/RENAME_TO_PUFAM.md). In-app mark is the PUF emu; Android launcher uses a green farm variant so it stays distinct from other PUF apps.

**Display vs technical IDs:** Operators see **PUF-AM**. Wire/sync and storage legacy ids (`com.sentinut.farm`, `.pufom`, `pufom_*`, `sentinut_*`, …) — see [`Plans/NAMING.md`](Plans/NAMING.md).

**Live app:** [https://am.pufworks.farm](https://am.pufworks.farm) (Cloud Run service still named `pufom` until Phase B rename; fallback [*.run.app](https://pufom-quby5ye5pa-ts.a.run.app)). Redeploy: `npm run deploy:cloudrun`. Domain + APK releases: [`Plans/DEPLOY_CLOUD_RUN.md`](Plans/DEPLOY_CLOUD_RUN.md).

**Android APK:** [GitHub Releases latest](https://github.com/paraquatsundae/PUF-AM/releases/latest) (Actions workflow `release-apk.yml`).

**Local:** [http://localhost:3000](http://localhost:3000) via `npm run dev`.

**AI Studio share link** (project collaborators): [https://ai.studio/apps/143a17d7-b431-4490-8302-3a5ff176bb96](https://ai.studio/apps/143a17d7-b431-4490-8302-3a5ff176bb96)

## Paddock workflow

1. **Farm setup** — enterprises, dryers, seasonal water allocation (ML), irrigation method (rarely changes).
2. **Farm map** — draw paddocks/blocks, drop issue pins, optional offline basemap pack.
3. **Farm diary** — plans, sprays, irrigation, nutrition applications, and work (system of record).
4. **Blight risk** *(walnut blight pack)* — weather-linked infection risk when that crop pack is active.
5. **Water & nutrition** — log applications to the diary; water budget uses Farm setup allocation.
6. **Harvest & drying** — yield by area folder; drying sessions use configured dryers.

Home shows open issues and plans (plus a blight snapshot when the walnut pack is on). Financials and team tools remain under Records / System.

## Key features

* **Farm map** — Areas (blocks / paddocks), pins, tracks; issue → diary plan loop; offline map packs (Capacitor).
* **Farm diary** — Spray, water, nutrition, and work plans with filters and CSV export.
* **Crop packs** — Optional tools installed by farm admins under **Farm setup → Crop packs** (Install / Activate / Deactivate / Delete). **Walnut blight** is the first pack (Ji et al. 2025 + chill). See [adding a crop pack](#adding-a-crop-pack) for developers.
* **Water** — Irrigation logging + seasonal ML budget from Farm setup.
* **Nutrition** — Application diary (product, rate, N/P/K); soil lab XLSX import deferred.
* **Harvest & drying** — Per-block harvest folders; exponential-decay dryer moisture prediction.
* **Farm setup** — One-time infrastructure (dryers, water right, irrigation method).
* **Team** — Invite PIN auth, roles (admin / farmer / viewer); PIN presets clamp to farm modules and crop packs.

## Tech stack

* **Frontend**: React 19, TypeScript, Vite
* **Styling**: Tailwind CSS, Lucide React
* **State**: Zustand
* **Backend**: Firebase (Firestore, Auth), optional Cloud Functions for weather cache
* **Maps**: React Leaflet, Turf.js
* **Charts**: Recharts

## Getting started

### Prerequisites
* Node.js (v18 or higher recommended)
* npm or yarn
* A Firebase project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure secrets (local only — never commit)**
   ```bash
   cp firebase-applet-config.example.json firebase-applet-config.json
   cp .env.example .env
   ```
   Edit `firebase-applet-config.json` with your Firebase project credentials.
   Edit `.env` with your API keys:
   - `DPIRD_API_KEY` — WA DPIRD weather API (**server only** — never `VITE_`)
   - `VITE_GOOGLE_MAPS_API_KEY` — Google Maps tiles (optional; restrict in Google Cloud — see `Plans/API_KEY_SECURITY.md`)
   - `APP_URL` — `http://localhost:3000` for local dev; Cloud Run URL after publish
   - `VITE_APP_URL` — optional; set to Cloud Run **App URL** after publish

4. **Start the development server**
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`. Use invite PIN sign-in (or workshop mode if configured).

## Project structure

* `src/components/` — UI components (map, dryer performance, diary panels).
* `src/pages/` — Main views (Dashboard, Map, Diary, Blight, Water, Nutrition, Harvest, Farm setup, …).
* `src/packs/` — Crop-pack UI registry (`<packId>/` routes, nav, surfaces → `registry.ts`). Not Freenet plugins.
* `src/lib/` — Stores and domain logic (`farmDiary`, `blightModel`, `farmAssets`, `mapStore`, …).
* `src/contexts/` — Auth and shared context.
* `src/services/` — Firestore/API helpers.
* `shared/farm/cropPacks.ts` — Pack catalog + Install/Activate/Deactivate/Delete helpers.
* `shared/weather/` — DPIRD client shared by server and functions.
* `Plans/` — Roadmap, smoke tests, offline map notes.
* `DEVELOPER_NOTES.md` — Architecture notes and checklist.

## Adding a crop pack

Crop packs are **in-app** capabilities (modules, routes, pack settings UI). They are **not** Freenet host plugins ([`Plans/DESKTOP_FREENET_PLUGIN.md`](Plans/DESKTOP_FREENET_PLUGIN.md)).

| Doc | Use |
|-----|-----|
| [`Plans/CROP_PACK_PLUGIN.md`](Plans/CROP_PACK_PLUGIN.md) | **Developer contract** (D1–D15), farm-admin lifecycle, acceptance checks |
| [`Plans/BLIGHT_ENGINE_PLUGIN.md`](Plans/BLIGHT_ENGINE_PLUGIN.md) | Reference pack (walnut blight settings home) |
| [`.github/PULL_REQUEST_TEMPLATE/crop-pack.md`](.github/PULL_REQUEST_TEMPLATE/crop-pack.md) | PR checklist when adding or changing a pack |

**Minimum wiring for a new pack**

1. Catalog entry in `shared/farm/cropPacks.ts` (`CropPackDef`: id, modules, settings doc, `canInstall`).
2. UI registration in `src/packs/<id>/index.ts` + append to `PACK_UI_REGISTRY` in `src/packs/registry.ts` (routes, nav, surfaces).
3. Pack surface (production knobs on the pack page — not Settings → Advanced).
4. Firestore rules for pack settings fields; tests for lifecycle + registry.
5. Open the PR with the [crop-pack template](.github/PULL_REQUEST_TEMPLATE/crop-pack.md).

## Development roadmap

| Document | Contents |
|----------|----------|
| [`Plans/NAMING.md`](Plans/NAMING.md) | Product, storage keys, export formats, Firestore paths, doc procedures |
| [`Plans/CROP_PACK_PLUGIN.md`](Plans/CROP_PACK_PLUGIN.md) | Crop-pack developer contract + admin Install/Activate/Deactivate/Delete (not Freenet) |
| [`Plans/BLIGHT_ENGINE_PLUGIN.md`](Plans/BLIGHT_ENGINE_PLUGIN.md) | Walnut blight pack settings home (reference crop pack) |
| [`Plans/ROADMAP.md`](Plans/ROADMAP.md) | Full plan: tasks, acceptance criteria, progress |
| [`DEVELOPER_NOTES.md`](DEVELOPER_NOTES.md) §5 | Quick-reference checklist |
| [`Plans/SMOKE_TEST_LOG.md`](Plans/SMOKE_TEST_LOG.md) | Manual smoke tests |
| [`Plans/OFFLINE_MAP_APK.md`](Plans/OFFLINE_MAP_APK.md) | Offline basemap + Capacitor APK |
| [`Plans/AUTH_INVITE_PIN.md`](Plans/AUTH_INVITE_PIN.md) | Invite PIN auth (production) |
| [`Plans/MIST_NETWORK_STORAGE.md`](Plans/MIST_NETWORK_STORAGE.md) | Experimental mist: Reticulum + Freenet-style storage (fork; does not replace Firebase auth). Laptop B recovery: `/login/mist-recover` with FarmCode — same `farmId`, local IndexedDB only until Freenet sync. |
| [`Plans/DESKTOP_FREENET_PLUGIN.md`](Plans/DESKTOP_FREENET_PLUGIN.md) | Fedora + Windows desktop installers with Freenet running as an in-app plugin (Electron frozen). Fedora AppImage ships a bundled Freenet node; `npm run desktop:dev` runs the shell. Windows installer still needs a Windows host. |
| [`Plans/MIST_TWO_FEDORA_FREENET.md`](Plans/MIST_TWO_FEDORA_FREENET.md) | Two-laptop Freenet 0.2 Opennet join. **Passed on the AppImage ~2026-08-04** — blank laptop B recovered a farm from a paper FarmCode plus a join ticket, no terminal on either machine. |
| [`Plans/APK_FREENET_PLUGIN.md`](Plans/APK_FREENET_PLUGIN.md) | Freenet on the tablet APK — why Android cannot host a node, the hub option recommended for Phase 1, and the APK build wiring (`npm run apk:debug`). **Freenet host not implemented on Android.** |
| [`Plans/FREENET_CONTRIBUTE_AND_STORAGE.md`](Plans/FREENET_CONTRIBUTE_AND_STORAGE.md) | Contribute vs communicate (`contribute_storage`), what PUF-AM publishes (Hot, bones, join manifests), what is sealed before upload, and what is **not** on Freenet. |
| [`Plans/LOCAL_DATA_STORAGE.md`](Plans/LOCAL_DATA_STORAGE.md) | Every local store — IndexedDB, localStorage, Firestore paths, Android sandbox, Electron `userData`, LAN shelves — and which are authoritative rather than cache. |

### Tests

```bash
npm test        # Vitest: blight model, dryer model, API health, DPIRD helpers
npm run lint    # TypeScript check
npm run build   # Production build
```

### Cloud Functions & production deploy

```bash
cd functions && npm install && npm run build
firebase deploy --only functions,firestore:rules,firestore:indexes
firebase functions:secrets:set DPIRD_API_KEY
```

Grant admin access:

```bash
npx tsx scripts/setAdminClaim.ts <firebase-auth-uid>
```

---

**Note:** Originally prototyped with Google AI Studio tooling. Generative AI / Predictive Insights features have been removed in favour of deterministic farm tools and diary-first workflows.
