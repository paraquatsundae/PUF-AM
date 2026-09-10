# AGENTS.md — PUF-AM

Read this first. It orients an agent; it does not replace the plans. Identifiers are settled by [`Plans/NAMING.md`](Plans/NAMING.md); the plan index is [`Plans/README.md`](Plans/README.md).

## 1. What this repo is

PUF-AM (also written PUFAM; "PUF" is the Prototype Until Failure workshop, "AM" is Ag Manager) is a paddock-first farm-management app for mixed enterprises: farm map, diary, seasonal records, team access by invite PIN, and optional crop packs (walnut blight, chill portions, drying, water, nutrition, harvest). One codebase ships four shells: the web app at `https://am.pufworks.farm`, a Capacitor Android APK, an Electron desktop app, and a LAN hub mode of the same Express server. Production storage is Firebase (Firestore + Auth) on project `pufworks-am`; an experimental peer-storage path over Freenet 0.2, codenamed "mist", exists behind `VITE_MIST_EXPERIMENTAL` and is not the shipping path. The Android application id `com.sentinut.farm` and the legacy wire/storage ids (`.pufom`, `pufom_*`, `sentinut_*`, `_pufom-sync._tcp`) are frozen for continuity — operators see PUF-AM, the wire still says PUFOM.

## 2. Where things live

| Path | Contents |
|------|----------|
| `src/` | React 19 + Vite client. `pages/` compose, `components/` render, `hooks/` one job each, `lib/` stores and pure helpers, `contexts/` auth, `packs/` the core↔pack seam (`registry.ts` discovers `plugins/*/src/index.ts` at build time), `mist/` experimental Freenet client code |
| `server/` | Express API (`server.ts` entry, `createApiApp.ts`): auth/PIN routes, weather proxy, tile proxy, LAN sync, mDNS hub |
| `shared/` | Code used by client, server and functions: farm catalog and crop-pack contract (`shared/farm`), DPIRD client and blight model (`shared/weather`), sync tickets/grants (`shared/sync`), auth helpers |
| `functions/` | Hosted Cloud Functions (weather scheduler, blight/financial aggregates). Own `node_modules`; not yet deployed on `pufworks-am` |
| `functions-byo-weather/` | Owner-deployed weather function for bring-your-own Firebase farms (Design A). Refuses to deploy to a PUFworks project |
| `desktop/` | Electron main process, loopback/LAN hub auth, bundled Freenet host wiring. Own tsconfig (`npm run lint:desktop`) |
| `android/` | Capacitor project. `local.properties` is machine-local and gitignored |
| `plugins/<id>/` | One crop pack each: `plugin.json` plus the whole implementation in `src/`. Not Freenet plugins |
| `units/` | Standalone packages: `mist-freenet` (crypto, FarmCode, slot contract), `puf-freenet-host` (node lifecycle) |
| `scripts/` | Build, deploy and audit scripts (`*.mjs` / `*.ts`); header comments cite the plan they implement |
| `tests/` | Vitest suites (root config `vitest.config.ts`); pack-local tests sit beside pack code |
| `Plans/` | Live specs and active plans at the top level; `Plans/reference/` finished designs cited by `§` from code (frozen); `Plans/logs/` append-only logs; `Plans/archive/` closed work with `INDEX.md`. Index: [`Plans/README.md`](Plans/README.md) |

## 3. Docs to read first, by task

Start at [`Plans/README.md`](Plans/README.md) for the full table. The load-bearing ones:

| Doc | Open it when |
|-----|--------------|
| [`Plans/NAMING.md`](Plans/NAMING.md) | Touching any name, env var, storage key, Firestore path, export format, or adding a doc (§9 procedures) |
| [`Plans/CODEBASE_HEALTH.md`](Plans/CODEBASE_HEALTH.md) | Adding or growing a file, moving logic between page/hook/lib/server, or reading a `npm run audit:codebase` failure |
| [`Plans/PLUGIN_AUTHORING.md`](Plans/PLUGIN_AUTHORING.md) | Adding or changing a crop pack (contract in `CROP_PACK_PLUGIN.md`; copy the chill portions template in § Template pack, not walnut blight) |
| [`Plans/API_KEY_SECURITY.md`](Plans/API_KEY_SECURITY.md) | Anything involving DPIRD, tiles, Firebase web key restrictions, or a BYO owner's credentials |
| [`Plans/DEPLOY_CLOUD_RUN.md`](Plans/DEPLOY_CLOUD_RUN.md) | Deploying, changing the domain path, APK releases, Android emulator / LAN dev builds, or `TRUSTED_PROXY_CIDRS` |
| [`Plans/FIREBASE_BILLING.md`](Plans/FIREBASE_BILLING.md) | Anything that can put a read, write or function call on George's bill; BYO Firebase; the create-farm gate (§5.1) |
| [`Plans/SETTINGS_SYNC_AND_CREW.md`](Plans/SETTINGS_SYNC_AND_CREW.md) | Settings → Sync cards, join tickets/grants, auto-sync ladder, farm gateway, People list |
| [`Plans/FREENET_OPERATOR_FLOW.md`](Plans/FREENET_OPERATOR_FLOW.md) | Any Freenet/mist operator-facing change; known holes and their status are §8; what is on Freenet is §9 |

Source comments cite plans as `Plans/X.md §n`, `Plans/reference/X.md §n`, or (for three decision records) `Plans/archive/X.md`. Follow the citation before changing the code it annotates. The Freenet desktop / APK plugin designs and the mist storage design are under `Plans/reference/` — read them, do not act on them as open plans.

## 4. Hard rules

Each of these is stated in a plan; the plan has the reasoning.

- `DPIRD_API_KEY` is server-only. Never `VITE_DPIRD_API_KEY` — Vite bakes any `VITE_*` into the APK and bundle. (`NAMING.md` §3, `API_KEY_SECURITY.md`)
- A BYO owner's DPIRD key is never stored in Firestore, in the client, or in George's Secret Manager. They set it in their own project. (`FIREBASE_BILLING.md` §3)
- A BYO farm with no weather endpoint fails closed. It never falls back to `am.pufworks.farm` or George's weather cache. (`FIREBASE_BILLING.md`, `tests/byoWeatherRouting.test.ts`)
- The BYO refuse-list must reject both `gen-lang-client-0444791425` (retired AI Studio project) and `pufworks-am`. Client: `src/lib/byoFirebaseConfig.ts`; function: `functions-byo-weather/src/constants.ts` and `scripts/refuseHostedProject.mjs`. Tests cover both.
- Hosted farms use the `(default)` Firestore database on `pufworks-am` only; the old named-database path is gone. BYO wizards force `(default)` too — a second database forfeits the free tier. (`FIREBASE_BILLING.md` §3, `scripts/deployFirestoreRules.mjs`)
- Android `applicationId` `com.sentinut.farm` is frozen. Do not change it. (`NAMING.md` §2)
- No App Check. Deferred deliberately on 2026-09-07; do not wire it up as a drive-by. (`API_KEY_SECURITY.md`)
- The tile proxy `/api/tiles/:z/:x/:y` stays unauthenticated on every shell. Leaflet loads tiles as `<img>` and cannot send a header; a guarded tile route is a route the map cannot use. (`API_KEY_SECURITY.md`)
- Do not run `npm audit fix --force`. It downgrades `firebase-tools`. (`Plans/logs/AUDIT_LOG.md`)
- Never commit `secrets/`, `.env*` (except `.env.example`), `firebase-applet-config.json`, or `android/local.properties`. (`SECURITY.md`)
- The Cloud Run service name stays `pufom`; the rename is deferred Phase B (`ROADMAP.md` D-06).
- `australia-southeast1` has no native Cloud Run domain mappings. `am.pufworks.farm` is served by a Firebase Hosting rewrite to Cloud Run; do not try `gcloud run domain-mappings` there. (`DEPLOY_CLOUD_RUN.md`)
- Do not renumber or retitle sections in `Plans/reference/DESKTOP_FREENET_PLUGIN.md`, `Plans/reference/APK_FREENET_PLUGIN.md`, `Plans/reference/MIST_NETWORK_STORAGE.md`, `Plans/reference/MIST_TWO_FEDORA_FREENET.md` or `Plans/SETTINGS_SYNC_AND_CREW.md`. Source comments cite them by `§n` and section title. Moving or renaming any plan means updating every code comment, script string, config path and CI message in the same commit (`NAMING.md` §9).
- Crop packs are not Freenet plugins, and Freenet is a network pack, not a crop pack. Keep the two vocabularies apart. (`NAMING.md` §1)

## 5. Commands

All from the repo root. Node is managed with fnm; if `node`/`npx` is missing, load fnm into the shell first.

| Command | Does |
|---------|------|
| `npm run dev` | Express + Vite dev server on `http://localhost:3000` (`tsx server.ts`) |
| `npm run build` | Production web bundle to `dist/` |
| `npm run lint` | `tsc --noEmit` for root and `desktop/`, then ESLint errors only |
| `npm test` | Vitest, all suites once (`vitest run`) |
| `npm run apk:debug` / `npm run apk:install` | Build the debug APK from a clean tree / install it over adb |
| `npm run deploy:rules` | Deploy `firestore.rules` and indexes to the configured project (`scripts/deployFirestoreRules.mjs`) |
| `npm run deploy:cloudrun` | Cloud Build + deploy service `pufom` to `australia-southeast1` with secrets from Secret Manager |
| `npm run audit:codebase` | Codebase health gate: size limits, layering, leftover `harvest_drying` |
| `npm run audit:bundle` | After `npm run build`: fails if workshop mode folded in or a client map key crept into `dist/` |

Android builds need a JDK 17 or 21 — Fedora's default JDK is too new for the Android Gradle Plugin. Point `JAVA_HOME` at one: `JAVA_HOME=/path/to/jdk-21 npm run apk:debug`.

Do not have `VITE_API_BASE_URL` exported in the shell that runs `npm test`. `getApiBaseUrl()` is expected to return `''` when nothing is configured, and several `tests/apiBase*.test.ts` cases fail if the environment supplies one.

## 6. Conventions

- Commits: keep code, docs and `package-lock.json` in separate commits when asked to split; otherwise docs land in the same PR as the feature they describe. No drive-by doc-only commits unless requested. (`NAMING.md` §9)
- `Plans/` layout (`NAMING.md` §9 "Folder convention"): live specs and active plans at the top level; `Plans/reference/` for finished designs still cited by `§` from code (content frozen, only link paths change); `Plans/logs/` for append-only logs (allow-listed in `scripts/audit-codebase.mjs`); `Plans/archive/` for closed work, each with a dated banner and a row in `archive/INDEX.md`. Do not add a fifth folder.
- Decisions get a dated line in the relevant plan (status header, progress log, or a "Decision — YYYY-MM-DD" paragraph), not a new file, unless the topic has no home.
- New plan files follow `NAMING.md` §9: `SCREAMING_SNAKE.md`, header block with Status / Date / Product, cross-link from `Plans/README.md`.
- Freenet / mist is experimental. Firebase Auth + invite PIN remains the shipping path; any mist doc or UI says so in its first screen.
- Pages compose, hooks do one job, `lib/` has no React except existing stores, `AuthContext` never imports pack hooks. CodeRabbit path rules in `.coderabbit.yaml` mirror `CODEBASE_HEALTH.md`.
