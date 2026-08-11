# Crop-pack plugin system — design

**Product:** PUF-AM — Ag Manager  
**Status:** Design — first consumer is walnut blight ([`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md))  
**Date:** 2026-08-11  
**Companion:** [`FARM_TYPES.md`](FARM_TYPES.md) · [`NAMING.md`](NAMING.md) · Freenet host plugins ([`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md), [`APK_FREENET_PLUGIN.md`](APK_FREENET_PLUGIN.md)) are a **different** word — do not conflate

---

## Problem

Walnut blight is the first **crop pack**: gate (`farmHasWalnutPack`), module id (`blight`), route, settings surface, science copy, and a typed settings doc slice. The next packs (almond phenology, vineyard spray calendar, marron water quality, broadacre season packs, …) must not each invent a one-off gate + Settings dump + About park note.

Developers (in-house or later external) need a **repeatable seam**: what a pack owns, how it mounts UI, where knobs live, how modules turn on, and what they must never touch.

---

## Name — two “plugins”

| Term | Means | Not |
|------|--------|-----|
| **Crop pack** / **pack plugin** | Optional enterprise capability: modules, routes, pack settings UI, optional engine | Freenet / Capacitor / npm “plugin” |
| **Freenet host plugin** | In-app Freenet lifecycle unit (`puf-freenet-host`) | Crop packs |

UI copy should say the pack name (“Walnut blight”, “Season pack”). Docs may say “crop-pack plugin” for the seam. Do not invent a second product mark.

---

## What a crop pack is

A pack is a **declared capability** bound to farm profile / paddock identity, not a remote code load.

| Piece | Contract |
|-------|----------|
| **Pack id** | Stable string, e.g. `walnut_blight`, `season_rotation` (catalog below) |
| **Gate** | Pure function of `FarmProfile` + blocks (pattern: `farmHasWalnutPack`) |
| **Modules** | Zero or more `FarmModuleId`s auto-offered when the gate is true (`WALNUT_PACK_MODULES` today) |
| **Routes / nav** | Module-gated pages only; no pack UI when module off |
| **Settings surface** | Pack-owned panel(s) next to the pack’s primary page — **not** Settings → Advanced |
| **Storage** | Prefer `farms/{id}/settings/<packDoc>` or a typed slice of a shared doc; document field ownership |
| **Science / honesty** | Pack-owned copy on the pack surface; About keeps app-level pointer only |
| **Engine** | Optional shared math module under `shared/` + CF mirror when Dashboard aggregates |

**Not in scope for v1 of this seam:** dynamic `import()` of third-party bundles, marketplace install, Freenet-distributed pack code, or Capacitor native modules.

---

## Reference shape (walnut blight)

| Concern | Walnut blight today |
|---------|---------------------|
| Pack id | Implicit `walnut` → modules `['blight']` |
| Gate | `farmHasWalnutPack` in `shared/farm/farmTypes.ts` |
| Module sync | Farm setup → `withWalnutPackModules` / `withoutWalnutPackModules` |
| Surface | `/blight` — inoculum, science, Sandbox research |
| Settings left behind | Economics only under Settings |
| Params | `src/lib/modelParameters.ts` slices; doc `settings/model_params` |
| Engine | Ji in `shared/weather/jiBlightModel.ts`; Sandbox in `src/lib/blightModel.ts` |

New packs should copy this **layout**, not the blight field names.

---

## Proposed catalog API

Centralize what is today scattered across `farmModules.ts` + `farmTypes.ts` + Farm Setup.

```ts
// shared/farm/cropPacks.ts (proposed)

export type CropPackId = 'walnut_blight' /* | 'almond_…' | … */;

export type CropPackDef = {
  id: CropPackId;
  label: string;
  blurb: string;
  /** Modules offered when the pack gate is true. */
  modules: FarmModuleId[];
  /** Pure gate — no I/O. */
  isActive: (ctx: { profile: FarmProfile; blocks: BlockLike[] }) => boolean;
  /**
   * Firestore settings doc id under farms/{id}/settings/, or null if the pack
   * only uses existing farm/block fields.
   */
  settingsDocId: string | null;
};
```

**Migration path**

1. **CP-00** — This plan.  
2. **CP-01** — Add `cropPacks.ts` with `walnut_blight` wrapping existing `farmHasWalnutPack` + `WALNUT_PACK_MODULES`; Farm Setup calls `syncPackModules(profile, blocks, modules)` instead of walnut-only helpers. Behaviour-identical.  
3. **CP-02** — Pack registry consumed by Farm Modules card (show “from walnut pack” vs optional ops modules).  
4. **CP-03** — Soft convention: each pack ships `src/packs/<id>/` (or `src/components/<pack>/`) with `SettingsPanel`, `SciencePanel`, routes registered in one table. Walnut moves under that folder only when cheap.  
5. **CP-04** — Document external contributor checklist (below); still in-repo PRs only.

No BE-06-style doc split required before CP-01.

---

## UI / settings rules (mandatory)

1. **One job per pack surface** — primary page owns production knobs; research/sandbox collapsed or tabbed; honesty copy on the same page.  
2. **Settings shell stays farm-wide** — account, crew, economics, Freenet, discovery. Crop engines do not grow Advanced again.  
3. **Merge-save by slice** — if multiple packs share a doc (legacy `model_params`), each Deploy writes only its keys (see `pickResearchModelParams` / economics picks). Prefer a dedicated `settings/<pack>` doc for new packs.  
4. **Admin write ceiling unchanged** — pack panels use existing role checks.  
5. **No hero clutter** — pack pages follow existing app chrome; do not invent a second design language.

---

## Module & invite interaction

- Packs **offer** modules; they do not bypass invite PIN presets.  
- Turning a pack off (gate false) removes pack modules from the farm catalog (`without*PackModules` pattern).  
- Member grants still intersect `farmEnabledModules` — a pack module missing from the farm catalog stays hidden even if the grant lists it.  
- Always-on modules (`dashboard`, `farm_setup`, …) are never pack-owned.

---

## Storage conventions

| Pattern | When |
|---------|------|
| `settings/<packId>` | New packs with farm-level knobs |
| Typed slice of shared doc + pick helpers | Legacy / economics coexistence (blight today) |
| Block / diary fields only | Packs that need no farm-wide knobs |
| CF mirror of shared math | Any pack that Dashboard aggregates |

Rules: each pack documents `isValid…` fields in `firestore.rules`. Empty allowlists / secrets stay out of pack code.

---

## Contributor checklist (other developers)

To add a pack in-repo:

1. Add `CropPackDef` (gate + modules + settings doc id).  
2. Add or reuse `FarmModuleId`s + labels/blurbs.  
3. Route + `ModuleRoute` + nav entry.  
4. Pack surface component(s); production knobs on that surface.  
5. Optional `shared/` engine + CF parity test if aggregates exist.  
6. Honesty / science panel on the pack page; About = one pointer.  
7. Plan file under `Plans/` with slices (`XX-00` …).  
8. Farm Setup sync via shared `syncPackModules` (after CP-01).  
9. Tests: gate true/false, module sync, pick/merge writes, engine golden if any.

**Out of band until explicitly opened:** shipping a pack as a separate npm package or Freenet-published bundle.

---

## Build slices (system)

| ID | Slice | Status | Notes |
|----|-------|--------|-------|
| `CP-00` | **This plan** | `done` | Design only |
| `CP-01` | `shared/farm/cropPacks.ts` + walnut adapter; Farm Setup uses generic sync | `todo` | No UX change |
| `CP-02` | Farm Modules card labels pack-sourced modules | `todo` | |
| `CP-03` | Pack folder convention + registry for routes/panels | `todo` | Move walnut only if low-risk |
| `CP-04` | External-contributor doc link from README / NAMING | `todo` | Still PR-based |

---

## Non-goals

- Hot-loading untrusted pack code  
- Renaming Freenet “plugin” units  
- Moving Market & Economics into a crop pack  
- Replacing `FarmModuleId` with pack ids (modules remain the nav atom)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Everything becomes a “pack” | Packs require a gate + optional modules; ops modules stay optional without a pack |
| Shared `model_params` collisions | New packs get own settings docs; blight keeps picks until BE-06 |
| Naming clash with Freenet | This doc + NAMING cross-link; UI says pack product names |

---

## Progress log

| Date | Slice | Notes |
|------|-------|-------|
| 2026-08-11 | CP-00 | Drafted after BE-05 type unify; walnut blight is the reference consumer |
