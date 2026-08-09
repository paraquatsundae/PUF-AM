# Farm types & paddock identity — skeleton

Status: **structure in place** (catalog + Farm Setup + naming sheet). Map infrastructure types (D-05) and paddock exclusions / dam texture (D-05b) shipped — see section below. Deep seasonal / station / aqua / livestock movement UIs are later phases.

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

---

## Map infrastructure (D-05)

Mappable farm assets beyond paddocks/tracks. Catalog: `shared/farm/infraTypes.ts`. Model: `InfrastructurePin` in `src/lib/mapStore.ts`.

| Type id | Label | Draw mode | Notes |
|---------|--------|-----------|--------|
| `weather` | Weather station | point | Coverage circle mock; telemetry mock |
| `soil` | Soil moisture probe | point | Coverage + telemetry mock |
| `irrigation` | Irrigation valve / node | point | Coverage + telemetry mock |
| `dam` | Dam / water body | polygon | Stored as pin + `geojson` (centroid lat/lng); **subtracts** paddock area; water fill pattern |
| `internal_passable` | Pad (passable) | polygon | Internal hardstand / gravel; visible; **does not** subtract area |
| `internal_impassable` | Hazard zone / impassable | polygon | Drain, rock pile, etc.; **subtracts** paddock area; hatch fill |
| `pipeline` | Pipeline | line | Pin + LineString `geojson` |
| `standpipe` | Standpipe | point | Fill / hydrant pin |
| `vehicle` | Vehicle | point | Static home/park pin; optional `trackerId` |
| `fuel` | Fuel point | point | Diesel / AdBlue / storage |
| `hazard` | Hazard | point | Powerlines, soft ground, chem store, etc. |

**Draw UX (Farm Map → Infrastructure):** pick type chips → Plus / Leaflet draw toolbar uses that type’s mode (marker / polyline / polygon). Blocks tab still draws paddock polygons; Tracks tab still draws track polylines.

**Fields:** `type`, `name`, `status`, `lat`/`lng` (always — centroid for area/line), optional `geojson`, `notes`, `trackerId` (vehicles).

**Meshy / GPS trackers (future):** `trackerId` reserves a Meshy (or similar) device id on vehicle pins. Live position overlay is not wired yet — pins are home/park locations for now.

**Rules / API:** `firestore.rules` `isValidInfrastructurePin` allowlists new types + `geojson` / `trackerId` / `notes`. Deploy rules if production has not picked them up yet. `mapApi.savePin` stringifies `geojson`.

### Internal boundaries from block edit

You can add pads / hazard zones without leaving the Blocks workflow:

1. Farm Map → **Edit** → **Blocks**.
2. Select a paddock (sidebar card or map) → open details, **or** start **Edit boundary**.
3. Choose **Add pad** (passable) or **Add hazard** (impassable).
4. Draw the polygon on the map (DrawingActionBar: Undo / Finish / Cancel).
5. On Finish, an `InfrastructurePin` (`internal_passable` / `internal_impassable`) is created; metadata opens briefly; paddock `areaHa` recalculates (impassable subtracts).
6. Existing internals that intersect the paddock are listed in the block details panel (name + type). Tap a row to edit that pin.

If the drawn shape is mostly outside the selected paddock, a confirm warns but still allows save (v1 — no auto-clip). Same assets remain editable under the Infrastructure tab chips.

### Paddock exclusions & area (D-05b)

Helpers: `infraSubtractsFromPaddock`, `infraFillPattern` in `shared/farm/infraTypes.ts`; area math in `src/lib/paddockExclusions.ts`; SVG patterns in `src/lib/infraMapStyles.ts`.

**Approach:** paddock `geojson` stays a **single exterior ring** (vertex edit unchanged). Dams and impassable internal polygons live only on infrastructure pins. `areaHa` = turf area of exterior minus intersections with subtracting polygons (`turf.difference` over the set). Passable pads are drawn on top but ignored for area.

**Display:** exclusion polygons render above paddocks with water / hatch / gravel patterns (not flat tints). Stored paddock geojson is **not** punched with holes (hole-preserving boundary edit is a later follow-up if needed).

**Recalc:** `recomputeBlockAreasForFarm` runs from Farm Map when blocks/pins change (create/edit/delete dam or impassable zone, or paddock boundary save).
