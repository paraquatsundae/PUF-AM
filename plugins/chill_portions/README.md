# Chill portions crop pack

On-disk package for Dynamic Model chill portions (`chill_portions.zip` when packed).

Engine is the standalone **Chill Portion Calculator** (Erez & Fishman / `chill_calc.py` port) plus PUF-AM farm hourly DPIRD.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, `chill` module, `/weather-events`) |
| `engine.json` | Dynamic Model constants, SH season defaults, walnut cultivar CP targets |
| `src/chillCrops.ts` | Crop types and varieties (farm species plus the standalone calculator bands) |
| `src/` | React UI — Weather events page, calculator and science panels, block readout, `packUi` registration |

**Not in this folder:** the hourly farm path (`shared/weather/chillPortions.ts`) and the daily/CSV calculator (`shared/weather/chillCalculator.ts`). Both stay shared because `server/chillRoutes.ts` computes seasonal portions server-side and cannot import from a pack folder.

Everything here is compiled into the app build. v1 does not hot-load React from the zip.

```bash
npm run plugins:verify -- plugins/chill_portions
npm run plugins:pack -- plugins/chill_portions
```

Standalone calculator source: [PUFworks-chill_calculator](https://github.com/paraquatsundae/PUFworks-chill_calculator) (`web/`, `src/chillCalculator.ts`). The crop bands in `engine.json` (walnuts that file lists) and `src/chillCrops.ts` (other crops) are copied from the local app at `/home/george/chill_portion_calculator/web/crops.js`. Vina, Lara and Cisco are not in that file, so they keep the older single estimates. Release binaries stay on that repo's Releases — not a PUF-AM zip.

Block click readout (`ChillBlockReadout`) scores each variety on the paddock against the seasonal total from `GET /api/weather/chill-portions`. The row colour is `shadeForFraction` in `shared/shadeForFraction.ts`: under 25% red, 25% orange, 50% yellow, 75% cyan, 100% and above blue.

## Weather / DPIRD (2026-09-15)

Farm season totals are **not** fetched with a key in this folder. `src/chillPortions.ts` calls `GET /api/weather/chill-portions` through `apiUrl` / `apiFetch` ([`API_KEY_SECURITY.md`](../../Plans/API_KEY_SECURITY.md), [`NAMING.md`](../../Plans/NAMING.md) §3).

| Rule | Meaning here |
|------|----------------|
| Server-only key | `DPIRD_API_KEY` on Express / Cloud Functions / the owner's BYO function. Never `VITE_DPIRD_API_KEY`. |
| Hosted | Same-origin Cloud Run on `am.pufworks.farm`. Packaged desktop / APK send `/api/weather/*` to that host — they do not ship the key. |
| BYO | `farms/{id}/settings/weather.weatherEndpoint` only. Missing endpoint: fail closed. Never fall back to `am.pufworks.farm`. |
| BYO key | Owner's Secret Manager. Never Firestore, never the client, never George's Secret Manager. |
| Calculator | Daily Tmax/Tmin → synthetic hourly → `engine.json` constants. No network, no key. |

`kelvinOffset` is **273.0** in `engine.json` for both farm hourly and the calculator.

**Residual:** [`functions-byo-weather/`](../../functions-byo-weather/) does not serve chill-portions yet ([`FIREBASE_BILLING.md`](../../Plans/FIREBASE_BILLING.md) §3.3). Seasonal totals on a BYO farm 404 until that package grows; the calculator still works.

**Decision — 2026-09-15:** weather reference in this README and the science panel matched to the table above. Fetch helper was already on `apiUrl`. See [`PLUGIN_AUTHORING.md`](../../Plans/PLUGIN_AUTHORING.md) § Template pack.
