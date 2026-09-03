# Drying pack

Crop-menu pack. Dryer list in `settings/assets.dryers`; sessions in `drying_sessions/`. Delete clears the dryer list only — not harvest history.

`src/` holds the page, session modals, the drying model, and `FarmDryersPanel` — the dryer list editor, registered as this pack's `productionSettings` surface.

The dryer list is read and written through `src/lib/farmAssets.ts`, which still sits in core. Every one of its callers is now in this pack, so it is a candidate to move here; it stays in core for now because `settings/assets` is named as a farm-wide asset doc rather than a drying one.
