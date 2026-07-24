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

**Primary enterprise** (Farm Setup) drives new-paddock defaults and map wording:
- Tree primary only → **Orchard Map** / Blocks
- Broadacre, hort, station/dairy, aqua (or mixed with those) → **Paddock Map** / Paddocks

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
5. **Module suggestions** — auto-offer blight only when walnut (or similar) is in play.
6. **Farm doc sync** — persist profile on `farms/{id}` for invite/discovery parity.

## Default for existing farms

No profile → treat as orchard / walnut (backward compatible).
