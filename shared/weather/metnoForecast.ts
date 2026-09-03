/**
 * MET Norway Locationforecast 2.0 → daily forecast rows for the blight engine.
 *
 * The DPIRD public Weather 2.0 API is observations-only; the forecast shown on
 * weather.agric.wa.gov.au is sourced from a third-party provider. DPIRD's own
 * tooling (weatherOz) uses MET Norway for AU forecasts, so we do the same and
 * feed the result through the identical `estimateWetnessHoursProxy` → Ji path as
 * observed days. This keeps forecast and historical scoring on one model.
 *
 * MET Norway ToS require a descriptive User-Agent and polite caching, so this is
 * only ever called server-side (Express dev route + Cloud Function), never from
 * the browser.
 */

import { estimateWetnessHoursProxy } from './wetnessProxy';
import type { DayWeather } from './dpirdClient';

/** WA has no DST — a fixed +8h offset maps MET Norway UTC steps to local days. */
export const PERTH_UTC_OFFSET_HOURS = 8;

/** Re-fetch the forecast if the cached copy is older than this. */
export const FORECAST_MAX_AGE_HOURS = 6;

/** MET Norway Locationforecast 2.0 compact endpoint (JSON, no API key). */
export const METNO_COMPACT_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * MET Norway requires a unique, descriptive User-Agent with contact info.
 * Requests without one are throttled/blocked.
 */
export function buildMetnoUserAgent(contact = 'github.com/paraquatsundae'): string {
  return `PUFOM-WalnutFarmManager/1.0 ${contact}`;
}

export type MetnoDetails = {
  air_temperature?: number;
  relative_humidity?: number;
  precipitation_amount?: number;
};

export type MetnoTimeseriesEntry = {
  time: string;
  data?: {
    instant?: { details?: MetnoDetails };
    next_1_hours?: { details?: MetnoDetails };
    next_6_hours?: { details?: MetnoDetails };
  };
};

export type MetnoResponse = {
  properties?: {
    timeseries?: MetnoTimeseriesEntry[];
  };
};

function toLocalDateKey(isoUtc: string, offsetHours: number): string | null {
  const t = Date.parse(isoUtc);
  if (Number.isNaN(t)) return null;
  const local = new Date(t + offsetHours * 3600_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type DayAccumulator = {
  tempSum: number;
  tempCount: number;
  rhSum: number;
  rhCount: number;
  rainSum: number;
  /** Max single-hour rain (from next_1_hours only — 6h blocks would overstate). */
  maxHourlyRain: number;
  /** Number of precip buckets seen (guards against empty tail days). */
  precipBuckets: number;
};

/**
 * Aggregate MET Norway hourly/6-hourly steps into daily {@link DayWeather} rows,
 * bucketed by Perth-local calendar day. Pure + deterministic for unit testing.
 *
 * Precipitation prefers `next_1_hours` (early period) and falls back to
 * `next_6_hours` (later period) so each step is counted exactly once.
 */
export function aggregateMetnoToDaily(
  timeseries: MetnoTimeseriesEntry[] | undefined,
  offsetHours: number = PERTH_UTC_OFFSET_HOURS
): Record<string, DayWeather> {
  const acc = new Map<string, DayAccumulator>();

  for (const entry of timeseries ?? []) {
    const key = toLocalDateKey(entry.time, offsetHours);
    if (!key) continue;

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
    } else if (next6 !== undefined && next6 !== null) {
      day.rainSum += next6;
      day.precipBuckets += 1;
    }
  }

  const out: Record<string, DayWeather> = {};
  for (const [key, day] of acc) {
    // Need at least a temperature reading to be a usable forecast day.
    if (day.tempCount === 0) continue;
    const T = day.tempSum / day.tempCount;
    const RH = day.rhCount > 0 ? day.rhSum / day.rhCount : 60;
    const R = Number(day.rainSum.toFixed(2));
    // If we only had 6-hourly blocks, approximate a peak-hour intensity.
    const maxHourlyRain = day.maxHourlyRain > 0 ? day.maxHourlyRain : R > 0 ? R * 0.2 : 0;
    out[key] = {
      T: Number(T.toFixed(1)),
      RH: Number(RH.toFixed(1)),
      R,
      WD: Number(estimateWetnessHoursProxy(R, RH).toFixed(1)),
      maxHourlyRain: Number(maxHourlyRain.toFixed(1)),
    };
  }

  return out;
}

export type FetchMetnoOptions = {
  lat: number;
  lng: number;
  userAgent?: string;
  offsetHours?: number;
  /** Injectable fetch (defaults to global fetch) for testing / Node. */
  fetchImpl?: typeof fetch;
};

export type MetnoForecastResult = {
  forecastData: Record<string, DayWeather>;
  fetchedAt: string;
};

/** Fetch MET Norway and aggregate to daily rows. Throws on non-2xx. */
export async function fetchMetnoDailyForecast(
  options: FetchMetnoOptions
): Promise<MetnoForecastResult> {
  const { lat, lng, userAgent = buildMetnoUserAgent(), offsetHours, fetchImpl = fetch } = options;
  const url = `${METNO_COMPACT_URL}?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;

  const res = await fetchImpl(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`MET Norway forecast failed (${lat},${lng}): HTTP ${res.status}`);
  }

  const json = (await res.json()) as MetnoResponse;
  return {
    forecastData: aggregateMetnoToDaily(json.properties?.timeseries, offsetHours),
    fetchedAt: new Date().toISOString(),
  };
}

/** True if a cached forecast timestamp is older than the max age. */
export function isForecastStale(
  forecastUpdatedAt: string | undefined,
  maxAgeHours = FORECAST_MAX_AGE_HOURS
): boolean {
  if (!forecastUpdatedAt) return true;
  const updated = Date.parse(forecastUpdatedAt);
  if (Number.isNaN(updated)) return true;
  return (Date.now() - updated) / 3600_000 >= maxAgeHours;
}
