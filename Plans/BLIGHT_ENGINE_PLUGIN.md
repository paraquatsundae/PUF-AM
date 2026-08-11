# Blight engine plug-in — settings home

**Product:** PUF-AM — Ag Manager (walnut crop pack)  
**Status:** Active — BE-01 extract landed; BE-02 next (mount Production inoculum on Blight Risk)  
**Date:** 2026-08-11  
**Companion:** [`BLIGHT_VALIDATION.md`](BLIGHT_VALIDATION.md) (science / Ji track) · [`FARM_TYPES.md`](FARM_TYPES.md) (walnut pack gating) · [`SETTINGS_SYNC_AND_CREW.md`](SETTINGS_SYNC_AND_CREW.md) (Settings tab inventory)

---

## Problem

The blight model modifiers still live under **Settings → Advanced** ("Model Modifier Engine v2.4"). That was the right place when the app was walnut-first. It is the wrong place now that blight is an **optional crop pack**:

- Operators without walnuts still open Advanced and meet market economics next to a "Walnut crop pack off" banner — the blight knobs are gone, but Advanced still *reads* as the blight workshop.
- Operators *with* walnuts look for inoculum / sandbox knobs next to the blight engine, not in a generic admin settings dump. About already points at Settings → Advanced for orchard \(k\), and has a parked comment that the science copy belongs with "the blight plugin's own section when plugin sections land."
- There is **no blight plug-in seam yet**. "Plugin" elsewhere in this repo means Freenet host units. Crop packs today are only `farmHasWalnutPack` + module id `blight` + a route. The modifiers never moved when the pack gating landed.

This plan defines that seam and the move. It does **not** re-open Ji science decisions — those stay in [`BLIGHT_VALIDATION.md`](BLIGHT_VALIDATION.md).

---

## Goal

1. **Production knobs** for the walnut blight engine live **inside the blight pack surface**, not under Settings → Advanced.
2. **Sandbox / legacy modifiers** travel with the Sandbox tab (or a clearly labelled Research panel on Blight Risk) — never implied as Forecast/Historical biology.
3. **Settings → Advanced** keeps only farm-wide, non-crop admin (today: Market & Economics), or shrinks away if that too finds a better home.
4. About's parked science copy moves with the pack; About keeps only what is true of the app itself.

---

## What "blight engine plug-in" means here

Not a Freenet-style Node unit. A **crop-pack UI + settings seam**:

| Piece | Meaning |
|-------|---------|
| **Pack gate** | Existing `useWalnutPack()` / `hasModule('blight')` — unchanged |
| **Surface** | Blight Risk page + a pack-owned settings panel (new) |
| **Storage** | Keep `farms/{farmId}/settings/model_params` for v1 (zero migration). Optional later split: blight vs economics docs |
| **Engine** | Existing `shared/weather/jiBlightModel.ts` + Sandbox `src/lib/blightModel.ts` — unchanged math |
| **Not in scope** | New npm package, Capacitor plugin, or Freenet host unit |

Name in UI copy: **Walnut blight** / **Blight engine**. Docs may say "blight engine plug-in" to match the About park note; do not invent a second product mark.

---

## Current inventory (source of truth today)

**UI:** [`src/pages/Settings.tsx`](../src/pages/Settings.tsx) — Advanced tab  
**Doc:** `farms/{farmId}/settings/model_params`  
**Rules:** `isValidModelParameters` in [`firestore.rules`](../firestore.rules)

| Knob group | Fields | Production consumer | Destination |
|------------|--------|---------------------|-------------|
| **Orchard inoculum (Ji \(k\))** | `orchardInoculumLevel` H/M/L | Forecast/Historical + CF `blightAggregate` | **Blight engine → Production** (first move) |
| Legacy / sandbox risk | `blightSensitivity`, `humidityGradientFactor`, `splashMultiplier` | Sandbox `runBlightModel` only | Blight Risk → Sandbox / Research |
| Threat start & latency | `springStartingInoculum`, `latencyGDDThreshold`, `secondarySpreadMultiplier`, `gddBaseTemp` | Sandbox only | Sandbox / Research |
| Canopy / TRV | `treeHeight`, `canopyWidth`, `rowSpacing` | Sandbox + TRV display | Sandbox / Research (BV-08 density later) |
| Chem / bio armour | `chem*`, `bio*` | Sandbox only (BV-07) | Sandbox / Research |
| Market & economics | `marketPrice`, `harvestCostPerKg`, `waterCostPerML` | Settings-only today | Stay in Advanced **or** Farm setup / Financials later — **not** blight |

`cropCoefficient` is typed/defaulted and in the glossary but has **no Advanced slider**; decide keep-as-derived or drop when extracting.

---

## Design

### A. Blight pack settings panel

New component, e.g. `src/components/blight/BlightEngineSettings.tsx` (name flexible), owned by the blight pack:

1. **Production** (admin, walnut pack on)
   - Orchard inoculum H/M/L → Ji \(k\) (0.5 / 1.0 / 2.0)
   - Short honesty line: only farm-tunable Ji term; Medium = baseline; not peer-reviewed calibration
   - Deploy / save (same `setDoc` on `model_params`)
2. **Research / Sandbox modifiers** (admin, collapsible or behind Sandbox tab)
   - Everything else that today sits under "Blight Risk Parameters", "Threat start & latency", "Canopy", "Sandbox protection"
   - Explicit banner: does **not** change Forecast / Historical / Dashboard aggregate
3. **Glossary** — move `ParameterGlossary` with the knobs it describes; trim economics entries if those stay elsewhere

### B. Where it mounts

Preferred order (pick one in implementation; default = **B1**):

| Option | Mount | Pros | Cons |
|--------|-------|------|------|
| **B1** | Blight Risk page — admin "Engine" sub-panel / gear drawer | Operators calibrate where they look at the curve | BlightRisk is already dense |
| **B2** | Settings gains a **Blight** tab (walnut-pack gated), Advanced loses blight | Familiar Settings pattern | Still one click away from the chart |
| **B3** | Both: Production inoculum on Blight Risk; full Research panel only in Settings → Blight | Best of both | Two surfaces to keep in sync |

**Decision for v1:** **B1 for Production inoculum** (always visible to farm admin on `/blight`), **Research modifiers on the Sandbox tab** of the same page (or a single "Research knobs" disclosure under Sandbox). No new Settings tab unless B1 overcrowds the page in implementation.

### C. Settings → Advanced after the move

| Remains | Leaves |
|---------|--------|
| Market & Economics (until a Financials/Farm-setup home exists) | All blight / sandbox / canopy / chem-bio knobs |
| Lock/unlock + Deploy/Reset **only if** economics still saves through the same doc — or split save paths | "Model Modifier Engine v2.4" framing |

If Advanced then has only three number fields, rename the tab to **Economics** (or fold into Financials in a later slice). Do not leave an empty "Advanced" shell.

### D. About copy

Move with the pack ([`src/pages/About.tsx`](../src/pages/About.tsx) park comment ~211–215):

- Scientific foundation / How the blight engine works / model limits → blight pack section (Blight Risk help drawer, or a `/blight/about` sub-route — implementation choice)
- Retarget every "Settings → Advanced → Orchard inoculum" string to the new surface
- About keeps: crop-pack explanation, app navigation, non-walnut honesty

### E. Storage — v1 keep, v2 optional split

**v1 (this plan's build slices):** keep writing the same `model_params` document. Extract UI only. CF `resolveInoculumLevel` and BlightRisk `onSnapshot` stay pointed at the same path.

**v2 (only if economics and blight keep colliding):**

| Doc | Fields |
|-----|--------|
| `farms/{id}/settings/blight` | inoculum + sandbox/research knobs |
| `farms/{id}/settings/economics` | market / harvest / water costs |

Requires rules update, one-time merge read for old clients, and CF path change. **Out of scope for the first landing.**

---

## Build slices

| ID | Slice | Status | Notes |
|----|-------|--------|-------|
| `BE-00` | **This plan** + cross-links | `done` | Docs only |
| `BE-01` | Extract blight panels + glossary from `Settings.tsx` into `BlightEngineSettings` (behaviour-identical, still mounted under Advanced) | `done` | 2026-08-11 — `src/components/blight/BlightEngineSettings.tsx` + `src/lib/modelParameters.ts`; still mounted under Advanced |
| `BE-02` | Mount Production inoculum on Blight Risk (admin); remove blight knobs from Advanced; leave Research knobs temporarily co-mounted or still in Advanced behind a "moved soon" note | `not_started` | First user-visible win |
| `BE-03` | Move Research / Sandbox modifiers onto Blight Risk Sandbox (or disclosure); Advanced keeps only economics (rename tab if needed) | `not_started` | Completes the leave-Advanced story |
| `BE-04` | Retarget About + BLIGHT_VALIDATION "Calibration UI" pointer; move parked science copy into blight pack surface | `not_started` | Honesty / discoverability |
| `BE-05` | Shared `ModelParameters` / `CalibrationParams` type (one module, not duplicated in Settings + blightModel) | `in_progress` | `ModelParameters` → `src/lib/modelParameters.ts` with BE-01; `CalibrationParams` merge still open |
| `BE-06` | (Optional) Split `model_params` → `settings/blight` + `settings/economics` | `deferred` | Only if v1 doc remains awkward |

Acceptance for **done** (BE-02 + BE-03 + BE-04):

- [ ] With walnut pack on, farm admin sets orchard inoculum from Blight Risk without opening Settings
- [ ] Settings → Advanced has **no** blight / sandbox / canopy / chem-bio controls
- [ ] Forecast / Historical / Dashboard aggregate still honour `orchardInoculumLevel` (client + CF)
- [ ] Sandbox still receives legacy calib; banner says it does not affect Ji production
- [ ] About no longer sends people to Settings → Advanced for blight
- [ ] Farm without walnut pack: Advanced (or Economics) unchanged for market fields; no blight UI anywhere

---

## Non-goals

- Changing Ji equations, \(k\) mapping, or wetness proxy ([`BLIGHT_VALIDATION.md`](BLIGHT_VALIDATION.md))
- Exposing published Ji coefficients \(a,b,c,d,e,f,g\) as farm knobs (BV-13 — still locked)
- Making Market & Economics part of the blight pack
- Freenet / mist packaging of blight settings
- PIN / module catalog redesign (already hides `blight` without walnut pack)

---

## Risks

| Risk | Mitigation |
|------|------------|
| BlightRisk page overcrowding | BE-02 = inoculum only; Research stays collapsed until BE-03 |
| Admin on tablet can't find knobs | Same gear entry on `/blight`; update About in BE-04 same PR as BE-02 |
| Half-move leaves two editors on one doc | BE-01 extract first; only one mount writes after BE-02 |
| CF / client parity on \(k\) | No storage path change in v1; existing parity tests stay green |
| Empty Advanced tab | Rename or fold economics in the same PR that empties blight |

---

## Key files

| Role | Path |
|------|------|
| Advanced UI (today) | `src/pages/Settings.tsx` |
| Blight Risk UI | `src/pages/BlightRisk.tsx` |
| Legacy sandbox engine | `src/lib/blightModel.ts` |
| Ji engine | `shared/weather/jiBlightModel.ts` |
| CF aggregate | `functions/src/blightAggregate.ts` |
| Pack gate | `src/hooks/useWalnutPack.ts`, `shared/farm/farmTypes.ts` |
| Honesty copy | `src/pages/About.tsx` |
| Rules | `firestore.rules` → `settings/model_params` |

---

## Progress log

| Date | Slice | Notes |
|------|-------|-------|
| 2026-08-11 | BE-01 | Extracted blight header/panels/glossary into `BlightEngineSettings`; `ModelParameters` → `src/lib/modelParameters.ts`; still mounted under Settings → Advanced with economics in `gridTrailing` |
| 2026-08-11 | BE-00 | Plan drafted after Settings → Advanced still holding Model Modifier Engine; About park note confirmed intent |
|
