import { discoverRefreshStations } from './discoverStations';
import { refreshForecastCache, refreshObservedCache } from './refreshStation';
import type { WeatherDb } from './weatherDb';

/**
 * One hourly pass: observed DPIRD days, then MET Norway (failure there must
 * not roll back the observed write).
 */
export async function runWeatherRefresh(db: WeatherDb, apiKey: string): Promise<void> {
  if (!apiKey) {
    console.error('[byoRefreshWeatherCache] DPIRD_API_KEY secret not configured');
    return;
  }

  const stations = await discoverRefreshStations(db);
  for (const station of stations) {
    try {
      const observed = await refreshObservedCache(db, apiKey, station.stationCode);
      console.log(
        `[byoRefreshWeatherCache] ${station.stationCode}: ${observed.dayCount} days ` +
          `(${observed.startDate} → ${observed.endDate}) ${observed.mode}`
      );
    } catch (error) {
      console.error(`[byoRefreshWeatherCache] DPIRD failed for ${station.stationCode}:`, error);
      continue;
    }

    if (station.lat === undefined || station.lng === undefined) continue;
    try {
      const forecast = await refreshForecastCache(db, station.stationCode, station.lat, station.lng);
      console.log(
        `[byoRefreshWeatherCache] ${station.stationCode}: forecast ${forecast.mode}` +
          (forecast.forecastDays !== undefined ? ` ${forecast.forecastDays} days` : '')
      );
    } catch (error) {
      console.error(`[byoRefreshWeatherCache] MET Norway failed for ${station.stationCode}:`, error);
    }
  }
}
