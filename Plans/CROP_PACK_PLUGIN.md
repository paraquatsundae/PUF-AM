# Crop-pack plugin system — design

**Product:** PUF-AM — Ag Manager  
**Status:** Active — CP-00–CP-05 done (contract through developer PR checklist); first consumer walnut blight ([`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md))  
**Date:** 2026-08-11  
**Companion:** [`FARM_TYPES.md`](FARM_TYPES.md) · [`NAMING.md`](NAMING.md) · Freenet is a **network pack** ([`APK_FREENET_HOST.md`](APK_FREENET_HOST.md), [`DESKTOP_FREENET_PLUGIN.md`](DESKTOP_FREENET_PLUGIN.md)) — a **different** word. Do not conflate.

---

## Goals

1. **Developer contract** — a pack author knows exactly what to ship so the pack works with nav, auth, storage, invites, and Farm Setup.
2. **Farm-admin lifecycle** — install, activate, deactivate, and delete a pack from one clear UI (admin only), without editing code or Firestore by hand.
3. **Walnut blight as reference** — migrate today’s auto walnut↔blight sync onto this lifecycle without surprising existing farms.

---

## Name — two “plugins”

| Term | Means | Not |
|------|--------|-----|
| **Crop pack** / **pack plugin** | Optional enterprise capability: modules, routes, pack settings UI, optional engine | Freenet / Capacitor / npm “plugin” |
| **Freenet host plugin** | In-app Freenet lifecycle unit (`puf-freenet-host`) | Crop packs |

UI copy: pack product name (“Walnut blight”). Docs: “crop-pack plugin” for the seam.

---

## Mental model

```
App catalog (code shipped in PUF-AM)
        │
        ▼  Install          (admin adds pack to this farm)
Farm: installed
        │
        ▼  Activate         (pack on — modules/nav/settings live)
Farm: active
        │
        ▼  Deactivate       (pack off — data kept, UI/modules hidden)
Farm: installed + inactive
        │
        ▼  Delete           (remove from farm — settings wiped, modules gone)
Back to catalog-only (not on this farm)
```

| State | On farm? | Modules offered | Pack UI / knobs | Pack settings doc |
|-------|----------|-----------------|-----------------|-------------------|
| Not installed | No | No | No | Absent / ignored |
| Installed + **active** | Yes | Yes (admin may still toggle individual modules) | Yes | Read/write |
| Installed + **inactive** | Yes | No | No (or “pack off” stub) | Kept |
| Deleted | No | No | No | Removed (or tombstoned then deleted) |

**Eligibility** (e.g. “farm has walnuts”) is a **hint / soft gate for Install**, not a silent auto-on. Admin can still deactivate a pack while walnuts remain on the map.

---

## Farm-admin UX

**Home:** **Settings → Plugins** (grouped by category). Farm Setup shows a short pointer; **Farm management → Modules** stays for fine-grained module toggles.

Admin-only Install / Activate / Deactivate / Delete for crop packs. Freenet appears in the same Plugins list under **Network & storage** (status + link to Sync — not crop-pack lifecycle).

Admin-only. One row per catalog pack:

| Control | Action |
|---------|--------|
| **Install** | Add pack to `farms/{id}.cropPacks[packId]`; leave **inactive** until Activate (or Install+Activate in one step — product default: **Install activates**) |
| **Activate** | `status: active`; merge pack modules into farm `enabledModules`; show nav/routes |
| **Deactivate** | `status: inactive`; strip pack modules from catalog; hide pack UI; **keep** settings + any pack-owned data |
| **Delete** | Confirm dialog (“Removes pack settings for this farm. Cannot undo.”); strip modules; delete `settings/<packDoc>`; remove pack entry from farm |

Copy rules:

- Show eligibility hint when Install is discouraged (“No walnut areas yet — pack won’t have orchard data”) but do not hard-block unless `requiresEligibility: true` on the def.
- Never imply Delete removes diary/map history that isn’t pack-owned.
- Invite PIN presets still limit who *sees* modules after Activate; packs do not bypass grants.

**Default for v1 Install:** Install = active immediately (one button). Deactivate / Delete remain separate. Two-step Install→Activate is optional later if we need staged setup wizards.

### Categories (required)

Every catalog entry **must** set `category` (`shared/farm/pluginCategories.ts`):

| Id | Label | Use for |
|----|-------|---------|
| `crop` | Crop tools | Enterprise packs (walnut blight, future apple / citrus) |
| `network` | Network & storage | Freenet and related hosts |
| `generic` | General | **Catch-all** — authors who do not have a better fit still pick this; do not omit |

Settings → Plugins groups rows by these categories. Omitting `category` is a contract failure (TypeScript requires it on `CropPackDef`).

---

## Persistence

```ts
// on farms/{farmId} (proposed)
cropPacks?: {
  [packId: string]: {
    status: 'active' | 'inactive';
    installedAt: string; // ISO
    activatedAt?: string;
  };
};
```

- Pack settings: `farms/{id}/settings/<settingsDocId>` (per pack def).
- Module catalog: still `farms/{id}.enabledModules` — lifecycle helpers add/remove the pack’s module list; they do not invent a second nav system.
- Legacy walnut: if `cropPacks.walnut_blight` missing, derive initial state once from `farmHasWalnutPack` + whether `blight` is in `enabledModules` (migration in CP-01).

---

## Packaging (zip → `plugins/`)

v1 distribution unit for third-party / side-loaded packs:

| Item | Value |
|------|--------|
| Drop folder | repo (or app) **`plugins/`** |
| Archive | **`{packId}.zip`** |
| Manifest | **`plugin.json`** at zip root (or `{packId}/plugin.json` in a single top-level folder) |
| Schema | `shared/farm/plugin.manifest.v1.schema.json` · types `shared/farm/pluginPackage.ts` |
| Skeleton | `plugins/_skeleton/` |

```
plugin.json     # required (schemaVersion 1, kind, id, version, label, blurb, category, modules, settingsDocId)
engine.json     # optional — first-party blight defaults (`plugins/walnut_blight/`)
README.md       # optional
LICENSE         # optional
assets/         # optional
```

**`category` is required** on every package (`crop` | `network` | `generic`).

**Reference package:** [`plugins/walnut_blight/`](../plugins/walnut_blight/) — catalog + blight engine defaults. `shared/farm/cropPacks.ts` and `src/lib/modelParameters.ts` read that folder; they do not duplicate the numbers. React / Ji code still ships in the app.

```bash
npm run plugins:verify -- plugins/walnut_blight
npm run plugins:pack -- plugins/walnut_blight     # → plugins/walnut_blight.zip (gitignored)
npm run plugins:unpack -- path/to/apple_scab.zip   # → plugins/apple_scab/
npm run plugins:list
```

Workshop hub lists unpacked packages at `GET /api/plugins/packages`.

**Still in-app for React UI:** UI under `src/packs/<id>/` so Install activates real routes. Catalog metadata and (for walnut blight) engine defaults live in `plugins/<id>/`. Hot-loading arbitrary React from a zip is out of scope for v1.

---

## Developer contract — requirements for a pack to work

A pack is **not loaded** until it is registered in the app catalog. For v1, registration = in-repo entry in `shared/farm/cropPacks.ts` + UI/engine code shipped with PUF-AM. No hot-load of untrusted bundles.

### Must ship (hard requirements)

| # | Requirement | Why the system needs it |
|---|-------------|-------------------------|
| D1 | Stable **`CropPackId`** + human **label** / **blurb** + **`category`** (`crop` \| `network` \| `generic`) | Catalog row + Settings → Plugins grouping; authors must pick a category (`generic` if unsure) |
| D2 | **`modules: FarmModuleId[]`** owned by this pack | Activate/Deactivate can sync nav |
| D3 | **`settingsDocId`** (`string \| null`) | Delete knows what to wipe; Deploy knows where to write |
| D4 | **Primary route(s)** registered in the pack route table, wrapped in `ModuleRoute` | Nav only appears when module + pack active |
| D5 | **Pack surface** for production knobs (not Settings → Advanced) | Admin finds controls next to the tool |
| D6 | **Lifecycle hooks** (may be no-ops): `onInstall`, `onActivate`, `onDeactivate`, `onDelete` | System calls these so packs can seed defaults / clean up |
| D7 | **Firestore rules** for any pack settings fields (`isValid…`) | Client writes stay legal |
| D8 | **Tests**: catalog entry, activate adds modules, deactivate strips them, delete removes settings doc | Regressions break every pack |

### Should ship (strongly expected)

| # | Requirement | Notes |
|---|-------------|-------|
| D9 | Honesty / science panel on the pack page | About = one app-level pointer only |
| D10 | Merge-save helpers if sharing a doc (legacy) | Prefer dedicated settings doc for new packs |
| D11 | `canInstall(ctx)` eligibility | Soft hint in admin UI; optional hard block |
| D12 | Plan file under `Plans/` with slices | Same discipline as blight BE-* |

### May ship (optional)

| # | Requirement | Notes |
|---|-------------|-------|
| D13 | Engine under `shared/` + CF mirror + parity test | Only if Dashboard aggregates |
| D14 | Research / sandbox subsection | Must not affect production path without an explicit label |
| D15 | Seed defaults in `onInstall` / `onActivate` | e.g. write default settings doc |

### Must not

- Write farm-wide Settings dump for pack knobs  
- Auto-enable always-on modules (`dashboard`, `farm_setup`, …)  
- Bypass invite / role checks  
- Delete non-pack diary or map data in `onDelete`  
- Call itself a Freenet plugin in UI copy  

### Acceptance — “works with the rest of the system”

A pack passes when, on a farm with an admin:

1. **Install (+ activate)** → pack modules appear in Farm Modules; primary route reachable for members who have the module grant.  
2. **Deactivate** → routes/nav gone; settings doc still present; reactivation restores without re-entering knobs.  
3. **Delete** → settings doc gone; modules gone; reinstall starts clean (defaults).  
4. Invited viewer/farmer still constrained by PIN modules ∩ farm catalog.  
5. Farm without the pack installed never sees pack UI (even if eligibility would be true).

---

## Catalog API (proposed)

```ts
// shared/farm/cropPacks.ts

export type CropPackId = 'walnut_blight' /* | next… */;

export type CropPackLifecycleCtx = {
  farmId: string;
  profile: FarmProfile;
  blocks: BlockLike[];
};

export type CropPackDef = {
  id: CropPackId;
  label: string;
  blurb: string;
  /** Required — Settings → Plugins grouping. Use `generic` if unsure. */
  category: 'crop' | 'network' | 'generic';
  modules: FarmModuleId[];
  settingsDocId: string | null;
  /** Soft/hard eligibility for Install button. */
  canInstall?: (ctx: CropPackLifecycleCtx) => { ok: boolean; hint?: string; hard?: boolean };
  onInstall?: (ctx: CropPackLifecycleCtx) => Promise<void>;
  onActivate?: (ctx: CropPackLifecycleCtx) => Promise<void>;
  onDeactivate?: (ctx: CropPackLifecycleCtx) => Promise<void>;
  onDelete?: (ctx: CropPackLifecycleCtx) => Promise<void>;
};

/** System helpers used by Settings → Plugins UI */
export function installPack(farmId, packId): Promise<void>;
export function activatePack(farmId, packId): Promise<void>;
export function deactivatePack(farmId, packId): Promise<void>;
export function deletePack(farmId, packId): Promise<void>;
export function isPackActive(farm, packId): boolean;
```

Route/panel registry (CP-04): each pack exports `{ path, Page, moduleId }` + nav + named surfaces in `src/packs/<id>/`; `App` and `navConfig` read `src/packs/registry.ts`.

---

## Reference: walnut blight today → target

| Concern | Today | Target |
|---------|--------|--------|
| Install | Implicit via walnut species / profile | Admin Install (migrate: auto-install+activate once if `farmHasWalnutPack`) |
| Activate / Deactivate | Tied to Farm Setup walnut sync | Explicit Activate / Deactivate; eligibility is hint only |
| Delete | None | Delete clears `settings/model_params` blight slices or dedicated blight doc (after BE-06 prefer dedicated doc) |
| Modules | `withWalnutPackModules` on Farm Setup save | Lifecycle helpers only |
| Surface | `/blight` | Unchanged ownership |

**Shipped (CP-01):** walnut farms migrate once onto Install+Activate; Farm Setup no longer auto-toggles blight modules.

---

## Module & invite interaction

- Packs **offer** modules on Activate; they do not grant users those modules.  
- Deactivate / Delete remove pack modules from `enabledModules`.  
- Member access = grant ∩ farm catalog (unchanged).  
- Always-on modules are never pack-owned.

---

## UI / settings rules (mandatory)

1. Production knobs live on the pack surface, not Settings → Advanced.  
2. Settings shell stays farm-wide (account, crew, economics, Freenet).  
3. Merge-save by slice if sharing a doc; new packs get their own settings doc.  
4. Admin write ceiling unchanged.  
5. Settings → Plugins is the lifecycle UI (Install / Activate / Deactivate / Delete, grouped by category). Farm Setup `CropPacksCard` is a teaser that links there. Farm Modules remains the fine-grained module list.

---

## Storage conventions

| Pattern | When |
|---------|------|
| `farms/{id}.cropPacks` | Install / active / inactive state |
| `settings/<packId>` | New packs with farm-level knobs |
| Typed slice + pick helpers | Legacy blight `model_params` until BE-06 |
| Block / diary only | Packs with no farm-wide knobs |

`onDelete` must only remove pack-owned settings (and pack-declared subcollections if any). Document the wipe list on the pack def.

---

## Contributor checklist

**PR template (use when opening the PR):** [`.github/PULL_REQUEST_TEMPLATE/crop-pack.md`](../.github/PULL_REQUEST_TEMPLATE/crop-pack.md)

**Onboarding links:** [`README.md` → Adding a crop pack](../README.md#adding-a-crop-pack) · [`NAMING.md`](NAMING.md) §1 (crop pack ≠ Freenet) · [`DEVELOPER_NOTES.md`](../DEVELOPER_NOTES.md) §0

- [ ] `CropPackDef` registered in `shared/farm/cropPacks.ts` (D1–D3, D6)  
- [ ] Modules + labels/blurbs  
- [ ] `src/packs/<id>/index.ts` UI registration + entry in `PACK_UI_REGISTRY` (routes, nav, surfaces)  
- [ ] Pack surface + production knobs (D5)  
- [ ] Rules + tests (D7–D8)  
- [ ] Honesty panel (D9)  
- [ ] `canInstall` hint if enterprise-specific (D11)  
- [ ] Plan slices (D12)  
- [ ] Manual: Install → use → Deactivate → Activate → Delete on a test farm  

**Out of band:** separate npm package / Freenet-published pack code.

---

## Build slices

| ID | Slice | Status | Notes |
|----|-------|--------|-------|
| `CP-00` | **This plan** (contract + admin lifecycle) | `done` | Design only |
| `CP-01` | `cropPacks.ts` + lifecycle helpers; walnut adapter; legacy one-time migrate from `farmHasWalnutPack` | `done` | 2026-08-11 — `shared/farm/cropPacks.ts` + `src/lib/cropPackLifecycle.ts`; Farm Setup no longer auto-toggles blight |
| `CP-02` | Settings → **Plugins** (categories + Install lifecycle); Farm Setup pointer | `done` | 2026-08-12 — `PluginsPanel`; Farm Setup teaser; was Farm Setup Crop packs card |
| `CP-03` | Farm Modules card labels “from \<pack\>”; disable pack modules when pack inactive | `done` | 2026-08-11 — “From crop packs” section with From \<label\> badge; inactive rows disabled; ops vs pack split via `optionalOpsModules` / `installedPackModuleRows` |
| `CP-04` | Pack route/panel registry convention (`src/packs/<id>/` optional move) | `done` | 2026-08-11 — `src/packs/registry.ts` + `walnut_blight` UI reg; App routes + nav merge from registry; panels re-exported (files stay in `components/blight`) |
| `CP-05` | Developer requirements doc link (README / NAMING) + PR checklist | `done` | 2026-08-11 — README “Adding a crop pack”; NAMING crop-pack terms; `.github/PULL_REQUEST_TEMPLATE/crop-pack.md`; DEVELOPER_NOTES pointer |

---

## Non-goals

- Hot-loading untrusted pack code / app-store install of binaries  
- Renaming Freenet “plugin” units  
- Moving Market & Economics into a crop pack  
- Replacing `FarmModuleId` with pack ids (modules remain the nav atom)  
- Auto-deleting diary events when a pack is deleted  

---

## Risks

| Risk | Mitigation |
|------|------------|
| Existing walnut farms lose blight | CP-01 migrates: walnut gate true → install+activate once |
| Admin deletes pack expecting diary wipe | Confirm copy lists only settings doc; never diary/map |
| Activate without eligibility | Soft hint; optional `hard` on `canInstall` |
| Naming clash with Freenet | This doc + NAMING; UI says pack names |

---

## Progress log

| Date | Slice | Notes |
|------|-------|-------|
| 2026-08-13 | Zip | First-party `plugins/walnut_blight/` is catalog + engine defaults source; `npm run plugins:pack` |
| 2026-08-12 | CP-02 | Settings → Plugins (categories); Farm Setup teaser; was Farm Setup Crop packs card |
| 2026-08-11 | CP-05 | Developer onboarding: README section, NAMING terms, GitHub crop-pack PR template, DEVELOPER_NOTES link |
| 2026-08-11 | CP-04 | Pack UI registry: routes/nav/surfaces; walnut blight registered; App + navConfig consume registry |
| 2026-08-11 | CP-03 | Farm Modules: ops vs pack sections; “From Walnut blight” badge; inactive pack modules disabled; clamp on save |
| 2026-08-11 | CP-01/02 | Catalog + pure plans; client lifecycle I/O; Auth `farmCropPacks`; Farm Setup Crop packs card; legacy walnut migrate; Delete strips blight keys only on `model_params` |
| 2026-08-11 | CP-00 | Refined: developer hard/soft requirements + farm-admin Install / Activate / Deactivate / Delete lifecycle |
| 2026-08-11 | CP-00 | First draft after BE-05; walnut blight as reference consumer |
