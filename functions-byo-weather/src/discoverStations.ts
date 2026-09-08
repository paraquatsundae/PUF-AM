import {
  WEATHER_STATION_ANCHORS,
  type WeatherStationAnchor,
} from '../../shared/weather/dpirdClient';
import { MAX_REFRESH_STATIONS } from './constants';
import { sanitizeStationCode } from './stationCode';
import type { WeatherDb } from './weatherDb';

export type RefreshTarget = {
  stationCode: string;
  stationName: string;
  lat?: number;
  lng?: number;
};

function anchorFor(code: string): WeatherStationAnchor | undefined {
  return WEATHER_STATION_ANCHORS.find((s) => s.stationCode === code);
}

function upsert(map: Map<string, RefreshTarget>, next: RefreshTarget): void {
  const existing = map.get(next.stationCode);
  if (!existing) {
    map.set(next.stationCode, next);
    return;
  }
  map.set(next.stationCode, {
    stationCode: next.stationCode,
    stationName: existing.stationName !== existing.stationCode ? existing.stationName : next.stationName,
    lat: existing.lat ?? next.lat,
    lng: existing.lng ?? next.lng,
  });
}

function targetFromCode(code: string, name?: string): RefreshTarget | null {
  const stationCode = sanitizeStationCode(code);
  if (!stationCode) return null;
  const anchor = anchorFor(stationCode);
  return {
    stationCode,
    stationName: name?.trim() || anchor?.name || stationCode,
    lat: anchor?.lat,
    lng: anchor?.lng,
  };
}

/**
 * Stations this project's hourly job should refresh.
 *
 * Prefer farm-chosen DPIRD codes and cache docs already written by ensure-cache.
 * Fall back to the four SW anchors so a first deploy still fills something
 * before anyone opens blight.
 */
export async function discoverRefreshStations(db: WeatherDb): Promise<RefreshTarget[]> {
  const found = new Map<string, RefreshTarget>();

  try {
    const farms = await db.collection('farms').get();
    for (const farm of farms.docs) {
      const data = (farm.data() || {}) as Record<string, unknown>;
      const fromFarm = targetFromCode(String(data.weatherStationCode || ''), String(data.weatherStationName || ''));
      if (fromFarm) upsert(found, fromFarm);

      const farmId = farm.id;
      if (!farmId) continue;
      try {
        const settings = await db.doc(`farms/${farmId}/settings/farm`).get();
        const settingsData = (settings.data() || {}) as Record<string, unknown>;
        const fromSettings = targetFromCode(
          String(settingsData.dpirdStationCode || ''),
          String(settingsData.dpirdStationName || '')
        );
        if (fromSettings) upsert(found, fromSettings);
      } catch {
        // settings doc missing is normal
      }
    }
  } catch {
    // empty project
  }

  try {
    const cache = await db.collection('weather_cache').select('stationName', 'stationCode').get();
    for (const doc of cache.docs) {
      const data = (doc.data() || {}) as Record<string, unknown>;
      const fromCache = targetFromCode(doc.id || String(data.stationCode || ''), String(data.stationName || ''));
      if (fromCache) upsert(found, fromCache);
    }
  } catch {
    // empty cache
  }

  if (found.size === 0) {
    return WEATHER_STATION_ANCHORS.map((s) => ({
      stationCode: s.stationCode,
      stationName: s.name,
      lat: s.lat,
      lng: s.lng,
    }));
  }

  return [...found.values()].slice(0, MAX_REFRESH_STATIONS);
}
