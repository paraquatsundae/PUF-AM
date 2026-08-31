/**
 * Device-local weather pack (IndexedDB) — mirror of Firestore weather_cache.
 */
import { doc, getDoc } from 'firebase/firestore';
import type { CachedWeatherRecord } from '../../shared/weather/dpirdClient';
import {
  WEATHER_STATION_ANCHORS,
  resolveNearestAnchorStation,
  toLocalISOString,
} from '../../shared/weather/dpirdClient';
import { db } from '../firebase';
import { apiFetch, apiUrl } from './apiBase';

const DB_NAME = 'pufom_weather_cache';
const DB_VERSION = 1;
const STORE = 'stations';

export type WeatherIdbRow = CachedWeatherRecord & {
  stationCode: string;
  mirroredAt: string;
};

export function weatherIdbKey(stationCode: string): string {
  return stationCode.trim().toUpperCase();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('weather IDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'stationCode' });
      }
    };
  });
}

export async function saveWeatherToIdb(record: CachedWeatherRecord): Promise<void> {
  const row: WeatherIdbRow = {
    ...record,
    stationCode: weatherIdbKey(record.stationCode),
    mirroredAt: new Date().toISOString(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readWeatherFromIdb(
  stationCode: string
): Promise<WeatherIdbRow | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(weatherIdbKey(stationCode));
    req.onsuccess = () => resolve((req.result as WeatherIdbRow) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getWeatherCacheMeta(stationCode?: string): Promise<{
  stationCode: string;
  updatedAt: string;
  dayCount: number;
} | null> {
  if (stationCode) {
    const row = await readWeatherFromIdb(stationCode);
    if (!row) return null;
    return {
      stationCode: row.stationCode,
      updatedAt: row.mirroredAt || row.lastUpdated,
      dayCount: Object.keys(row.weatherData || {}).length,
    };
  }
  const db = await openDb();
  const rows = await new Promise<WeatherIdbRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as WeatherIdbRow[]) || []);
    req.onerror = () => reject(req.error);
  });
  if (!rows.length) return null;
  rows.sort((a, b) =>
    (b.mirroredAt || b.lastUpdated).localeCompare(a.mirroredAt || a.lastUpdated)
  );
  const best = rows[0];
  return {
    stationCode: best.stationCode,
    updatedAt: best.mirroredAt || best.lastUpdated,
    dayCount: Object.keys(best.weatherData || {}).length,
  };
}

/**
 * Ensure Firestore weather_cache is filled (dev/LAN), then mirror into IndexedDB.
 */
export async function cacheWeatherForOffline(opts?: {
  stationCode?: string;
  lat?: number;
  lng?: number;
  daysBack?: number;
}): Promise<{ stationCode: string; dayCount: number }> {
  const anchor = resolveNearestAnchorStation(opts?.lat, opts?.lng, opts?.stationCode);
  const stationCode = anchor.stationCode;
  const daysBack = opts?.daysBack ?? 120;
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const startDate = toLocalISOString(start);
  const endDate = toLocalISOString(end);

  try {
    await apiFetch(apiUrl('/api/weather/ensure-cache'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationCode, startDate, endDate }),
      timeoutMs: 60000,
    });
  } catch (err) {
    console.warn('[weatherCacheIdb] ensure-cache failed', err);
  }

  const cacheSnap = await getDoc(doc(db, 'weather_cache', stationCode));
  if (!cacheSnap.exists()) {
    throw new Error(
      `No weather_cache for ${stationCode}. Need network + Express ensure-cache or Cloud Scheduler.`
    );
  }
  const record = cacheSnap.data() as CachedWeatherRecord;
  if (!record.weatherData || Object.keys(record.weatherData).length === 0) {
    throw new Error(`weather_cache for ${stationCode} is empty.`);
  }
  await saveWeatherToIdb({ ...record, stationCode });
  return {
    stationCode,
    dayCount: Object.keys(record.weatherData).length,
  };
}

export function defaultOfflineWeatherStation(): string {
  return WEATHER_STATION_ANCHORS[0].stationCode;
}
