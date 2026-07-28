import { doc, getDoc, getDocFromCache } from 'firebase/firestore';
import { db } from '../firebase';
import { WeatherData } from './blightModel';
import { trackMetric } from '../services/metricsService';
import { apiUrl } from './apiBase';
import {
  WEATHER_CACHE_MAX_AGE_HOURS,
  WEATHER_STATION_ANCHORS,
  cacheCoversRange,
  isCacheFresh,
  resolveNearestAnchorStation,
  toLocalISOString,
  type CachedWeatherRecord,
  type DayWeather,
} from '../../shared/weather/dpirdClient';
import { estimateWetnessHoursProxy } from '../../shared/weather/jiBlightModel';
import { isForecastStale } from '../../shared/weather/metnoForecast';
import { readWeatherFromIdb, saveWeatherToIdb } from './weatherCacheIdb';

export type WeatherSource = 'Manual' | 'DPIRD';

const isDev = import.meta.env.DEV;

export async function fetchWithTimeout(
  resource: RequestInfo | URL,
  options: RequestInit & { timeout?: number } = {}
) {
  const { timeout = 60000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...fetchOptions,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: unknown) {
    clearTimeout(id);
    console.error(`[fetchWithTimeout] Failed to fetch ${resource}:`, error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  }
}

function resolveStationCode(stationCode?: string, lat?: number, lng?: number): string {
  return resolveNearestAnchorStation(lat, lng, stationCode).stationCode;
}

/** Read shared weather cache written by Cloud Scheduler / ensure-cache. */
export async function readSharedWeatherCache(
  stationCode: string
): Promise<(CachedWeatherRecord & { isStale: boolean }) | null> {
  const wrap = (data: CachedWeatherRecord) => {
    const fresh = data.lastUpdated
      ? isCacheFresh(data.lastUpdated, WEATHER_CACHE_MAX_AGE_HOURS)
      : false;
    return { ...data, isStale: !fresh };
  };

  try {
    const cacheRef = doc(db, 'weather_cache', stationCode);
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      const data = cacheSnap.data() as CachedWeatherRecord;
      void saveWeatherToIdb({ ...data, stationCode }).catch(() => undefined);
      return wrap(data);
    }
  } catch (error) {
    console.warn('[Weather] Live weather_cache read failed — trying cache/IDB', error);
    try {
      const cacheRef = doc(db, 'weather_cache', stationCode);
      const fromSdk = await getDocFromCache(cacheRef);
      if (fromSdk.exists()) {
        const data = fromSdk.data() as CachedWeatherRecord;
        void saveWeatherToIdb({ ...data, stationCode }).catch(() => undefined);
        return wrap(data);
      }
    } catch {
      /* no SDK cache */
    }
  }

  try {
    const idb = await readWeatherFromIdb(stationCode);
    if (idb?.weatherData && Object.keys(idb.weatherData).length > 0) {
      console.log(`[Weather] Using IndexedDB pack for ${stationCode}`);
      return wrap(idb);
    }
  } catch (err) {
    console.warn('[Weather] IDB weather read failed', err);
  }
  return null;
}

/**
 * Dev/workshop: ask Express to backfill historic (once) or refresh recent days
 * into weather_cache, then clients keep reading Firestore.
 */
async function ensureSharedCache(
  stationCode: string,
  startDate: string,
  endDate: string
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/api/weather/ensure-cache'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationCode, startDate, endDate }),
    });
    if (!res.ok) {
      console.warn('[Weather] ensure-cache failed:', res.status, await res.text());
      return false;
    }
    const body = await res.json();
    console.log(
      `[Weather] ensure-cache ${stationCode}: ${body.mode}, ${body.dayCount} days ` +
        `(${body.startDate} → ${body.endDate})`
    );
    return true;
  } catch (err) {
    console.warn('[Weather] ensure-cache error:', err);
    return false;
  }
}

/**
 * Dev/workshop: ask Express to refresh the MET Norway forecast slice into
 * weather_cache. Production relies on the hourly Cloud Function.
 */
async function ensureForecast(stationCode: string, lat: number, lng: number): Promise<void> {
  try {
    const res = await fetch(apiUrl('/api/weather/ensure-forecast'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationCode, lat, lng }),
    });
    if (!res.ok) {
      console.warn('[Weather] ensure-forecast failed:', res.status, await res.text());
      return;
    }
    const body = await res.json();
    console.log(`[Weather] ensure-forecast ${stationCode}: ${body.mode}`);
  } catch (err) {
    console.warn('[Weather] ensure-forecast error:', err);
  }
}

export async function fetchEnvironmentalData(
  farmId: string,
  source: WeatherSource,
  startDate: Date,
  endDate: Date,
  defaultLat: number = -34.24,
  defaultLng: number = 116.14,
  stationCode?: string,
  blocks?: unknown[],
  sprayEvents?: unknown,
  irrigationEvents?: unknown,
  calibration?: unknown,
  defaultIrrigationType?: string
): Promise<{
  weatherData: Record<string, WeatherData>;
  lastUpdated?: string;
  cacheSource?: string;
  isStale?: boolean;
  forecastData?: Record<string, WeatherData>;
  forecastUpdatedAt?: string;
}> {
  if (source !== 'DPIRD') {
    return { weatherData: generateFallbackData(startDate, endDate), cacheSource: 'fallback' };
  }

  const resolvedStation = resolveStationCode(stationCode, defaultLat, defaultLng);
  const startKey = toLocalISOString(startDate);
  const endKey = toLocalISOString(endDate);

  // 1. Shared regional cache (historic + recent merge)
  let sharedCache = await readSharedWeatherCache(resolvedStation);
  const cacheData = (sharedCache?.weatherData || {}) as Record<string, DayWeather>;
  const covered = cacheCoversRange(cacheData, startKey, endKey);

  // 2. Dev: fill gaps / bootstrap historic via server (writes weather_cache)
  if (isDev && (!sharedCache || !covered)) {
    await ensureSharedCache(resolvedStation, startKey, endKey);
    sharedCache = await readSharedWeatherCache(resolvedStation);
  }

  // 2b. Dev: refresh MET Norway forecast slice if missing/stale, then re-read.
  if (isDev && isForecastStale(sharedCache?.forecastUpdatedAt)) {
    const anchor = resolveNearestAnchorStation(defaultLat, defaultLng, resolvedStation);
    await ensureForecast(resolvedStation, anchor.lat, anchor.lng);
    sharedCache = await readSharedWeatherCache(resolvedStation);
  }

  const forecastFields = sharedCache?.forecastData
    ? {
        forecastData: sharedCache.forecastData as Record<string, WeatherData>,
        forecastUpdatedAt: sharedCache.forecastUpdatedAt,
      }
    : {};

  if (sharedCache?.weatherData && Object.keys(sharedCache.weatherData).length > 0) {
    const data = sharedCache.weatherData as Record<string, WeatherData>;
    const nowCovered = cacheCoversRange(data, startKey, endKey);
    if (nowCovered || Object.keys(data).length > 30) {
      // Prefer cache even if slightly gappy — blight can tolerate a few missing days
      if (!sharedCache.isStale || !isDev) {
        console.log(
          `[Weather] Using shared cache for ${resolvedStation}` +
            (sharedCache.isStale ? ' (stale)' : '')
        );
        return {
          weatherData: data,
          lastUpdated: sharedCache.lastUpdated,
          cacheSource: sharedCache.isStale ? 'weather_cache_stale' : 'weather_cache',
          isStale: sharedCache.isStale,
          ...forecastFields,
        };
      }
      // Dev + stale: still use cache for history, then optionally refresh via blight-risk below
      if (nowCovered) {
        return {
          weatherData: data,
          lastUpdated: sharedCache.lastUpdated,
          cacheSource: 'weather_cache_stale',
          isStale: true,
          ...forecastFields,
        };
      }
    }
  }

  // 3. Per-farm environmental cache (legacy)
  const cacheKey = `dpird_${resolvedStation}`;
  const cacheRef = doc(db, `farms/${farmId}/environmental_cache/${cacheKey}`);
  try {
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      const cacheDataFarm = cacheSnap.data();
      if (
        cacheDataFarm.lastUpdated &&
        isCacheFresh(cacheDataFarm.lastUpdated, WEATHER_CACHE_MAX_AGE_HOURS) &&
        cacheDataFarm.weatherData
      ) {
        console.log('[Weather] Using per-farm environmental cache');
        return {
          weatherData: cacheDataFarm.weatherData as Record<string, WeatherData>,
          lastUpdated: cacheDataFarm.lastUpdated,
          cacheSource: 'environmental_cache',
          isStale: false,
        };
      }
    }
  } catch (err) {
    console.error('[Weather] Per-farm cache read failed:', err);
  }

  // 4. Dev-only: server blight-risk (also hits DPIRD; prefer ensure-cache above)
  if (isDev) {
    console.log('[Weather] Dev fallback: calling backend blight-risk endpoint');
    try {
      const response = await fetch(apiUrl('/api/weather/blight-risk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmId,
          lat: defaultLat,
          lng: defaultLng,
          startDate: startKey,
          endDate: endKey,
          stationCode: resolvedStation,
          blocks,
          sprayEvents,
          irrigationEvents,
          calibration,
          defaultIrrigationType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.weatherData) {
          return {
            weatherData: data.weatherData as Record<string, WeatherData>,
            lastUpdated: data.lastUpdated,
            cacheSource: 'dev_server',
            isStale: false,
          };
        }
      }
    } catch (err) {
      console.error('[Weather] Dev server fallback failed:', err);
    }
  }

  // 5. Last resort: use whatever shared cache we have, else synthetic
  if (sharedCache?.weatherData && Object.keys(sharedCache.weatherData).length > 0) {
    return {
      weatherData: sharedCache.weatherData as Record<string, WeatherData>,
      lastUpdated: sharedCache.lastUpdated,
      cacheSource: 'weather_cache_partial',
      isStale: true,
      ...forecastFields,
    };
  }

  console.warn('[Weather] No fresh cache available — using generated fallback data');
  return {
    weatherData: generateFallbackData(startDate, endDate),
    cacheSource: 'fallback',
    isStale: true,
  };
}

export async function fetchWeatherData(
  farmId: string,
  source: WeatherSource,
  startDate: Date,
  endDate: Date,
  defaultLat: number = -34.24,
  defaultLng: number = 116.14,
  stationCode?: string
): Promise<Record<string, WeatherData>> {
  const data = await fetchEnvironmentalData(farmId, source, startDate, endDate, defaultLat, defaultLng, stationCode);
  return data.weatherData;
}

let cachedStations: unknown[] | null = null;

/** Dev-only station list; production should use cached station metadata. */
export async function fetchAllDPIRDStations(): Promise<unknown[]> {
  if (!isDev) {
    return WEATHER_STATION_ANCHORS.map((s) => ({
      stationCode: s.stationCode,
      stationName: s.name,
      status: 'Active',
    }));
  }

  if (cachedStations) return cachedStations;

  try {
    trackMetric('weather').catch(console.error);
    const url = apiUrl('/api/weather/dpird/stations?limit=500');
    const response = await fetchWithTimeout(url);
    if (!response.ok) return [];

    const data = await response.json();
    let stations: unknown[] = data.collection || data.data || data;
    if (!Array.isArray(stations)) stations = [];
    cachedStations = stations;
    return stations;
  } catch (error) {
    console.error('Error fetching all DPIRD stations:', error);
    return [];
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function generateFallbackData(startDate: Date, endDate: Date): Record<string, WeatherData> {
  const data: Record<string, WeatherData> = {};
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  for (let i = 0; i <= totalDays; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dayOfYear = Math.floor((currentDate.getTime() - new Date(year, 0, 0).getTime()) / 86400000);
    const dateKey = toLocalISOString(currentDate);
    const seed = year * 1000 + dayOfYear;

    const T = 15 + 10 * Math.sin((dayOfYear - 100) * (Math.PI / 182.5)) + (seededRandom(seed) * 4 - 2);
    const RH = 60 + (seededRandom(seed + 1) * 30 - 15);
    const isHighSeason = (month >= 2 && month <= 4) || (month >= 8 && month <= 10);
    const R = isHighSeason && seededRandom(seed + 2) > 0.7 ? seededRandom(seed + 3) * 10 : 0;
    const maxHourlyRain = R > 0 ? R * (0.2 + seededRandom(seed + 6) * 0.6) : 0;
    const windSpeed = 5 + seededRandom(seed + 7) * 15 + (R > 0 ? 10 : 0);

    const WD = estimateWetnessHoursProxy(R, RH);

    const ET0 = 3 + 4 * Math.sin((dayOfYear - 100) * (Math.PI / 182.5)) + (seededRandom(seed + 8) * 2 - 1);

    data[dateKey] = {
      T: Number(T.toFixed(1)),
      RH: Number(RH.toFixed(1)),
      R: Number(R.toFixed(1)),
      WD: Number(WD.toFixed(1)),
      maxHourlyRain: Number(maxHourlyRain.toFixed(1)),
      windSpeed: Number(windSpeed.toFixed(1)),
      ET0: Number(Math.max(0.1, ET0).toFixed(2)),
    };
  }

  return data;
}
