# Wheat yield crop pack

Head-count scout for wheat paddocks. The arithmetic is the Wheat Yield app v1.12 (`estimateYield` in `src/estimateYield.ts`).

| File | Owns |
|------|------|
| `plugin.json` | Catalog row. Module `wheat`. Route `/wheat-yield`. No settings doc |
| `engine.json` | Opening defaults: 320 heads, 10 × 3, 74 kg/hL, 10% deduction |
| `src/estimateYield.ts` | The count. One side of the head only |
| `src/` | Scout page, map readout, `packUi` |

A paddock is offered when its crop says wheat, or it is broadacre and still unnamed. Barley and other named crops stay off this scout.

Each paddock’s counts live at `farms/{farmId}/wheat_yield/{blockId}`. Any farmer on the farm can write that document. Deleting the pack does not delete those scouts (same as harvest records).

```bash
npm run plugins:verify -- plugins/wheat_yield
```
