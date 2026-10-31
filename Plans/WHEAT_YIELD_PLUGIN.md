# Crop assessment

**Product:** PUF-AM — Ag Manager
**Status:** Active plan — yield count is unchanged. Harvest loss is drop trays on a header spread
**Date:** 2026-09-29
**Authoring:** [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)

The operator-facing name is **Crop assessment**. The pack id stays `wheat_yield`, the module stays `wheat`, and the route stays `/wheat-yield`. Existing yield documents are not moved.

**Decision — 2026-10-29 (crop assessment):** The page has two tabs, Yield and Harvest loss. Yield is the head-count scout already shipped. Harvest loss is a separate check on the same paddock list (wheat, or broadacre still unnamed). Other crops stay off this list until a later pass. A loss save must not rewrite a yield scout.

Wheat paddock yield from head counts. The arithmetic is the Wheat Yield app v1.12 and lives only in `plugins/wheat_yield/src/estimateYield.ts`. Core does not know the formula.

## Counting

Count one side of the head only.

- grains/head = height × width × 2 (10 high × 4 wide = 80 grains)
- several square-metre counts are averaged (heads, height, width)
- TGW g/1000 = 0.50 × hectolitre kg/hL + 3 (74 kg/hL → 40 g). A weighed TGW above 0 replaces that
- half-litre cup grams = hectolitre × 5
- t/ha = heads/m² × grains/head × mg/grain / 100000
- paddock t/ha = counted t/ha × (1 − deduction). The deduction is uncounted low ground, 0–100%
- total tonnes = paddock t/ha × seeded hectares

Opening defaults (also `engine.json`): 320 heads, 10 × 3, 74 kg/hL, 10% off.

## Where it shows

Settings → Plugins → Install **Wheat yield**. The Crop menu item and the map paddock card follow that install. A paddock is in the scout when its crop says wheat, or it is broadacre and still unnamed.

Counts are stored at `farms/{farmId}/wheat_yield/{blockId}` (one document per paddock). Farmers on the farm may write it. Deleting the pack does not delete those documents.

## Harvest loss

A second tab on the same page. One document per paddock at `farms/{farmId}/wheat_yield_loss/{blockId}`. A paddock can hold several calculations. Each calculation has a header width, a spread width, a crop, and any number of drop trays. Deleting the pack does not delete those documents. The rules for this collection are in `firestore.rules` and are not deployed until asked.

**Decision — 2026-10-30 (drop trays):** The sample is the grain caught in a tray. The usual tray is 30 cm × 30 cm. A round tray 30 cm across, and a long tray 1.5 m × 0.25 m, are the other two. Weighing the clean grain is the usual entry. Counting grains instead uses a standard grains-per-gram figure: canola 290 (the figure used on this farm), and wheat 27, barley 23, oats 29, lupin 7. Those four are the GRDC counts for 1 t/ha in 0.1 m², divided by 10 g. Canola on that GRDC table is 267; this farm uses 290.

Kilograms per hectare on the ground = grams × 10 ÷ tray area in square metres. The spread is drawn as five equal bands across its width. Trays in one band are averaged, then the bands that have a tray are averaged. That figure is scaled by spread width ÷ header width, which is the loss across the cut. Tap a band to add a drop. The yield scout’s thousand-grain weight is not copied across.

**Decision — 2026-10-30 (a tray you make):** The three built-in trays stay. A rectangle or a round tray can be named and saved, with its sides in centimetres. That list is kept on the device (`pufam.harvestLoss.trays.v1.{farmId}`) and copied onto the paddock document when the check is saved, so the next paddock on this device already has it. The tray chosen before a band is tapped is the tray that drop uses. Each drop can be switched to another saved tray. A removed tray still calculates from the area copied onto the drop. Once two trays have a weight or a count, each band shows its own kilograms per hectare as a bar. Empty bands stay out of the average.
