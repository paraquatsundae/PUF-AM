# Wheat yield scout

**Product:** PUF-AM — Ag Manager
**Status:** Live spec — the count shipped in the `wheat_yield` crop pack
**Date:** 2026-09-29
**Authoring:** [`PLUGIN_AUTHORING.md`](PLUGIN_AUTHORING.md)

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
