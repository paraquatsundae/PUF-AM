# Chill portions crop pack

On-disk package for Dynamic Model chill portions (`chill_portions.zip` when packed).

Engine is the standalone **Chill Portion Calculator** (Erez & Fishman / `chill_calc.py` port) plus PUF-AM farm hourly DPIRD.

| File | Owns |
|------|------|
| `plugin.json` | Catalog row (label, category, `chill` module, `/weather-events`) |
| `engine.json` | Dynamic Model constants, SH season defaults, cultivar CP targets |
| `src/` | React UI — Weather events page, calculator and science panels, `packUi` registration |

**Not in this folder:** the hourly farm path (`shared/weather/chillPortions.ts`) and the daily/CSV calculator (`shared/weather/chillCalculator.ts`). Both stay shared because `server/chillRoutes.ts` computes seasonal portions server-side and cannot import from a pack folder.

Everything here is compiled into the app build. v1 does not hot-load React from the zip.

```bash
npm run plugins:verify -- plugins/chill_portions
npm run plugins:pack -- plugins/chill_portions
```

Standalone calculator source: [PUFworks-chill_calculator](https://github.com/paraquatsundae/PUFworks-chill_calculator) (`web/`, `src/chillCalculator.ts`). Release binaries stay on that repo's Releases — not a PUF-AM zip.

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
