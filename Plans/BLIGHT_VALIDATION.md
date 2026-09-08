# Blight model validation & scientific hardening

**Product:** PUFAM — Ag Manager (walnut crop pack)  
**Status:** Ji Forecast/Historical wired; Sandbox keeps legacy multiplicative index  
**Date:** July 2026  
**Authoritative honesty copy:** [`plugins/walnut_blight/src/BlightEngineScience.tsx`](../plugins/walnut_blight/src/BlightEngineScience.tsx) (on Blight risk; About points there)  
**Engine:** [`plugins/walnut_blight/src/blightModel.ts`](../plugins/walnut_blight/src/blightModel.ts) · [`shared/weather/jiBlightModel.ts`](../shared/weather/jiBlightModel.ts)  
**Weather WD proxy:** [`shared/weather/dpirdClient.ts`](../shared/weather/dpirdClient.ts)

## Verdict

PUFAM’s walnut blight UI is a **unitless, weather-driven threat / infection-risk aid** for *Xanthomonas arboricola* pv. *juglandis*. Forecast/Historical follow Ji et al. 2025 equations on a wetness proxy; Sandbox keeps the older multiplicative index. It is **not** XanthoCast or WalBlight-risk. Treat production numbers as **relative decision aids**, not infection probability or lesion severity, until WA validation metrics exist.

### Product fork (updated after local research pack — July 2026)

| Option | Meaning |
|--------|---------|
| **A — Ji core (recommended)** | Production infection risk = Ji et al. 2025 process model (primary inoculum → INFR → incubation); protection stays separate / Research-only until calibrated |
| **B — Workshop index** | Keep legacy sandbox multiplicative index; strict non-claim wording |
| **C — Dual track** | Show Ji risk + Lang moisture intensity (AU) side-by-side until WA scouting picks a winner |

**Recommended:** **A**, with **C** as a Historical comparison line. Rationale: you already have a Mathematica implementation of Ji equations on farm weather; Ji is peer-reviewed, process-based, and validated on 21 epidemics. PUFOM’s current index is closer to the *Protection vs natural blight threat* notebook (heuristic) than to Ji.

Local research pack (read-only sources):

`C:\Users\georg\Documents\Agronomy'\2026\Walnut\Blight forecasting\`

| File | Role |
|------|------|
| `Development and Validation of a Mechanistic Weather-Based Model for Walnut Blight.pdf` | Ji et al. 2025 (*Plant Disease* 109:1130–1141) — authoritative equations |
| `Modified Daily blight infection risk.pdf` | Your Mathematica: Ji params + farm weather (32 d) + WD proxy + 400 trees/ha |
| `Protection vs natural blight threat.pdf` | Your Mathematica: chem/bio armour vs heuristic threat — maps to Sandbox ideas, **not** Ji |

---

## Reference models & data for testing

| Source | What it provides | How we use it |
|--------|------------------|---------------|
| **WalBlight-risk** (Moragrega et al. 2023, *Plants* 12:2800) | 3rd-order T×W polynomial; Mediterranean inoculation validation | Golden T+W grids; side-by-side daily risk vs PUFOM threat |
| **XanthoCast** (Adaskaveg / UC) | Wetness hours in bins 6–12 / 12–17 / 17–27 °C; ~7-day index 0–35 | Industry spray-timing benchmark |
| **Ji et al. 2025** (*Plant Disease*) | Mechanistic life cycle; 21 epidemics (Italy leaves + US fruit) | Occ/non-occ infection accuracy; seasonal severity skill |
| **Lang PhD + Acta Hort (Tasmania)** | Moisture intensity = rain / surface wetness; 10 site-years; spray-timing trials | Best **Australian** epidemic + management dataset |
| **UCANR / CWC reports** | Bud CFU, prior-season orchard risk, phenology spray starts | Inoculum & management rules we omit |
| **DPIRD WA** (MA002 / PE001 / BA001 / DN001) | Historic daily (+ hourly T for chill) already cached | Weather drivers for backtests — **not** disease labels |
| **DPIRD Journal + walnut.net.au** | WA/NSW qualitative epidemiology | Sanity checks only |

**Gap:** No SW WA orchard lesion / % fruit-blight time series yet. Without farm scouting (or borrowed Lang/Ji labelled epidemics + matching weather), only **model-vs-model** tests are possible.

---

## Findings from local research pack

### Ji et al. 2025 — what the production engine should implement

Process model (HLIR-style sites S1→S2→S3→S4), not a single “threat” smoother:

1. **Primary inoculum mobilisation** (from budbreak; cumulative rain):
   \[
   Y_i = k \,(1 - a^{SR_i}),\quad a = 0.916
   \]
   Daily splash dose = ΔY on measurable rain days. \(k\) = orchard inoculum modulator (from bud CFU / blight history — Buchner et al. 2014 distribution). Mis-set \(k\) scales severity but **infection-period timing** still usable.

2. **Infection rate** \(INFR = f(T) \times f(WD)\):
   - **Beta temperature** (Adaskaveg 1998 fit): \(T_{\min}=10^\circ\mathrm{C}\), \(T_{\max}=24^\circ\mathrm{C}\); \(b=3.075\), \(c=0.676\), \(d=8.205\); \(T_{eq}=(T_{WD}-T_{\min})/(T_{\max}-T_{\min})\).
   - **Gompertz wetness**: \(e=1.020\), \(f=2.093\), \(g=0.896\); \(f(WD)=e\,\exp(-\exp(-f(WD-g)))\).
   - Use **mean temperature during the wet period** \(T_{WD}\), not daily max alone (notebook used `tempMax` — verify against paper before porting).

3. **Incubation**: symptoms 15–21 days after infection (delay distribution), then secondary inoculum ∝ diseased tissue, rain-splashed. Ji notes incubation is **not** yet temperature-dependent (known limitation).

4. **Validation bar to beat:** precision 0.866, F1 0.844 (infection occ/non-occ); severity CCC 0.951, RMSE 0.069 on 21 epidemics (Italy leaves + CA fruit). Italy runs used **on-orchard leaf wetness sensors**; CA fruit used Open-Meteo WD.

5. **Australia warning (from Ji discussion):** XanthoCast (wetness-led) underperforms in Tasmania; Lang’s **rainfall / moisture-intensity** model is the regional alternative. For SW WA we should treat Lang as a second Historical track, not ignore it because Ji exists.

6. **Assumptions Ji calls out:** buds as sole primary source; fixed 15–21 d incubation; secondary inoculum ∝ S4. Same caveats apply if we adopt Ji.

### Your Mathematica — Ji daily risk notebook

Already encodes Ji infection params + farm series (rain, tempMax, humidity; Oct–Nov window, 32 days):

| Piece | Notebook | vs current PUFOM | Action |
|-------|----------|------------------|--------|
| WD proxy | `min(18, (rain>0.2 ? 5+0.8×rain : 0) + (RH>82 ? 5 : 0))` | `rain>0 ? 10 : 0` | Adopt notebook proxy as interim; then hourly LWD |
| Primary dose | \(k(1-a^{\sum R})\) | flat `springStartingInoculum` floor | Adopt Ji eq. 1; expose \(k\) as H/M/L or bud CFU |
| \(f(T)\), \(f(WD)\) | Beta × Gompertz | step 12–24 °C × linear WD>8 | Replace core infection |
| Density | 400 trees/ha, \(\alpha=0.28\), ref 150, factor\(^{1.3}\) | homemade TRV/CDF | **Confirm**: not in Ji paper text — keep as optional WA extension, labeled |
| Sprays | efficacy = 0 in that run | Forecast protection off | Keep protection out of production path |
| Output | daily relative risk 0–1 | threat 0–1.5 with ×0.85 memory | Prefer Ji daily infection severity + optional cumulative disease progress |

### Your Mathematica — Protection vs threat notebook

Heuristic armour (Hill chem, bio heat/wet modifiers, Howard \(S_c=0.75\)) vs threat `wet × Topt × (rain+1) × Sc / 250` (Topt 15–25 °C). This is the conceptual ancestor of PUFOM Sandbox — useful for Research UI, **not** a substitute for Ji infection. Do not mix diary sprays into this efficacy on Forecast/Historical.

### Gap vs farm data in the notebooks

Same 32-day weather appears in both notebooks — good for unit tests / golden fixtures. Still need multi-season DPIRD + scouting labels for WA skill.

---

## Priority improvement checklist

Track status in the table; mirror progress in [`ROADMAP.md`](ROADMAP.md) when work starts.

| P | ID | Item | Why | Status |
|---|-----|------|-----|--------|
| 0 | `BV-00` | **Decide fork A (Ji core)** — port notebook equations into shared TS module; Forecast/Historical call Ji, not PUFOM multiplicative index | Local pack already implements Ji; PUFOM index ≠ paper | `in progress` |
| 1 | `BV-01` | **Wetness** — interim: notebook RH+rain proxy; target: hourly LWD (DPIRD hourly / on-farm sensor). Stop `rain?10:0` | Ji INFR is wetness-hours driven; binary WD is fatal | `in progress` (interim proxy live) |
| 2 | `BV-02` | **Temperature** — Ji Beta \(f(T)\) with \(T_{WD}\) in wet hours (10–24 °C); not step 12–24 | Paper params from Adaskaveg 1998 | `in progress` (eq. 3 parenthesisation fixed 2026-09-07 — peak 15.65 °C, max 0.945; still fed daily mean T, not \(T_{WD}\)) |
| 3 | `BV-03` | **Dual tracks on Historical** — Ji daily infection + Lang moisture-intensity (AU); optional WalBlight poly for research | Ji warns XanthoCast weak in wet AU seasons | `todo` |
| 4 | `BV-04` | **Orchard \(k\)** — H/M/L or bud CFU → Ji \(k\); retire faux `springStartingInoculum` as biology | Primary inoculum is first-order in Ji | `done` (H/M/L→k in Settings; client+CF wired; springStartingInoculum relabelled Sandbox-only) |
| 5 | `BV-05` | **Phenology / budbreak date** — SH calendar or scouted budbreak starts cumulative rain \(SR_i\); persist scout | Ji needs budbreak; CA validation used 1 Apr default | `done` (2026-09-07: default moved 1 Sep → **1 Oct** and made farm-configurable via `budbreakMonth`/`budbreakDay` in `settings/model_params`). Not yet fed by *scouted* budbreak observations — still a per-farm calendar date |
| 6 | `BV-06` | **Incubation** — Ji 15–21 d delay distribution for symptom onset (not GDD “eruption” sandbox); keep secondary inoculum explicit | Matches Adaskaveg field lag; GDD queue is not Ji | `done` (2026-09-07: full S1→S2→S3→S4 cascade with rain-dispersed secondary inoculum; incubation is now a state flow, not just a display overlay. Secondary coefficient is our assumption — Ji gives none) |
| 7 | `BV-07` | **Protection** — Research-only; Hill/chem notebook separate from Ji risk; never armour diary sprays on Forecast | Protection PDF ≠ infection model | `todo` |
| 8 | `BV-08` | **Density / canopy** — if keeping 400 trees/ha factor, label as WA extension (not Ji); TRV/CDF stays optional nudge | Density\(^{1.3}\) not in Ji paper body | `todo` |
| 9 | `BV-09` | **Client ↔ Cloud Function parity** — aggregates must run same Ji module | Dashboard vs Blight Risk drift | `done` (functions Ji mirror + parity test) |
| 10 | `BV-10` | **Golden fixtures** — 32-day notebook weather → match the published equations within tolerance; later Lang/Ji epidemics | Ground-truth series for unit tests. **The notebook is not ground truth for the maths** — it shared the eq. 3 error (2026-09-07), so expectations are now derived independently from the paper | `in progress` (32-day fixture green at 1e-8; Ji's own 21 epidemics not yet used) |
| 11 | `BV-11` | **UI semantics** — “Infection risk (Ji)” unitless 0–1; no `%`; no “infectious pressure”; Research sandbox renamed | Honesty | `todo` |
| 12 | `BV-12` | **Station / LWD plan** — DPIRD vs orchard wetness logger for Manjimup region | Ji Italy used in-orchard WD | `todo` |
| 13 | `BV-13` | **Lock published params** — \(a,b,c,d,e,f,g,T_{\min},T_{\max}\) read-only; only \(k\) (+ optional density) farm-tunable | Prevent “calibration” inventing science | `todo` |
| 14 | `BV-14` | **Claim discipline** — About/README: “Ji et al. 2025 process model (WA wetness proxy until sensors)” | Stop “Ji-inspired SEI” handwave | `done` (About.tsx, README, SITE_SYNOPSIS now say Ji-is-production w/ proxy wetness) |
| 15 | `BV-15` | **Forecast honesty** — legible obs-end boundary + labels; now a real forecast feed (superseded the persistence-only decision) | Persistence looked like prediction | `done` (obs-end line + dynamic disclaimer + tooltip tag) |
| 16 | `BV-16` | **Real forecast feed** — MET Norway Locationforecast (9-day, by lat/lng) → daily rows through the same Ji path; DPIRD API is obs-only | Grower wanted the DPIRD-site forecast; DPIRD has no public forecast API | `done` (shared+CF metno modules, hourly CF + dev route, forecast-vs-persistence UI, parity + aggregation tests) |

---

## Known engine facts (baseline for tests)

### Production path (Forecast / Historical)

Ji et al. 2025 via `runJiBlightSeries` → `runJiBlightModel` (not the legacy sandbox index):

```
SR             = rain in the 4 weeks after farm budbreak (default 1 Oct)
Y              = k (1 − 0.916^SR)
dose           = ΔY on rain days + secondaryCoeff × S4
INFR           = f(T)_Beta × f(WD)_Gompertz
S1--DISPR-->S2--INFR-->S3--INCR-->S4
threat_t       = S2→S3 flow that day (dailyInfectionRisk)
```

- Farm-tunable: `orchardInoculumLevel` → k, `budbreakMonth` / `budbreakDay`
- `includeProtection` **false** (sprays do not reduce threat on forecast/historical charts)
- Missing weather days **carry forward** last known values (persistence “forecast”)
- Sandbox still uses the old multiplicative index below; it is not production

### DPIRD wetness proxy (current)

```
WD = rainfall > 0 ? 10 : 0
maxHourlyRain = rainfall > 0 ? rainfall * 0.2 : 0
```

### SH phenology calendar

| Months | Stage | Susceptibility |
|--------|-------|----------------|
| May–Aug | dormant | 0.1 |
| Sep | bud_break | 1.5 |
| Oct | bloom | 2.0 |
| Nov–Jan | post_bloom | 1.0 |
| Feb–Apr | shell_hardening | 0.3 |

---

## Validation workstreams

### A. Port Ji from notebook → shared TypeScript (first)

1. Extract the 32-day rain / temp / RH arrays from the Mathematica notebook into `tests/fixtures/blightJiOctSample.json`.
2. Implement `shared/weather/jiBlightModel.ts` (or similar): eqs. 1–4 + incubation stub; published params frozen.
3. Golden test: daily risk matches notebook within ~1e-3 (or document intentional \(T_{WD}\) vs `tempMax` fix).
4. Wire Forecast/Historical to Ji; keep old PUFOM index behind Research “legacy index” for one release if needed.

### B. AU second track + literature

1. Lang moisture intensity on same DPIRD seasons (Historical overlay).
2. Optional WalBlight polynomial for research compare (Mediterranean T×W surface ≠ AU rainfall story).
3. Digitize Lang Tasmania epidemics when available; score infection-period skill (Ji’s Table 4 style).

### C. Farm ground truth (SW WA)

Weekly / post-wet-event log:

- % blighted nuts and/or leaves (fixed sample)
- Cultivar / block / phenology / budbreak date
- Spray product, rate, date
- Winter: bud CFU or at least prior-season blight class → \(k\)

### D. UI / engineering hygiene

1. BlightRisk lean: Forecast + Historical = Ji risk; Research = protection notebook + scenarios.
2. Kill `%` / “infectious pressure” / dual Critical thresholds; diary sprays = markers only.
3. Aggregate CF calls same Ji module.
4. About: cite Ji 2025 DOI; state WA wetness proxy limitation.

---

## Acceptance criteria (definition of “robust enough”)

Minimum for calling the production chart **scientifically careful** (Ji-based, WA proxy wetness):

- [ ] Written decision: fork **A** (Ji core)
- [ ] `BV-00` + `BV-10`: notebook golden fixture passes
- [ ] `BV-01` interim wetness proxy (not rain binary)
- [ ] `BV-11` / `BV-14`: UI + About claim Ji correctly; no fake %
- [ ] `BV-09`: aggregate ≡ client

Minimum for calling it a **validated spray-timing aid** for this farm:

- [ ] All of the above, plus
- [ ] `BV-04` orchard \(k\) from history or buds
- [x] `BV-05` configurable budbreak date (scouted observation still to come)
- [ ] `BV-03` Lang track considered for wet seasons
- [ ] ≥1 season scouting with infection-period skill (TPP/FPP style)
- [ ] On-farm or validated hourly LWD (`BV-01` target / `BV-12`)
- [ ] Protection (`BV-07`) Research-only or trial-calibrated

---

## Progress log

| Date | Note |
|------|------|
| 2026-07-17 | Plan created from engine audit + literature survey. |
| 2026-07-18 | Ingested local pack (Ji 2025 PDF + two Mathematica notebooks). Recommendation shifted to **Ji core (fork A)**; WD proxy + \(k\) + golden 32-day fixture prioritized. |
| 2026-07-18 | Code start: `shared/weather/jiBlightModel.ts`, golden tests, DPIRD WD proxy, Forecast/Historical wired to Ji (`runJiBlightSeries`). Sandbox still legacy PUFOM. |
| 2026-07-20 | **BV-09 parity done.** Cloud Function aggregate (`functions/src/blightAggregate.ts`) now runs Ji via a mirror module (`functions/src/jiBlightModel.ts`) — same k=1 / cumulativeY config as client; stores `currentRiskScore` + `currentBand` + `model: ji-2025`. `weatherScheduler.ts` WD switched from binary `rain?10:0` to `estimateWetnessHoursProxy` so cached wetness matches the client. Dashboard risk tile now uses Ji bands (Quiet/Watch/Action) not the 0.3/0.7/1.0 legacy scale. Parity guard `tests/functionsJiParity.test.ts` compares both Ji modules on the golden fixture + a 2-season run. About.tsx rewritten: Forecast/Historical = Ji, Sandbox = legacy index (BV-14 in progress). All 67 tests pass; functions build + client tsc clean. |
| 2026-07-20 | **BV-14 done, BV-06 started.** README + SITE_SYNOPSIS now say "Ji et al. 2025 mechanistic infection-risk model … on a proxy wetness input" (dropped "Ji-inspired SEI"). **Incubation overlay:** `computeSymptomOnsetSeries` + `symptomWindowForEvent` in `jiBlightBands.ts` spread daily infection risk across the 15–21 d window (uniform lag, not temperature-dependent per Ji). Historical chart gains an amber "Expected symptoms" area; Forecast latest-event card shows a "Scout for symptoms DD Mon – DD Mon" window; tooltip now formats sub-0.01 Ji values instead of collapsing to 0.00. Secondary inoculum still not modelled. 70 tests pass; tsc clean. |
| 2026-07-20 | **BV-04 done.** Orchard inoculum exposed as Low/Medium/High → Ji k (0.5/1.0/2.0) via `kFromInoculumLevel` + `JI_INOCULUM_K` in shared + functions Ji modules (parity test extended). `orchardInoculumLevel` added to `CalibrationParams`/`ModelParameters` (default `medium` = k=1, so existing behaviour + golden fixture unchanged). Settings → Advanced gains an H/M/L selector; BlightRisk Ji call and the CF aggregate both read it (aggregate reads `settings/model_params`), keeping Dashboard↔BlightRisk parity across k. `springStartingInoculum` relabelled Sandbox-only in Settings + About (no longer implied biology). `firestore.rules` `isValidModelParameters` realigned to the fields the app actually writes + `orchardInoculumLevel` enum (previous rule was stale: 7 fields incl. non-existent `rainWashoffCoeff`). 71 tests pass; functions build + client tsc clean. **Note: firestore.rules edited — needs `firebase deploy --only firestore:rules` to take effect.** |
| 2026-07-20 | **BV-15 done (forecast honesty).** Decision: stay DPIRD-only — no external NWP/BOM feed — and make the persistence tail legible instead of pretending it's a forecast. BlightRisk now derives `lastObservedDateStr` from the weather cache, caps the projected forecast to `FORECAST_HORIZON_DAYS = 7` past the last observation (was a flat 30-day tail), tags forecast rows `isPersistence`, draws an "Persistence →" obs-end reference line on the forecast chart, shows a dynamic disclaimer ("weather to DD Mon observed, then carried forward 7 days"), and marks persistence days in the tooltip. Sandbox baseline left uncapped (what-if). No model math changed. 71 tests pass; tsc clean. |
| 2026-07-20 | **BV-16 done (real forecast feed) — supersedes BV-15's persistence-only stance.** Confirmed DPIRD's public Weather 2.0 API is observations-only (the forecast on weather.agric.wa.gov.au is third-party); adopted **MET Norway Locationforecast** — the source DPIRD's own `weatherOz` tooling uses — for a real 9-day forecast by station lat/lng. New `shared/weather/metnoForecast.ts` fetches + aggregates hourly/6-hourly steps to Perth-local daily rows (mean T/RH, summed rain, `estimateWetnessHoursProxy` → WD) so forecast days run the identical Ji model as observed. Mirror `functions/src/metnoForecast.ts` (deploy boundary) kept in lock-step by a parity test. Stored separately as `forecastData` + `forecastUpdatedAt` on `weather_cache/{station}`: hourly Cloud Function (`weatherScheduler.ts`) writes it in prod; dev route `POST /api/weather/ensure-forecast` mirrors locally (client refreshes when >6 h stale via `weatherService.ensureForecast`). BlightRisk merges observed+forecast into `modelWeather`, distinguishes observed→forecast→persistence (persistence only if MET Norway is down), relabels the boundary "Forecast →", tags tooltip days, and shows a dynamic MET Norway disclaimer. About.tsx notes the source + that DPIRD's API is obs-only. 80 tests pass (new metno aggregation/parity suite); functions build + client tsc clean; live MET Norway pull verified (10 sane daily rows). No firestore.rules change (weather_cache is admin-write/auth-read). |

---

| 2026-07-20 | **Deployed to production (first-time functions).** Discovered the `functions/` codebase assumed a `(default)` Firestore DB, but this AI Studio project only has named DBs — so the Cloud Functions had never been deployable/runnable here. Added `functions/src/db.ts` (`getDb()` + `FIRESTORE_DATABASE_ID`, default `ai-studio-143a17d7-…`), switched `weatherScheduler.ts` / `blightAggregate.ts` / `financialAggregate.ts` off bare `admin.firestore()`, and pinned the two `onDocumentWritten` triggers to the named DB. `firebase deploy --only functions` (2nd-gen first-run needed one retry for Eventarc/Cloud Run service-agent propagation): `refreshWeatherCache` (us-central1, hourly — DPIRD + MET Norway forecast), `refreshBlightAggregates` (us-central1, daily 05:00), `onDiaryEventWrite` + `syncFinancialAggregates` (asia-southeast1). Firestore rules published via `node scripts/deployFirestoreRules.mjs` (service-account key in gitignored `secrets/`) → ruleset `6670a5ea-987e-4f3c-a6f9-0149a72c8ae2` on release `cloud.firestore/ai-studio-143a17d7-…` (BV-04 `orchardInoculumLevel` validation now live). Functions are now the production hourly writer of `weather_cache`. |

| 2026-09-07 | **BV-02 equation fix — Beta \(f(T)\) was mis-parenthesised.** Obtained the full Ji et al. 2025 paper. Eq. 3 is \(f(T) = (b \cdot T_{eq}^{c} \cdot (1 - T_{eq}))^{d}\) — \(d\) raises the **whole product**. Both Ji modules (and the source Mathematica notebook) applied \(d\) to \((1-T_{eq})\) alone, which moved the peak to **11.07 °C** and capped \(f(T)\) at **0.282**. Ji Table 1 defines `INFR` over 0–1, which the mis-parenthesised form can never reach — independent confirmation beyond the printed parentheses. Corrected form peaks at **15.65 °C, max 0.945**. Fixed in `shared/weather/jiBlightModel.ts` + `functions/src/jiBlightModel.ts` (parity test green). **Golden fixture regenerated** (`tests/fixtures/blightJiOctSample.json`): the notebook encoded the same error, so its outputs could not catch it — expectations recomputed independently from the published equations at full precision (tolerance tightened from 0.2% to 1e-8 relative), weather inputs unchanged; `expectedSource` records this. Curve shape now pinned by tests (peak location, 0–1 bound, monotone either side, spring-vs-winter window). **Bands re-tuned** for the new scale: Watch `0.002 → 0.1`, Action `0.01 → 0.5`, anchored on \(f(T)\) crossing 0.1 / 0.5 with wetness and inoculum saturated (\(f(WD)\) is already ~0.92 by 2 h, so a rain day reduces to \(f(T) \times Y \times\) density); band tests now derive their fixtures from the constants. Measured effect on a synthetic Manjimup year: winter (Jun–Aug) share of season risk **54.3% → 3.7%**, spring (Sep–Nov) **28.5% → 46.4%**. **Still wrong:** Apr–May now holds ~42% of season risk, because `SR` accumulates all year instead of Ji's *4 weeks after budbreak* (Table 1) and the series runner overrides the dose to `cumulativeY`, pinning \(Y \approx 1\) through autumn. Those are the next two fixes. `BV-02` still open on \(T_{WD}\) (we feed daily mean, not mean temperature during the wet period). 1060 tests pass; client tsc clean. |

| 2026-09-07 | **SR window + ΔY dose + the S1–S4 site cascade (BV-06).** Three changes that only work together. **(1) SR window:** Ji Table 1 defines SR as precipitation within *4 weeks after budbreak*; we accumulated all year. Added `inoculumWindowDays` (default `JI_INOCULUM_WINDOW_DAYS = 28`, index 0 = budbreak; `null` disables for equation tests). **(2) ΔY dose:** series runners and both production callers (`useBlightModelSeries`, `blightAggregate`) dropped their explicit `doseMode: 'cumulativeY'` override — the paper doses the change in Y since the previous rain event. **(3) Site cascade:** implemented the HLIR flow of Fig. 1 / Table 1, `S1 --DISPR--> S2 --INFR--> S3 --INCR--> S4`, with S4 oozing rain-dispersed secondary inoculum back into DISPR. Measured on the way: (1)+(2) alone made the model *nearly silent* — under ΔY the whole season's inoculum is a budget of \(\sum \Delta Y = Y_{final} \le k\), so season total risk is bounded by ~0.96 at k=1 (vs 31.9 under `cumulativeY`), zero Action days at any budbreak date. **The cascade is what makes ΔY meaningful**, because secondary inoculum is the only unbounded term. **Two assumptions are ours, documented in code:** S2 is transient (only infected sites leave S1; Ji does not say what happens to contaminated-but-uninfected tissue), and the secondary inoculum coefficient is 1 (`JI_SECONDARY_INOCULUM_COEFF`; Ji states only that production is proportional to S4, having no data). **The site pool is held at 1, not k** — Ji writes S1–S4 as "0 to k", but scaling both pool and inoculum by k cancels k out entirely and leaves the orchard inoculum setting inert; a regression test pins that k changes damage. New outputs on every row: `secondaryDose`, `dispersalRate`, `healthySites`/`latentSites`/`diseasedSites`/`eruptingSites`, and `diseaseSeverity` (S4, 0–1) — the disease progress curve the paper actually validated (CCC 0.951), now surfaced through `DailyData.diseaseSeverity` and `JiSeriesRow`. `latentThreat`/`eruptingThreat` are populated from S3 and the S3→S4 flow instead of hardcoded 0. **Bands re-tuned again** (they are dose-model dependent): Watch `0.1 → 0.01`, Action `0.5 → 0.05`, on the S2→S3 flow, i.e. 1% and 5% of tissue infected in a day. Calibrated by frequency across 40 synthetic Manjimup Sep–Dec seasons — ~19 and ~7.5 days/season, against the 5–10 copper applications Ji describes as standard. **Result on a synthetic Manjimup year:** 8 Action + 8 Watch days, all in Oct (1) and Nov (7), none Jun–Aug, severity 0.8% → 7.9% (Oct) → 39.7% (Nov) → 93.6% (Dec). Golden fixture re-pointed at the **equation layer** (`expectedPrimaryInoculumY`, `expectedInfectionRate`) since it is a 32-day Oct–Nov window rather than a budbreak season; cascade behaviour covered by deterministic tests (pool conservation, 15–21 d incubation, secondary-inoculum dependence, monotone severity, k sensitivity). Parity guard extended to compare every state variable across k ∈ {0.5, 1, 2} over a 150-day run. 1072 tests pass; client tsc clean. **Known limitations:** severity saturates at 100% and stays flat Jan–Aug because there is no host growth (Ji notes new leaves diluting observed severity but does not model it) and Ji only ever validated budbreak→+3 months; the 1 Sep budbreak still puts the SR window in the coldest month (`BV-05`); \(T_{WD}\) still unimplemented (`BV-02`). |
| 2026-09-07 | **Budbreak is now a farm setting, default 1 Oct (BV-05 done).** The 4-week SR window made this date load-bearing: it decides the only stretch of the year in which overwintered bud inoculum can be mobilised. The hardcoded **1 Sep** spent that whole reservoir across Manjimup's coldest month (mean 11.9 °C, \(f(T) = 0.047\)). Moved the default to **1 Oct** — the SH mirror of the 1 Apr default Ji used for the Californian epidemics, and a fit for Chandler, a mid-late leafing cultivar sitting between Payne (mid-Mar NH) and Franquette (late Apr NH). Added `DEFAULT_SH_BUDBREAK`, the `BudbreakDay` type and `resolveBudbreak()` (coerces stored values, rejects 31 Feb and friends, never throws) to both Ji modules; threaded a `budbreak` option through `runJiBlightSeries` on both sides. Persisted as `budbreakMonth` (0-indexed) / `budbreakDay` in `farms/{id}/settings/model_params`, validated in `firestore.rules`, declared in `plugin.json` `settingsOwnedKeys` + `engine.json` defaults, and added to `PRODUCTION_MODEL_PARAM_KEYS` — so it is farm-admin tunable like orchard inoculum, not a research knob. `blightAggregate` reads it from the **same single document read** it already made for the inoculum level (no extra Firestore cost) and records it on the aggregate. New `BlightBudbreakPanel`; the pack's `productionSettings` surface is now `BlightProductionSettingsPanel` (inoculum + budbreak), which is also what `BlightPageHeader` renders — previously the registered surface showed only half the farm-tunable terms. **Measured on a synthetic Manjimup year (k=1), 1 Sep → 1 Oct:** Action days 6 → **10**, and they move from Nov-only to Oct (7) + Nov (3); the peak day roughly doubles (0.102 → 0.196) and lands in October; Jan–Apr leakage (a residue of the September window) goes to **exactly zero**. Season-reset tests were rewritten to anchor their rain on the budbreak rather than hardcoded September dates, so they cannot silently invert if the default moves again; parity tests now cover `resolveBudbreak` coercion and a moved window. 1074 tests pass; client tsc clean. **Still open:** budbreak is a per-farm *calendar date*, not a scouted observation — no phenology feed yet. |

## Key code pointers

| Area | Path |
|------|------|
| Client model | `plugins/walnut_blight/src/blightModel.ts` |
| Client tests | `plugins/walnut_blight/src/blightModel.test.ts` |
| Blight UI | `plugins/walnut_blight/src/BlightRisk.tsx` |
| Honesty / science copy | `plugins/walnut_blight/src/BlightEngineScience.tsx` (About → Blight risk pointer) |
| DPIRD daily + WD proxy | `shared/weather/dpirdClient.ts` |
| Client weather fetch | `src/lib/weatherService.ts` |
| Server aggregate (divergent) | `functions/src/blightAggregate.ts` |
| Calibration UI | Production inoculum: Blight risk; research knobs: Blight risk → Sandbox ([`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md)) |
