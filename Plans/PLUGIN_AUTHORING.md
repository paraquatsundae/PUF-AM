# Crop pack authoring

**Product:** PUF-AM — Ag Manager  
**Status:** Active — how-to for adding a crop pack  
**Date:** 2026-08-23  
**Contract / history:** [`CROP_PACK_PLUGIN.md`](CROP_PACK_PLUGIN.md)  
**Limits / debug / audit:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)  
**Not this:** Freenet / network pack ([`NAMING.md`](NAMING.md) §1)

Start here when adding a pack. The contract file is the why and the acceptance bar. This file is the file list.

---

## What a pack is (v1)

A crop pack is **in-app code** plus a **disk package** the catalog reads. Unpacking a zip does **not** register a pack. Settings → Plugins only lists ids in `shared/farm/cropPacks.ts`.

| Layer | Lives in | Job |
|-------|----------|-----|
| Disk package | `plugins/<id>/` | `plugin.json` catalog row; optional `engine.json` numbers |
| TS adapter | `shared/farm/<id>Package.ts` | Parse the package; export id, modules, path, owned keys |
| Catalog | `shared/farm/cropPacks.ts` | Install / Activate / Deactivate / Delete; `canInstall` hint |
| Module id | `shared/auth/farmModules.ts` | Nav atom. Packs **offer** modules; they do not grant users |
| UI | `src/packs/<id>/` + `registry.ts` | Routes, nav, pack surfaces. App already maps `allPackRoutes()` |
| Settings | `farms/{id}/settings/<settingsDocId>` | Farm knobs. Delete wipes this doc (or listed keys only) |
| Rules | `firestore.rules` | `isValid…` for that settings doc |

**Copy [`plugins/chill_portions/`](../plugins/chill_portions/) + [`src/packs/chill_portions/`](../src/packs/chill_portions/)** for an engine pack, or [`plugins/water/`](../plugins/water/) for a thin ops pack (no `engine.json`).  
Do **not** copy walnut blight as the template — it still shares `settings/model_params` with farm economics.

[`plugins/_skeleton/`](../plugins/_skeleton/) is `plugin.json` only. It does not wire the app.

---

## File checklist

Replace `<id>` with a snake_case pack id (`apple_scab`). Module id can match the pack (`chill`) or be shorter (`blight`) — pick one and use it everywhere.

### 1. Disk package

| File | Required | Notes |
|------|----------|--------|
| `plugins/<id>/plugin.json` | Yes | Schema: `shared/farm/plugin.manifest.v1.schema.json` |
| `plugins/<id>/engine.json` | If the pack has numbers | Constants / defaults only. No React |
| `plugins/<id>/README.md` | Should | What the folder owns vs what stays in the app |

```json
{
  "schemaVersion": 1,
  "kind": "crop_pack",
  "id": "<id>",
  "version": "0.1.0",
  "label": "Human name",
  "blurb": "One sentence for Settings → Plugins.",
  "category": "crop",
  "modules": ["<moduleId>"],
  "settingsDocId": "<id>",
  "settingsOwnedKeys": ["knobA", "knobB"],
  "primaryPath": "/<route>",
  "author": "PUF-AM",
  "license": "MIT"
}
```

- `category`: `crop` \| `network` \| `generic`. Use `generic` if unsure. Do **not** use `network` — that row is Freenet. Category is Settings → Plugins grouping only — shell menu is `navItems.groupId` ([`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md)).
- `settingsDocId`: dedicated doc id for new packs (`<id>`). Use `null` if there are no farm knobs.
- `settingsOwnedKeys`: list every field Delete may wipe. Required when sharing a doc (legacy blight only).
- `modules`: must already exist on `FARM_MODULE_IDS` after step 3, or the adapter must fail closed.

```bash
npm run plugins:verify                 # all first-party folders (health gate)
npm run plugins:verify -- plugins/<id>
```

### 2. TS adapter

New file `shared/farm/<id>Package.ts` — copy `chillPortionsPackage.ts` and strip chill-only types.

Must export:

- `<ID>_PACK_ID` (same string as `plugin.json` `id`)
- `<ID>_PRIMARY_PATH`
- `<ID>_SETTINGS_OWNED_KEYS` (empty array if `settingsDocId` is null)
- `*Manifest`, `*Modules`
- Fail if `plugin.json` id / kind / modules / owned keys disagree with the adapter

`cropPacks.ts` **reads** this adapter. Do not re-type label, blurb, or module lists by hand.

### 3. Module id

In `shared/auth/farmModules.ts`:

1. Add the id to `FARM_MODULE_IDS`
2. Add `MODULE_LABELS` and `MODULE_BLURBS`
3. If field workers should see it, add it to `WORK_MODULES` and (if it is a scout tool) `CROP_SCOUT_MODULES`

Do **not** add a new `FOO_PACK_MODULES` array. Ownership is `CropPackDef.modules`. `defaultModulesWithoutCropPacks()` and PIN exclude (`packModulesToExclude`) read that list.

Never put a pack module in `ALWAYS_ON_MODULES`.

### 4. Catalog

In `shared/farm/cropPacks.ts`:

1. Import the adapter
2. Append the id to `CROP_PACK_IDS`
3. Append one `CropPackDef` to `CROP_PACKS`

```ts
{
  id: FOO_PACK_ID,
  label: fooManifest.label,
  blurb: fooManifest.blurb,
  category: fooManifest.category,
  modules: fooModules,
  settingsDocId: fooManifest.settingsDocId,
  settingsOwnedKeys: FOO_SETTINGS_OWNED_KEYS,
  primaryPath: FOO_PRIMARY_PATH,
  canInstall: (ctx) => {
    // Soft hint only. Return { ok: true } even when the farm has no matching crop.
    // Set hard: true only when Install must stay disabled.
  },
}
```

No `onInstall` / `onActivate` / `onDelete` hooks. Delete already wipes `settingsDocId` (whole doc, or `settingsOwnedKeys` if set). Seed defaults on first read of the pack page.

Do **not** add `migrateLegacy…` unless you are extracting a feature that already shipped in core.

### 5. UI

| File | Job |
|------|-----|
| `src/packs/<id>/index.ts` | `CropPackUiRegistration`: routes, nav, surfaces |
| `src/packs/registry.ts` | Append to `PACK_UI_REGISTRY` |
| `src/pages/…` or `src/components/<id>/` | The page + knobs |

Route `path` is the segment (`weather-events`), not `/weather-events`. `href` / `primaryPath` keep the leading slash.

`App.tsx` already mounts `allPackRoutes()` inside `ModuleRoute`. Do not add a one-off route.

Surfaces — only set what you use:

| Key | When |
|-----|------|
| `productionSettings` | Farm knobs (required if the pack has knobs) |
| `science` | Honesty / model copy on the pack page |
| `researchSettings` | Sandbox only — must not write the production path |
| `engineSettings` | Optional advanced block on the pack page, not Settings → Advanced |

Gate the page with `isPackActive(farmCropPacks, '<id>')` from `useAuth()`.  
Do **not** add `useFooPack()` with a species / profile fallback. Those hooks exist only for walnut / chill farms that have not migrated yet.

Do **not** special-case the module in `ModuleRoute` or `useOfferedFarmModules`. Those files still hard-code blight / chill for the migration window. A new pack appears once Install writes `cropPacks` + `enabledModules`.

### 6. Firestore

New dedicated settings doc:

1. `isValidFooSettings` — allow-list of `settingsOwnedKeys`, types/ranges
2. `match /settings/<settingsDocId>` — member read; admin create/update/delete; call the validator

If `settingsDocId` is null, skip this step.

Client writes stay illegal until the rule exists. There is no generic “any pack settings” match — that would be bloat and a hole.

### 7. Tests

Minimum:

- Adapter: manifest id, modules, owned keys, path
- `cropPacks`: Install adds modules; Deactivate strips them; Delete drops the farm entry
- `packRegistry`: new routes/nav are in `PACK_UI_REGISTRY`

Manual on a test farm: Install → use → Deactivate (settings kept, nav gone) → Activate (knobs still there) → Delete (settings gone) → Install again (defaults).

### 8. Plan + PR

- Short `Plans/<TOPIC>_PLUGIN.md` for the science / engine only if the pack has one
- Open the PR with [`.github/PULL_REQUEST_TEMPLATE/crop-pack.md`](../.github/PULL_REQUEST_TEMPLATE/crop-pack.md)

```bash
npm run plugins:pack -- plugins/<id>    # → plugins/<id>.zip (gitignored)
```

---

## Must not

- Call this a Freenet plugin, or put binaries in `plugins/`
- Hot-load React / JS from the zip
- Write pack knobs into Settings → Advanced or `settings/farm`
- Share `settings/model_params` (economics live there)
- Auto-enable `dashboard`, `farm_setup`, or other always-on modules
- Bypass invite PIN ∩ farm catalog
- Delete diary, map, or issues in Delete
- Seed a farm-wide “this enterprise ⇒ auto-install” path for a **new** pack

---

## After Install, what the system already does

You do not implement lifecycle I/O. `src/lib/cropPackLifecycle.ts` already:

| Action | Farm doc | Settings |
|--------|----------|----------|
| **Install** | `cropPacks[<id>] = active` (default) + add pack modules | Unchanged |
| **Deactivate** | status `inactive` + strip pack modules | Kept |
| **Activate** | status `active` + add pack modules | Kept |
| **Delete** | drop `cropPacks[<id>]` + strip modules | Wipe owned keys or whole `settingsDocId` |

Nav and routes follow `enabledModules` ∩ member grant ∩ pack active. PIN presets still clamp to the farm catalog. Install does **not** rewrite existing farmer PIN grants — the owner adds the module under Farm management or mints a new PIN.

---

## Lean follow-ups (do not grow the framework)

These are holes. Fix them with small edits when a third pack lands — not with a plugin SDK.

| Hole | Why it hurts | Lean fix |
|------|----------------|----------|
| Docs listed `onInstall` hooks that do not exist | Authors invent APIs | This file; contract D6 is declarative wipe |
| Walnut / chill `use*Pack` + `ModuleRoute` special cases | Copy-paste makes the next pack “work” before Install | New packs: `isPackActive` only |
| ~~`WALNUT_PACK_MODULES` / `CHILL_PACK_MODULES` in `farmModules.ts`~~ | Done 2026-08-24 | `allPackModuleIds` / `defaultModulesWithoutCropPacks` / `packModulesToExclude` read `CROP_PACKS` |
| `useOfferedFarmModules` hard-codes blight / chill | Migration shim, not a registry | Let it die with the last unmigrated farm |
| About / Dashboard cards special-case packs | Fine for two packs; noisy at five | Optional later: one “active pack cards” list. Not now |
| Chill weather API has no pack gate | Server will compute without Install | Add when it matters; not an authoring blocker |
| `cropPacks` in rules is “any map” | Unknown ids persist | Optional: allow-list known pack ids. Later |

**Do not add:** zip hot-load, a scaffold generator, more plugin categories, per-pack lifecycle hooks, a generic untyped `settings/{packId}` rule.
