import { estimateWetnessHoursProxy } from './jiBlightModel';

/** Regional DPIRD station anchors refreshed by Cloud Scheduler (Step 9). */
export const WEATHER_STATION_ANCHORS = [
  { stationCode: 'MA002', name: 'Manjimup', lat: -34.24, lng: 116.14 },
  { stationCode: 'PE001', name: 'Pemberton', lat: -34.44, lng: 116.03 },
  { stationCode: 'BA001', name: 'Balingup', lat: -33.78, lng: 115.98 },
  { stationCode: 'DN001', name: 'Donnybrook', lat: -33.58, lng: 115.82 },
] as const;

export type WeatherStationAnchor = (typeof WEATHER_STATION_ANCHORS)[number];

/** Same nearest-anchor pick used by blight cache / farm chill (Euclidean on lat/lng). */
export function resolveNearestAnchorStation(
  lat?: number,
  lng?: number,
  stationCode?: string
): WeatherStationAnchor {
  if (stationCode) {
    const hit = WEATHER_STATION_ANCHORS.find((s) => s.stationCode === stationCode);
    if (hit) return hit;
  }
  if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)) {
    return WEATHER_STATION_ANCHORS[0];
  }
  let best: WeatherStationAnchor = WEATHER_STATION_ANCHORS[0];
  let bestDist = Infinity;
  for (const anchor of WEATHER_STATION_ANCHORS) {
    const d = Math.hypot(anchor.lat - lat, anchor.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = anchor;
    }
  }
  return best;
}

/** How fresh the hourly “recent” slice must be for clients. */
export const WEATHER_CACHE_MAX_AGE_HOURS = 2;

/** Rolling window refreshed every hour (overlap so late corrections land). */
export const WEATHER_RECENT_REFRESH_DAYS = 14;

/**
 * Historic depth kept in `weather_cache/{station}` for blight / seasonal models.
 * ~2 seasons fits comfortably under Firestore’s 1 MB doc limit.
 */
export const WEATHER_HISTORIC_KEEP_DAYS = 800;

/** DPIRD returns at most ~100 daily rows per request. */
export const DPIRD_PAGE_LIMIT = 100;

export type DayWeather = {
  T: number;
  RH: number;
  R: number;
  WD: number;
  maxHourlyRain: number;
  windSpeed?: number;
  ET0?: number;
};

export type CachedWeatherRecord = {
  stationCode: string;
  stationName: string;
  lastUpdated: string;
  startDate: string;
  endDate: string;
  weatherData: Record<string, DayWeather>;
  /** ISO time of last historic backfill (optional). */
  historicBackfilledAt?: string;
};

export function toLocalISOString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getWeatherDateWindow(days = WEATHER_RECENT_REFRESH_DAYS) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  return {
    startDate: toLocalISOString(startDate),
    endDate: toLocalISOString(endDate),
  };
}

export function getHistoricStartDate(keepDays = WEATHER_HISTORIC_KEEP_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - keepDays);
  return toLocalISOString(d);
}

export function mergeWeatherData(
  base: Record<string, DayWeather>,
  patch: Record<string, DayWeather>
): Record<string, DayWeather> {
  return { ...base, ...patch };
}

export function weatherDataBounds(weatherData: Record<string, DayWeather>): {
  startDate: string | null;
  endDate: string | null;
  dayCount: number;
} {
  const keys = Object.keys(weatherData).sort();
  if (keys.length === 0) {
    return { startDate: null, endDate: null, dayCount: 0 };
  }
  return { startDate: keys[0], endDate: keys[keys.length - 1], dayCount: keys.length };
}

function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True if cache has a day key for every calendar day in [startDate, endDate]. */
export function cacheCoversRange(
  weatherData: Record<string, DayWeather>,
  startDate: string,
  endDate: string,
  /** Allow this many missing days (station outages) before treating as a gap. */
  maxMissing = 5
): boolean {
  if (!startDate || !endDate || startDate > endDate) return false;
  let missing = 0;
  let key = startDate;
  while (key <= endDate) {
    if (!weatherData[key]) missing += 1;
    if (missing > maxMissing) return false;
    key = addUtcDays(key, 1);
  }
  return true;
}

/**
 * Fetch DPIRD daily summaries with pagination (limit 100/page).
 * Without this, long ranges silently truncate to the first ~100 days.
 */
export async function fetchDpirdDailySummaries(
  apiKey: string,
  stationCode: string,
  startDate: string,
  endDate: string,
  options?: { maxPages?: number }
): Promise<CachedWeatherRecord['weatherData']> {
  const weatherData: CachedWeatherRecord['weatherData'] = {};
  const maxPages = options?.maxPages ?? 40;
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const dataUrl =
      `https://api.agric.wa.gov.au/v2/weather/stations/summaries/daily` +
      `?startDate=${startDate}&endDate=${endDate}&stationCode=${stationCode}` +
      `&limit=${DPIRD_PAGE_LIMIT}&offset=${offset}`;

    const response = await fetch(dataUrl, {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`DPIRD summaries failed for ${stationCode}: HTTP ${response.status}`);
    }

    const dataJson = await response.json();
    const summaries = dataJson.collection?.[0]?.summaries || [];
    if (summaries.length === 0) break;

    for (const obs of summaries) {
      if (!obs.period) continue;
      const dateKey = toDateKey(obs.period.year, obs.period.month, obs.period.day);
      const R = obs.rainfall ?? 0;
      const RH = obs.relativeHumidity?.avg ?? 60;
      weatherData[dateKey] = {
        T: obs.airTemperature?.avg ?? 15,
        RH,
        R,
        // Interim LWD proxy (Ji notebook) until hourly / on-farm wetness — not rain?10:0
        WD: estimateWetnessHoursProxy(R, RH),
        maxHourlyRain: R > 0 ? R * 0.2 : 0,
        windSpeed: obs.wind?.[0]?.avg?.speed ?? 10,
        ET0: obs.evapotranspiration?.shortCrop ?? 3,
      };
    }

    if (summaries.length < DPIRD_PAGE_LIMIT) break;
    offset += DPIRD_PAGE_LIMIT;
  }

  return weatherData;
}

export function isCacheFresh(lastUpdated: string, maxAgeHours = WEATHER_CACHE_MAX_AGE_HOURS) {
  const updated = new Date(lastUpdated);
  const hours = (Date.now() - updated.getTime()) / (1000 * 60 * 60);
  return hours < maxAgeHours;
}

export type HourlyTempPoint = {
  time: string;
  temperature: number;
};

function toDpirdDateTimeParam(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** DPIRD hourly default page is tiny (~25); request/paginate explicitly. */
export const DPIRD_HOURLY_PAGE_LIMIT = 100;

type DpirdHourlySummary = {
  period?: { to?: string; from?: string };
  airTemperature?: { avg?: number };
};

/**
 * Fetch DPIRD hourly air temperatures with limit/offset pagination.
 * Uses airTemperature.avg (°C) — required for Dynamic Model chill portions.
 *
 * Windows are chunked (~4 days ≈ 96 hours) so each page stays under the API limit.
 */
async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchDpirdJsonWithRetry(
  url: string,
  apiKey: string,
  options?: { retryOn429?: boolean; label?: string }
): Promise<unknown> {
  const retryOn429 = options?.retryOn429 !== false;
  let attempt = 0;
  while (true) {
    const response = await fetch(url, {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    });
    if (response.ok) return response.json();

    if (response.status === 429 && retryOn429 && attempt < 6) {
      const backoff = Math.min(30_000, 1500 * 2 ** attempt);
      console.warn(`[dpird] 429 ${options?.label || ''} — retry in ${backoff}ms`);
      await sleep(backoff);
      attempt += 1;
      continue;
    }

    throw new Error(
      `DPIRD hourly failed${options?.label ? ` (${options.label})` : ''}: HTTP ${response.status}`
    );
  }
}

export async function fetchDpirdHourlyTemps(
  apiKey: string,
  stationCode: string,
  start: Date,
  end: Date,
  options?: {
    chunkDays?: number;
    maxPagesPerChunk?: number;
    concurrency?: number;
    retryOn429?: boolean;
  }
): Promise<HourlyTempPoint[]> {
  if (end.getTime() <= start.getTime()) return [];

  const chunkDays = options?.chunkDays ?? 4;
  const chunkMs = chunkDays * 86400000;
  const maxPages = options?.maxPagesPerChunk ?? 20;
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const points: HourlyTempPoint[] = [];
  const seen = new Set<string>();

  const chunks: Array<{ start: Date; end: Date }> = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += chunkMs) {
    chunks.push({
      start: new Date(cursor),
      end: new Date(Math.min(cursor + chunkMs, end.getTime())),
    });
  }

  const fetchChunkPages = async (chunkStart: Date, chunkEnd: Date): Promise<DpirdHourlySummary[]> => {
    const out: DpirdHourlySummary[] = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const dataUrl =
        `https://api.agric.wa.gov.au/v2/weather/stations/summaries/hourly` +
        `?startDateTime=${encodeURIComponent(toDpirdDateTimeParam(chunkStart))}` +
        `&endDateTime=${encodeURIComponent(toDpirdDateTimeParam(chunkEnd))}` +
        `&stationCode=${encodeURIComponent(stationCode)}` +
        `&limit=${DPIRD_HOURLY_PAGE_LIMIT}&offset=${offset}`;

      const dataJson = (await fetchDpirdJsonWithRetry(dataUrl, apiKey, {
        retryOn429: options?.retryOn429,
        label: `${stationCode} ${toLocalISOString(chunkStart)}→${toLocalISOString(chunkEnd)} offset=${offset}`,
      })) as { collection?: Array<{ summaries?: DpirdHourlySummary[] }> };

      const summaries = dataJson.collection?.[0]?.summaries || [];
      if (summaries.length === 0) break;
      out.push(...summaries);
      if (summaries.length < DPIRD_HOURLY_PAGE_LIMIT) break;
      offset += DPIRD_HOURLY_PAGE_LIMIT;
    }
    return out;
  };

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ start: chunkStart, end: chunkEnd }) => fetchChunkPages(chunkStart, chunkEnd))
    );

    for (const summaries of batchResults) {
      for (const s of summaries) {
        const time = s.period?.to || s.period?.from;
        const temperature = s.airTemperature?.avg;
        if (!time || temperature === null || temperature === undefined) continue;
        const key = String(time);
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({ time: key, temperature: Number(temperature) });
      }
    }

    // Small pause between batches to stay under DPIRD rate limits
    if (i + concurrency < chunks.length) await sleep(350);
  }

  points.sort((a, b) => a.time.localeCompare(b.time));
  return points;
}

/**
 * Prune days older than keepDays so the Firestore doc stays small.
 */
export function pruneWeatherData(
  weatherData: Record<string, DayWeather>,
  keepDays = WEATHER_HISTORIC_KEEP_DAYS
): Record<string, DayWeather> {
  const cutoff = getHistoricStartDate(keepDays);
  const next: Record<string, DayWeather> = {};
  for (const [key, value] of Object.entries(weatherData)) {
    if (key >= cutoff) next[key] = value;
  }
  return next;
}
