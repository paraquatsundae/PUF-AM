# Crop assessment crop pack

Wheat paddock yield from head counts, and a harvest-loss check. The yield arithmetic is the Wheat Yield app v1.12 (`estimateYield` in `src/estimateYield.ts`). The loss figure is the scaffold in `src/estimateHarvestLoss.ts`.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row. Module `wheat`. Route `/wheat-yield`. No settings doc |
| `engine.json` | Opening defaults for the yield scout: 320 heads, 10 × 3, 74 kg/hL, 10% deduction |
| `src/estimateYield.ts` | The yield count. One side of the head only |
| `src/estimateHarvestLoss.ts` | Drop-tray loss, including a tray made on the farm |
| `src/` | Crop assessment page (Yield and Harvest loss tabs), map readout, `packUi` |

A paddock is offered when its crop says wheat, or it is broadacre and still unnamed. Barley and other named crops stay off this page.

Yield counts live at `farms/{farmId}/wheat_yield/{blockId}`. Harvest loss lives at `farms/{farmId}/wheat_yield_loss/{blockId}`. Any farmer on the farm can write either document. Deleting the pack does not delete them.

```bash
npm run plugins:verify -- plugins/wheat_yield
```
