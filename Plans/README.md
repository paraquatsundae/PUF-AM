# Plans index

**Product:** PUF-AM — Ag Manager · **Updated:** 2026-09-10 (consolidation: 37 docs → 20 live + 4 reference + 2 logs + 13 archived)

One row per document. Status: **Live spec** (describes current behaviour; code depends on it) · **Active plan** (open work) · **Reference** (finished; cited by `§` number from source — headings frozen) · **Log** (append-only) · **Archived** (closed; kept for history under [`archive/`](archive/INDEX.md)).

Agents: read the repo-root [`AGENTS.md`](../AGENTS.md) first, then whichever row matches the task. Naming disputes are settled by [`NAMING.md`](NAMING.md); the folder rules are [`NAMING.md`](NAMING.md) §9 "Folder convention".

## Product & naming

| Doc | Status | Purpose |
|-----|--------|---------|
| [`NAMING.md`](NAMING.md) | Live spec | Product names, env vars, storage keys, export formats, Firestore paths, documentation procedures and the `Plans/` folder convention (§9). Wins on disagreement. |
| [`ROADMAP.md`](ROADMAP.md) | Active plan | Phases A–C summary + verbatim open leftovers; Phase D/E trackers; progress log. Steps 1–13 detail is in `archive/ROADMAP_HISTORY.md` |
| [`FARM_TYPES.md`](FARM_TYPES.md) | Live spec | Enterprise catalog, paddock identity, map infrastructure types |

## Codebase health

| Doc | Status | Purpose |
|-----|--------|---------|
| [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md) | Live spec | File-size limits, layering, concern/cost rules, debug + audit loop, **review posture** (CodeRabbit dismiss / flag lists). Enforced by `npm run audit:codebase`; read by CodeRabbit via `.coderabbit.yaml` |
| [`logs/CODEBASE_HEALTH_CHECK.md`](logs/CODEBASE_HEALTH_CHECK.md) | Log | Captured audit runs, newest first. Path is allow-listed in `scripts/audit-codebase.mjs` |

## Plugins & crop packs

| Doc | Status | Purpose |
|-----|--------|---------|
| [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md) | Live spec | Start here to add a crop pack: files, `plugin.json`, what Install does, **template pack (chill portions)** |
| [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md) | Live spec | Contract (D1–D15), lifecycle, packaging, acceptance checks |
| [`NETWORK_PACK_PLUGIN.md`](NETWORK_PACK_PLUGIN.md) | Live spec | Network pack contract (`kind: network`): host capability, per-farm enable with a per-device node, surfaces, *not available on this device*. Consumer: `plugins/freenet_host/` |
| [`PLUGIN_PACK_LAYOUT.md`](PLUGIN_PACK_LAYOUT.md) | Active plan | Self-contained `plugins/<id>/src/` migration — Phases 0–1 done, Phase 2 open |
| [`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md) | Live spec | Walnut blight pack settings home and parameter slices |
| [`BLIGHT_VALIDATION.md`](BLIGHT_VALIDATION.md) | Active plan | Ji model science track, parity checks, open BV items |

## Ops, auth & billing

| Doc | Status | Purpose |
|-----|--------|---------|
| [`API_KEY_SECURITY.md`](API_KEY_SECURITY.md) | Live spec | DPIRD key server-only, tile proxy, Firebase web key restrictions, BYO weather rules, Landgate terms |
| [`DEPLOY_CLOUD_RUN.md`](DEPLOY_CLOUD_RUN.md) | Live spec | Cloud Run `pufom` in `australia-southeast1`, `am.pufworks.farm` via Firebase Hosting rewrite, APK releases (CI secret), **Android dev builds** (emulator / LAN / packaged) |
| [`FIREBASE_BILLING.md`](FIREBASE_BILLING.md) | Live spec / Active plan | Who pays for a cloud farm: enrolment gate (§5.1), BYO Firebase, refuse-list, open §5 items |
| [`AUTH_INVITE_PIN.md`](AUTH_INVITE_PIN.md) | Live spec | Production auth: owner flow, worker PINs, roles vs modules, revoke |
| [`LOGIN_JOIN_SINGLE_BOX.md`](LOGIN_JOIN_SINGLE_BOX.md) | Active plan | One "Join a farm" box at `/login` classifying invite PIN / FarmCode / `PUF-` ticket. **FarmCode-first** (accepted 2026-09-11); ticket typed first is held, never merged |

## Data, sync & export

| Doc | Status | Purpose |
|-----|--------|---------|
| [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) | Live spec / Active plan | Settings → Sync, join tickets, auto-sync ladder, farm gateway, crew presence over Freenet (§5). Most-cited plan in source by `§n` — do not renumber |
| [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md) | Live spec | Every on-device store across browser, APK, Electron, LAN hub; authoritative vs cache |
| [`FARM_EXPORT_JSON_XLSX.md`](FARM_EXPORT_JSON_XLSX.md) | Live spec | `farm-export.json` and xlsx sheet shapes (v1 shipped) |
| [`DPIRD_CACHE_FRESHNESS.md`](DPIRD_CACHE_FRESHNESS.md) | Active plan | `ensure-cache` gate, dryer hourly proxy, chill season freeze — design only |

## Freenet / mist (experimental — not production)

| Doc | Status | Purpose |
|-----|--------|---------|
| [`FREENET_OPERATOR_FLOW.md`](FREENET_OPERATOR_FLOW.md) | Live spec / Active plan | Create / recover / send / join / People as the code stands; source for in-app "How this works". **§8** the seven known holes (E-07: 1, 2, 6, 7 done; 3 copy done; 4, 5 open). **§9** what is published, sealed, and never on Freenet |
| [`FREENET_NETWORK_PACK.md`](FREENET_NETWORK_PACK.md) | Active plan | The app's own Freenet client as a per-farm network pack on desktop and Android; native PUT everywhere; hybrid mirror for cloud farms; two-terminal goal. Decisions dated 2026-09-10 (E-08 umbrella) |
| [`APK_FREENET_HOST.md`](APK_FREENET_HOST.md) | Active plan | Network pack inside the APK; native PUT spike GO, phases 2–5 not built (E-08) — now Phase 3 of `FREENET_NETWORK_PACK.md` |
| [`reference/MIST_NETWORK_STORAGE.md`](reference/MIST_NETWORK_STORAGE.md) | Reference | Crypto, FarmCode, Hot/Archive contracts, frozen workshop decisions |
| [`reference/DESKTOP_FREENET_PLUGIN.md`](reference/DESKTOP_FREENET_PLUGIN.md) | Reference | Desktop installer + bundled Freenet node — phases 0–4 done, field-validated |
| [`reference/APK_FREENET_PLUGIN.md`](reference/APK_FREENET_PLUGIN.md) | Reference | Tablet reader, LAN hub, gateway, APK build wiring (§3a, §6, §7a, §8a, §8d cited from code) |
| [`reference/MIST_TWO_FEDORA_FREENET.md`](reference/MIST_TWO_FEDORA_FREENET.md) | Reference | Two-laptop Opennet smoke — PASSED 2026-08-04; § Freenet slot contract and § Short join ticket are cited from code |

## Logs

| Doc | Status | Purpose |
|-----|--------|---------|
| [`logs/AUDIT_LOG.md`](logs/AUDIT_LOG.md) | Log | `npm audit` baselines and remediation runs |
| [`logs/CODEBASE_HEALTH_CHECK.md`](logs/CODEBASE_HEALTH_CHECK.md) | Log | See Codebase health above |

## Archive

Closed or superseded docs live in [`archive/`](archive/INDEX.md) with a one-line index. They stay in the repo so history is greppable; a few are still cited from code comments by their archive path.

### Where did X go (2026-09-10)

| Was | Now | Content lives on in |
|-----|-----|---------------------|
| `Plans/MIST_TWO_LAPTOP_SMOKE.md` | [`archive/MIST_TWO_LAPTOP_SMOKE.md`](archive/MIST_TWO_LAPTOP_SMOKE.md) | `reference/MIST_TWO_FEDORA_FREENET.md` |
| `Plans/CODERABBIT_SLOP_FINDINGS.md` | [`archive/CODERABBIT_SLOP_FINDINGS.md`](archive/CODERABBIT_SLOP_FINDINGS.md) | `CODEBASE_HEALTH.md` § Review posture · `logs/CODEBASE_HEALTH_CHECK.md` |
| `Plans/CODERABBIT_SLOP_HUNT.md` | [`archive/CODERABBIT_SLOP_HUNT.md`](archive/CODERABBIT_SLOP_HUNT.md) | `CODEBASE_HEALTH.md` § Review posture (what `.coderabbit.yaml` now reads) |
| `Plans/RENAME_TO_PUFAM.md` | [`archive/RENAME_TO_PUFAM.md`](archive/RENAME_TO_PUFAM.md) | `NAMING.md` §1 · `ROADMAP.md` D-06 + rename leftovers |
| `Plans/SMOKE_TEST_LOG.md` | [`archive/SMOKE_TEST_LOG.md`](archive/SMOKE_TEST_LOG.md) | `ROADMAP.md` STEP-03 |
| `Plans/MAP_VIEWPORT_CULLING.md` | [`archive/MAP_VIEWPORT_CULLING.md`](archive/MAP_VIEWPORT_CULLING.md) | Not built; warn-only guard shipped (`src/lib/mapFeatureLoad.ts`) |
| `Plans/FREENET_HOLES.md` | [`archive/FREENET_HOLES.md`](archive/FREENET_HOLES.md) | `FREENET_OPERATOR_FLOW.md` §8 |
| `Plans/FREENET_CONTRIBUTE_AND_STORAGE.md` | [`archive/FREENET_CONTRIBUTE_AND_STORAGE.md`](archive/FREENET_CONTRIBUTE_AND_STORAGE.md) | `FREENET_OPERATOR_FLOW.md` §9 · `LOCAL_DATA_STORAGE.md` |
| `Plans/CHILL_PORTIONS_PLUGIN.md` | [`archive/CHILL_PORTIONS_PLUGIN.md`](archive/CHILL_PORTIONS_PLUGIN.md) | `PLUGIN_AUTHORING.md` § Template pack — chill portions |
| `Plans/OFFLINE_MAP_APK.md` | [`archive/OFFLINE_MAP_APK.md`](archive/OFFLINE_MAP_APK.md) | `DEPLOY_CLOUD_RUN.md` § Android dev builds + § Android APK releases · `ROADMAP.md` § Out of scope |
| `Plans/CREW_PRESENCE.md` | [`archive/CREW_PRESENCE.md`](archive/CREW_PRESENCE.md) | `ROADMAP.md` D-07 (P3 open) · `SETTINGS_SYNC_AND_CREW.md` §5 (P2b) |
| `Plans/MAP_OVERLAYS.md` | [`archive/MAP_OVERLAYS.md`](archive/MAP_OVERLAYS.md) | `ROADMAP.md` D-08 · `CODEBASE_HEALTH.md` § CPU / memory (500 ms rule) |
| `Plans/ROADMAP.md` Steps 1–13 detail | [`archive/ROADMAP_HISTORY.md`](archive/ROADMAP_HISTORY.md) | `ROADMAP.md` § Phases A–C summary + § Open leftovers |
| `Plans/DESKTOP_FREENET_PLUGIN.md`, `APK_FREENET_PLUGIN.md`, `MIST_NETWORK_STORAGE.md`, `MIST_TWO_FEDORA_FREENET.md` | `reference/` (same names, content unchanged) | — |
| `Plans/AUDIT_LOG.md`, `CODEBASE_HEALTH_CHECK.md` | `logs/` (same names) | — |

## Folder convention

`Plans/` top level holds what an agent or operator needs to **act on** today: live specs, active plans, the roadmap. `Plans/reference/` holds finished designs that source comments cite by `§` number — content frozen, only link paths change. `Plans/logs/` holds append-only records that `scripts/audit-codebase.mjs` allow-lists. `Plans/archive/` holds closed work, each with a banner and a line in [`archive/INDEX.md`](archive/INDEX.md). Moving any doc means `rg` for its filename across code, scripts, config and CI first, and updating those citations in the same change (`git mv` keeps history). Full rules, header block, filename and cross-link procedure: [`NAMING.md`](NAMING.md) §9.
