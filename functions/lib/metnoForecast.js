"use strict";
/**
 * Cloud Functions mirror of shared/weather/metnoForecast.ts.
 *
 * Functions cannot import from the repo-root `shared/` tree (deploy boundary),
 * so the MET Norway aggregation is duplicated here and kept in lock-step with
 * the shared version by tests/metnoForecast.test.ts (parity on a golden sample).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.METNO_COMPACT_URL = exports.FORECAST_MAX_AGE_HOURS = exports.PERTH_UTC_OFFSET_HOURS = void 0;
exports.buildMetnoUserAgent = buildMetnoUserAgent;
exports.aggregateMetnoToDaily = aggregateMetnoToDaily;
exports.fetchMetnoDailyForecast = fetchMetnoDailyForecast;
exports.isForecastStale = isForecastStale;
const jiBlightModel_1 = require("./jiBlightModel");
/** WA has no DST — a fixed +8h offset maps MET Norway UTC steps to local days. */
exports.PERTH_UTC_OFFSET_HOURS = 8;
/** Re-fetch the forecast if the cached copy is older than this. */
exports.FORECAST_MAX_AGE_HOURS = 6;
/** MET Norway Locationforecast 2.0 compact endpoint (JSON, no API key). */
exports.METNO_COMPACT_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
function buildMetnoUserAgent(contact = "github.com/paraquatsundae") {
    return `PUFOM-WalnutFarmManager/1.0 ${contact}`;
}
function toLocalDateKey(isoUtc, offsetHours) {
    const t = Date.parse(isoUtc);
    if (Number.isNaN(t))
        return null;
    const local = new Date(t + offsetHours * 3600_000);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, "0");
    const d = String(local.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function aggregateMetnoToDaily(timeseries, offsetHours = exports.PERTH_UTC_OFFSET_HOURS) {
    const acc = new Map();
    for (const entry of timeseries ?? []) {
        const key = toLocalDateKey(entry.time, offsetHours);
        if (!key)
            continue;
        let day = acc.get(key);
        if (!day) {
            day = {
                tempSum: 0,
                tempCount: 0,
                rhSum: 0,
                rhCount: 0,
                rainSum: 0,
                maxHourlyRain: 0,
                precipBuckets: 0,
            };
            acc.set(key, day);
        }
        const instant = entry.data?.instant?.details;
        if (instant?.air_temperature !== undefined && instant.air_temperature !== null) {
            day.tempSum += instant.air_temperature;
            day.tempCount += 1;
        }
        if (instant?.relative_humidity !== undefined && instant.relative_humidity !== null) {
            day.rhSum += instant.relative_humidity;
            day.rhCount += 1;
        }
        const next1 = entry.data?.next_1_hours?.details?.precipitation_amount;
        const next6 = entry.data?.next_6_hours?.details?.precipitation_amount;
        if (next1 !== undefined && next1 !== null) {
            day.rainSum += next1;
            day.maxHourlyRain = Math.max(day.maxHourlyRain, next1);
            day.precipBuckets += 1;
        }
        else if (next6 !== undefined && next6 !== null) {
            day.rainSum += next6;
            day.precipBuckets += 1;
        }
    }
    const out = {};
    for (const [key, day] of acc) {
        if (day.tempCount === 0)
            continue;
        const T = day.tempSum / day.tempCount;
        const RH = day.rhCount > 0 ? day.rhSum / day.rhCount : 60;
        const R = Number(day.rainSum.toFixed(2));
        const maxHourlyRain = day.maxHourlyRain > 0 ? day.maxHourlyRain : R > 0 ? R * 0.2 : 0;
        out[key] = {
            T: Number(T.toFixed(1)),
            RH: Number(RH.toFixed(1)),
            R,
            WD: Number((0, jiBlightModel_1.estimateWetnessHoursProxy)(R, RH).toFixed(1)),
            maxHourlyRain: Number(maxHourlyRain.toFixed(1)),
        };
    }
    return out;
}
async function fetchMetnoDailyForecast(options) {
    const { lat, lng, userAgent = buildMetnoUserAgent(), offsetHours } = options;
    const url = `${exports.METNO_COMPACT_URL}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;
    const res = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
    });
    if (!res.ok) {
        throw new Error(`MET Norway forecast failed (${lat},${lng}): HTTP ${res.status}`);
    }
    const json = (await res.json());
    return {
        forecastData: aggregateMetnoToDaily(json.properties?.timeseries, offsetHours),
        fetchedAt: new Date().toISOString(),
    };
}
function isForecastStale(forecastUpdatedAt, maxAgeHours = exports.FORECAST_MAX_AGE_HOURS) {
    if (!forecastUpdatedAt)
        return true;
    const updated = Date.parse(forecastUpdatedAt);
    if (Number.isNaN(updated))
        return true;
    return (Date.now() - updated) / 3600_000 >= maxAgeHours;
}
//# sourceMappingURL=metnoForecast.js.map