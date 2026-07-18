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
}
