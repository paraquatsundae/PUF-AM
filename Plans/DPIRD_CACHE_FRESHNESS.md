# DPIRD cache freshness — ensure-cache, chill, dryer hourly

**Product:** PUF-AM — Ag Manager  
**Status:** Design only — no code yet  
**Date:** 2026-08-24  
**Companion:** [`API_KEY_SECURITY.md`](API_KEY_SECURITY.md) · [`CHILL_PORTIONS_PLUGIN.md`](CHILL_PORTIONS_PLUGIN.md) · [`BLIGHT_ENGINE_PLUGIN.md`](BLIGHT_ENGINE_PLUGIN.md) · [`LOCAL_DATA_STORAGE.md`](LOCAL_DATA_STORAGE.md)

Walnut blight’s **daily** path is already conservative. This note is the remaining DPIRD overcall surface: workshop `ensure-cache`, chill’s first-fill / completed-season leaks, and the dryer raw hourly proxy.

---

## What is already fine (blight daily)

| Knob | Value | Where |
|------|--------|--------|
| Production refresh | every **60 minutes** (Australia/Perth) | `functions/src/weatherScheduler.ts` → `refreshWeatherCache` |
| Client “fresh” | **2 hours** | `WEATHER_CACHE_MAX_AGE_HOURS` in `shared/weather/dpirdClient.ts` |
| Hourly job window | last **14 days** of **daily** summaries | `WEATHER_RECENT_REFRESH_DAYS` |
| Historic depth | **~800 days**, one-shot when thin | `WEATHER_HISTORIC_KEEP_DAYS` |
| Stations | **4 anchors**: MA002, PE001, BA001, DN001 | `WEATHER_STATION_ANCHORS` |
| Forecast (not DPIRD) | MET Norway; stale after **6 hours** | `FORECAST_MAX_AGE_HOURS` |

Steady-state blight cost: about **4 DPIRD daily-summary calls per hour**. Clients read Firestore `weather_cache/{station}` (plus IDB / SDK cache). The Blight **Refresh** button is a model recalc — it does not re-hit DPIRD.

Production blight snaps the picker onto the nearest of those four anchors (`resolveNearestAnchorStation`). The key stays server-only (`DPIRD_API_KEY`; never `VITE_*`). Packaged desktop / APK send `/api/weather/*` to Cloud Run.

---

## Two “plugin” words

Do not mix this note with Freenet host plugins. Walnut blight and chill portions are **crop packs**. DPIRD is a shared weather service those packs consume.

---

## Slice 1 — freshness gate on `ensure-cache`

**Problem.** `POST /api/weather/ensure-cache` always calls DPIRD when invoked:

- thin / gappy doc → historic pull (requested range)
- otherwise → still pulls the last 14 days
- always writes `lastUpdated = now`

`POST /api/weather/ensure-forecast` already skips when the forecast is under 6 hours (`mode: cached`). Daily ensure-cache has no equivalent.

**Who calls it**

| Caller | When | Client already gated? |
|--------|------|------------------------|
| `fetchEnvironmentalData` | **Dev only**, cache missing or range not covered | Coverage only — not a time gate |
| Settings → Files → cache weather offline (`cacheWeatherForOffline`) | **Always**, even if the Cloud Function already filled ~800 days | No |
| Production blight page | Does not call this | — |

Repeated offline-weather taps hit Cloud Run and cost a 14-day DPIRD pull each time.

**Acceptance**

- If `isCacheFresh(lastUpdated)` (**2 hours**) **and** `cacheCoversRange(...)` → `{ mode: 'cached' }`, no DPIRD.
- Historic pull only when the doc is actually thin or gappy.
- Keep `forceHistoric`; add `force` for an intentional refresh.
- Gate lives **on the server**. The offline-weather button bypasses the blight client path.

Reuse `WEATHER_CACHE_MAX_AGE_HOURS` / `isCacheFresh` / `cacheCoversRange`. Do not invent a second freshness number.

---

## Slice 2 — dryer: stop using the raw hourly proxy

**Problem.** Harvest dryer ambient T uses:

`GET /api/weather/dpird/stations/summaries/hourly?…&stationCode=MA002`

(`src/components/DryerPerformance.tsx` → `server/createApiApp.ts` passthrough.)

That route attaches the key and forwards. No TTL, no store, no pagination.

| Issue | Effect |
|-------|--------|
| Every open of the temperature tab | Live DPIRD, including **completed** sessions |
| No `limit` / `offset` | DPIRD hourly pages are small (~25). A multi-day dry **silently truncates** |
| Hardcoded `MA002` | Ignores farm `dpirdStationCode` |
| Cloud-routed | APK / packaged desktop hit Cloud Run every time |
| Cannot reuse `weather_cache` | That store is **daily** |
| Weak overlap with chill | Harvest is often after Sep; `chill_cache` is Mar–Sep |

This is both a **rate** problem and a **correctness** problem.

**Acceptance**

- Paginated hourly fetch (`fetchDpirdHourlyTemps` — same helper chill uses).
- Cache by `sessionId` + station + start/end (new small store or session-scoped field — **not** a second copy of `weather_cache` daily rows).
- Completed sessions: write once, never refetch.
- Active sessions: 1–2 hour freshness (align with blight’s 2-hour label).
- Honour farm `dpirdStationCode` when set; fall back to MA002.
- Leave `/api/weather/dpird/*` for the **station directory** only (already in-memory for the page).

---

## Slice 3 — chill: freeze completed seasons + cheap client coalescing

Chill does **not** use the raw proxy. `GET /api/weather/chill-portions` already has:

| Layer | TTL | Behaviour |
|-------|-----|-----------|
| Process memory | **1 hour** | Same Cloud Run instance |
| Firestore `chill_cache/{station}_{season}` | **6 hours** | Shared across instances |
| Stale but present | Incremental tail (6 h overlap) | Not a full Mar–Sep refetch |
| Pagination | 4-day chunks, 100/page, 350 ms pause, 429 backoff | Polite |
| Client `refresh()` | Does **not** send `force=1` | Good |

**Remaining leaks**

- First miss for a station is Mar–now hourly (dozens of DPIRD pages). After that, 6-hour incremental is cheap.
- Dashboard, Map, and the Chill page each call `useFarmChillPortions` with **no client cache** — three Cloud Run hits per session; server cache usually absorbs them.
- **Any** DPIRD station (not the four blight anchors). Each new picker choice is a new full fetch.
- Oct–Feb is a **completed** season (`isCompleteSeason`, end = 30 Sep). After one fill, the 6-hour timer still “refreshes” a window that cannot grow.

**Acceptance**

- If `isCompleteSeason` and `chill_cache` already covers 1 Mar–30 Sep → never refetch unless `force`.
- Optional in-memory client cache in `useFarmChillPortions` so Dashboard / Map / Chill do not triple-hit Cloud Run on first paint.
- Do **not** invent a second hourly store for chill until the dryer has its own (slice 2).

---

## Build order

| ID | Slice | Why this order |
|----|--------|----------------|
| `DC-01` | `ensure-cache` 2-hour skip | Small; same constants as blight; closes workshop + offline-button loop |
| `DC-02` | Dryer paginated hourly + session cache | Highest overcall + silent truncation during harvest |
| `DC-03` | Chill completed-season freeze + client coalesce | Chill is already gated; this is leftover winter / first-paint waste |

---

## Non-goals

- Changing the blight hourly Cloud Function cadence (keep 60 minutes / 14-day window / 4 anchors).
- Putting `DPIRD_API_KEY` on the client or bringing back `VITE_DPIRD_API_KEY`.
- Hot-loading weather from a crop-pack zip.
- Using Freenet as a DPIRD cache.
- Replacing `weather_cache` daily docs with hourly rows (Firestore 1 MB limit; blight does not need hourly).

---

## Progress log

| Date | Slice | Notes |
|------|-------|--------|
| 2026-08-24 | — | Design note after walnut blight / DPIRD assessment. No code. |
