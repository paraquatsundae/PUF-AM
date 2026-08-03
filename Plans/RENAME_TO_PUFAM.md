# Rename: PUFOM → PUFAM (Ag Manager)

**Naming authority:** [`NAMING.md`](NAMING.md) — full glossary, storage keys, and legacy vs preferred rules. This file is the **Phase A/B rebrand checklist** only.

**Public brand:** **PUFAM** / **PUF-AM** = **PUF** + **AM** (Ag Manager)  
**Former:** PUFOM = PUF + OM (Orchard Manager)

## Phase A — done / in progress (user-facing)

- [x] `src/brand.ts` constants
- [x] App shell (Layout, Login), About / legal copy
- [x] Capacitor `appName`, Android `strings.xml`, `index.html` title
- [x] README + SITE_SYNOPSIS
- [x] PUFworks-site module card + showcase page copy / `/pufam/` route
- [x] Plans headers (ROADMAP, AUTH, OFFLINE, DEPLOY, BLIGHT) + crop-pack About/Settings copy (2026-07-27)
- [ ] GitHub repo **display name / description** (and optional rename `Walnut_farm_manager` → later)
- [ ] Redeploy Cloud Run + site after merge

## Phase B — deferred (breaks sync / infra if rushed)

| Item | Current | Notes |
|------|---------|--------|
| Cloud Run service / URL | `pufom-…a.run.app` | Keep until DNS/cutover planned |
| Bundle magic / extension | `PUFOM1` / `.pufom` | Accept both PUFAM + PUFOM in a later codec rev |
| mDNS type | `_pufom-sync._tcp` | Dual-advertise when renaming |
| npm package name | `walnut-farm-manager` | Optional |
| Android `applicationId` | `com.sentinut.farm` | Do **not** change (Play / sideload continuity) |
| Asset paths on site | `/assets/pufom/`, `/downloads/pufom/` | Alias `/pufam/` downloads when APK renamed |

## Brand rules

- UI / docs / marketing: **PUFAM** · **Ag Manager**
- Mixed enterprises (orchard, broadacre, grazing, aqua) — not walnut-only wording in hero copy
- Code identifiers may stay `pufom*` until Phase B
