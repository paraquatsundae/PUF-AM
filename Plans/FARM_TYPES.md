# Farm types & paddock identity — skeleton

Status: **structure in place** (catalog + Farm Setup + naming sheet). Deep seasonal / station / aqua / livestock movement UIs are later phases.

## Enterprises

| Id | Label | Paddock model | Notes |
|----|--------|---------------|--------|
| `orchard_tree` | Orchard / tree crop | species → cultivar | Walnut first; Howard etc. |
| `fruit` | Fruit orchard | species → cultivar | |
| `vineyard` | Vineyard | species → variety | |
| `broadacre` | Broadacre | seasonal crop | Season-by-season — skeleton only |
| `hort_veg` | Hort / veg | seasonal crop | Same pattern as broadacre |
| `station` | Station / dairy / grazing | water zone | Zones around water, not crop lines |
| `aquaculture` | Aquaculture | dam | Marron dams |
| *(flag)* | Livestock | moves paddock→paddock | Overlay on any enterprise mix |

**Primary enterprise** (Farm Setup) drives new-area defaults only (crop kind + species for trees). Map chrome uses `mapUiCopy`:
- Tree-only → **Orchard Map** / Blocks
- Paddock-land only → **Paddock Map** / Paddocks
- Mixed orchard + broadacre/grazing → **Farm Map** / Areas (neutral); new polygons default to **Area N** until the naming sheet picks a type

**Mixed is normal** — farms tick multiple enterprises. Livestock overlay (“living harvester”) consumes pasture / stubble / regrowth and needs its own I/O tracking later.

## Data

- Catalog: `shared/farm/farmTypes.ts`
- Farm profile on diary `FarmSettings.farmProfile` (local-first; can mirror onto `farms/{id}` later)
- Block extras: `species`, `cropKind`, `geometryKind`, `seasonLabel` (+ existing `cultivar`)

## Naming sheet behaviour

- Orchard / fruit / vineyard → **Species** then **Cultivar/variety**
- Broadacre / hort → name + optional season crop label (skeleton)
- Station → name + optional pasture/use; geometry kind defaults `water_zone`
- Aquaculture → name + stock; geometry kind defaults `dam`

## Phases (later)

1. **Season packs** — broadacre / hort rotation, plant/harvest dates, variety lists per season.
2. **Station geometry** — water-point pins, soft zones, carrying capacity hooks.
3. **Aquaculture** — dam polygons, water quality / stock events.
4. **Livestock overlay** — mobs, moves, feed/graze ledger (living harvester).
5. **Module suggestions** — ~~auto-offer blight only when walnut~~ **shipped:** `farmHasWalnutPack` + Farm setup syncs blight modules.
6. **Farm doc sync** — persist profile on `farms/{id}` for invite/discovery parity (create-farm already writes empty `farmProfile`).

## Walnut crop pack

ON when any mapped area has `species === 'walnut'`, or profile is `orchard_tree` + `defaultSpeciesId === 'walnut'`, or (legacy) no `enterprises` array yet and blight is still in `enabledModules`.

New farms: empty `enterprises`, modules from `defaultModulesWithoutCropPacks()` (no blight). Saving Farm setup with walnuts calls `withWalnutPackModules`; without walnuts calls `withoutWalnutPackModules`.

## Default for existing farms

No `enterprises` on profile → not forced to walnut; blight stays visible only while still in the farm module catalog (legacy).
