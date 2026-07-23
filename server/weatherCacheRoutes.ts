import type { Express, Request, Response } from 'express';
import { getAdminDb } from './firebaseAdmin.ts';
import { getDpirdApiKey } from './envSecrets.ts';
import {
  WEATHER_HISTORIC_KEEP_DAYS,
  WEATHER_RECENT_REFRESH_DAYS,
  WEATHER_STATION_ANCHORS,
  cacheCoversRange,
  fetchDpirdDailySummaries,
  getHistoricStartDate,
  getWeatherDateWindow,
  mergeWeatherData,
  pruneWeatherData,
  weatherDataBounds,
  type DayWeather,
} from '../shared/weather/dpirdClient.ts';
import {
  fetchMetnoDailyForecast,
  isForecastStale,
} from '../shared/weather/metnoForecast.ts';

function resolveStationMeta(stationCode: string) {
  const anchor = WEATHER_STATION_ANCHORS.find((s) => s.stationCode === stationCode);
  return {
    stationCode,
    stationName: anchor?.name ?? stationCode,
  };
}

/**
 * Ensure shared weather_cache has historic depth + a fresh recent slice.
 * Dev / workshop path — production clients should rely on the hourly Cloud Function.
 *
 * POST /api/weather/ensure-cache
 * body: { stationCode, startDate?, endDate?, forceHistoric? }
 */
export function registerWeatherCacheRoutes(app: Express) {
  app.post('/api/weather/ensure-cache', async (req: Request, res: Response) => {
    try {
      const apiKey = getDpirdApiKey();
      if (!apiKey) {
        return res.status(401).json({ error: 'DPIRD API key missing (set DPIRD_API_KEY in .env)' });
      }

      const stationCode = String(req.body?.stationCode || '').trim();
      if (!stationCode) {
        return res.status(400).json({ error: 'stationCode required' });
      }

      const { endDate: todayEnd } = getWeatherDateWindow(0);
      const startDate = String(req.body?.startDate || getHistoricStartDate(WEATHER_HISTORIC_KEEP_DAYS));
      const endDate = String(req.body?.endDate || todayEnd);
      const forceHistoric = Boolean(req.body?.forceHistoric);

      const db = getAdminDb();
      const ref = db.doc(`weather_cache/${stationCode}`);
      const snap = await ref.get();
      let weatherData = {
        ...((snap.exists ? snap.data()?.weatherData : {}) as Record<string, DayWeather>),
      };
      const meta = resolveStationMeta(stationCode);
      const now = new Date().toISOString();
      let historicBackfilledAt = snap.exists
        ? (snap.data()?.historicBackfilledAt as string | undefined)
        : undefined;

      const covers = cacheCoversRange(weatherData, startDate, endDate);
      const bounds = weatherDataBounds(weatherData);
      const needsHistoric =
        forceHistoric ||
        bounds.dayCount < 60 ||
        !bounds.startDate ||
        bounds.startDate > startDate ||
        !covers;

      if (needsHistoric) {
        const historic = await fetchDpirdDailySummaries(apiKey, stationCode, startDate, endDate);
        weatherData = mergeWeatherData(weatherData, historic);
        historicBackfilledAt = now;
      } else {
        // Cheap path: only refresh the recent rolling window
        const recentWindow = getWeatherDateWindow(WEATHER_RECENT_REFRESH_DAYS);
        const recent = await fetchDpirdDailySummaries(
          apiKey,
          stationCode,
          recentWindow.startDate,
          recentWindow.endDate
        );
        weatherData = mergeWeatherData(weatherData, recent);
      }

      weatherData = pruneWeatherData(weatherData, WEATHER_HISTORIC_KEEP_DAYS);
      const nextBounds = weatherDataBounds(weatherData);

      await ref.set(
        {
          stationCode: meta.stationCode,
          stationName: meta.stationName,
          lastUpdated: now,
          startDate: nextBounds.startDate,
          endDate: nextBounds.endDate,
          weatherData,
          ...(historicBackfilledAt ? { historicBackfilledAt } : {}),
        },
        { merge: true }
      );

      return res.json({
        stationCode,
        dayCount: nextBounds.dayCount,
        startDate: nextBounds.startDate,
        endDate: nextBounds.endDate,
        lastUpdated: now,
        mode: needsHistoric ? 'historic_backfill' : 'recent_refresh',
      });
    } catch (error) {
      console.error('[ensure-cache]', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'ensure-cache failed',
      });
    }
  });

  /**
   * Ensure the MET Norway forecast slice in weather_cache is fresh (dev path).
   * Production relies on the hourly Cloud Function; this mirrors it for local work.
   *
   * POST /api/weather/ensure-forecast
   * body: { stationCode, lat?, lng?, force? }
   */
  app.post('/api/weather/ensure-forecast', async (req: Request, res: Response) => {
    try {
      const stationCode = String(req.body?.stationCode || '').trim();
      if (!stationCode) {
        return res.status(400).json({ error: 'stationCode required' });
      }

      const anchor = WEATHER_STATION_ANCHORS.find((s) => s.stationCode === stationCode);
      const lat = Number(req.body?.lat ?? anchor?.lat);
      const lng = Number(req.body?.lng ?? anchor?.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ error: 'lat/lng required (unknown station)' });
      }

      const db = getAdminDb();
      const ref = db.doc(`weather_cache/${stationCode}`);
      const snap = await ref.get();
      const existingUpdatedAt = snap.exists
        ? (snap.data()?.forecastUpdatedAt as string | undefined)
        : undefined;

      if (!req.body?.force && !isForecastStale(existingUpdatedAt)) {
        return res.json({ stationCode, mode: 'cached', forecastUpdatedAt: existingUpdatedAt });
      }

      const today = getWeatherDateWindow(0).endDate;
      const { forecastData, fetchedAt } = await fetchMetnoDailyForecast({ lat, lng });
      const future: Record<string, DayWeather> = {};
      for (const [key, value] of Object.entries(forecastData)) {
        if (key >= today) future[key] = value;
      }

      const meta = resolveStationMeta(stationCode);
      await ref.set(
        {
          stationCode: meta.stationCode,
          stationName: meta.stationName,
          forecastData: future,
          forecastUpdatedAt: fetchedAt,
        },
        { merge: true }
      );

      return res.json({
        stationCode,
        mode: 'refreshed',
        forecastDays: Object.keys(future).length,
        forecastUpdatedAt: fetchedAt,
      });
    } catch (error) {
      console.error('[ensure-forecast]', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'ensure-forecast failed',
      });
    }
  });
}
