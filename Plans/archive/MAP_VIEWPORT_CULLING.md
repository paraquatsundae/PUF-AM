# Orchard map viewport culling (design, not built)

**Status:** not implemented — investigation only, 2026-09-02  
**Roadmap:** [`ROADMAP.md`](ROADMAP.md) § Step 11  
**Limits:** [`CODEBASE_HEALTH.md`](CODEBASE_HEALTH.md) § Concern and cost ("do not rebuild GeoJSON layers on pan/zoom")  
**Shipped instead:** warn-only guard — `src/lib/mapFeatureLoad.ts` + toolbar banner (`f95932f`)

---

## 1. Current behaviour

**Nothing on the orchard map is viewport-culled.** Every block, pin and track is a live Leaflet layer from load until the farm changes, whatever the operator has in frame.

Bounds plumbing exists but is inert:

| Piece | Path | Reality |
|-------|------|---------|
| Fetch filter | `mapApi.getBlocks/getPins/getTracks` | Optional bounds arg; a hand-rolled point-walk, not Turf |
| Caller | `farmGeometrySync.ts:104` | Never passes bounds |
| Store filter | `filterByBounds` (`mapStore.ts:111`) | Deliberate no-op for polygons; pins only, at load |
| Viewport | `useOrchardMapViewport.ts:126` | `moveend`/`zoomend` debounced 500 ms |
| `setBounds` | `mapStore.ts:151` | Stores the box; triggers no refetch |
| Layer sync | `orchardMapLayerSync.ts` | Never reads bounds |

`ROADMAP.md` Step 11 previously ticked the first two rows. Corrected 2026-09-02.

---

## 2. The blocker — membership *is* existence

`syncOrchardMapLayers` decides what to build by reading what is already attached:

- Snapshots `fg.getLayers()` into `existing` (`orchardMapLayerSync.ts:56-60`)
- `if (existing.has(key)) continue`, else builds via `L.geoJSON(geo)` (`:71`)
- Deletes `layerMapRef` entries whose layers left the group (`:47-53`)

So **"detached" currently means "rebuild me."** A culling pass that removes an off-screen block causes the next sync to rebuild it from GeoJSON — the exact thing `CODEBASE_HEALTH.md` forbids on pan/zoom. The `:47-53` cleanup, which exists for the EditControl-clears-the-group case, would also purge any detached-but-cached layer.

Culling cannot be bolted on. It needs two ideas separated that the code treats as one:

- **built** — an `L.Layer` exists for this feature
- **attached** — that layer is a member of the FeatureGroup

---

## 3. Proposed shape — two commits

### Phase 1 — layer cache, no behaviour change

- Add a cache keyed `block:{id}` / `pin:{id}` / `track:{id}` beside `layerMapRef`.
- `syncOrchardMapLayers` builds on a **cache** miss, not a **group** miss.
- Removed-from-store → evict + detach. Culled → detach only.
- Land and verify the map behaves identically before any culling.

Worth doing on its own: EditControl teardown currently forces a full GeoJSON rebuild on mount, which is why `useOrchardMapLayers.ts:77-79` needs a `requestAnimationFrame` plus a 100 ms retry. With a cache that becomes a re-attach.

### Phase 2 — the culling pass

- New effect keyed on the debounced bounds `useOrchardMapViewport` already produces.
- Attach/detach decided from Leaflet's own cached `layer.getBounds()` (polygons, polylines) and `getLatLng()` (markers) against `map.getBounds().pad(0.25)`.
- No Turf, no hand-rolled bboxes — numeric comparisons, O(features) per pan.
- Padding supplies hysteresis so small pans do not thrash membership.
- Decision logic factors into a pure `src/lib` helper (bboxes + viewport → ids to attach/detach), unit-testable without Leaflet.

---

## 4. Hazards

1. **Active editing** — a layer under Leaflet.draw's edit handler must never be detached or the session breaks. `useOrchardMapDraw.ts:146` walks `getLayers()` directly; the edit target needs an explicit exemption.
2. **Style passes** — `refreshPinAndTrackStyles`, `refreshBlockHeatStyles` and `applyDrawPassThrough` all iterate `featureGroup.getLayers()`. Detached layers miss styling and need a refresh on re-attach.
3. **Hit-testing** — `useOrchardMapClicks.ts:196` walks the group. Culled features becoming unclickable is correct; confirm nothing assumes completeness.
4. **Sheet actions** — `orchardMapSheetActions.ts` passes the group at `:62`, `:91`, `:107`. Same audit.
5. **Search then fly** — flying to an off-screen block must re-attach before the flight lands.

---

## 5. Scope beyond the FeatureGroup

The three collections Step 11 names are not the whole cost. `PaddockNameLayer` builds one marker per named block in its own `L.layerGroup` and tears down and rebuilds the whole group whenever `centers` changes; it also runs `turf.centerOfMass` per block (memoised on `blocks`, so not on pan, but real on load). `OperateIssuesLayer`, `MapHighlightsLayer` and `CrewPresenceLayer` repeat the per-item pattern. A full fix is broader than blocks/pins/tracks.

---

## 6. Recommendation

**Measure before building.** The warn-only guard is the instrument: it reports when a farm crosses 500 rendered features. This design is a multi-commit restructuring of the layer lifecycle touching the draw, click and style paths, and it should not start until a real farm is known to cross the threshold. If none does, the banner may be the whole fix.
