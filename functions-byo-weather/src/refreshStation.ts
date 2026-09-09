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
} from '../../shared/weather/dpirdClient';
import { fetchMetnoDailyForecast, isForecastStale } from '../../shared/weather/metnoForecast';
import type { WeatherDb } from './weatherDb';

function readStringField(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function resolveStationMeta(stationCode: string): { stationCode: string; stationName: string } {
  const anchor = WEATHER_STATION_ANCHORS.find((s) => s.stationCode === stationCode);
  return {
    stationCode,
    stationName: anchor?.name ?? stationCode,
  };
}

export type RefreshObservedResult = {
  stationCode: string;
  dayCount: number;
  startDate: string | null;
  endDate: string | null;
  lastUpdated: string;
  mode: 'historic_backfill' | 'recent_refresh';
};

/**
 * Same write as Cloud Run `POST /api/weather/ensure-cache` and the hosted
 * hourly scheduler: historic backfill when thin, else the rolling 14-day slice.
 */
export async function refreshObservedCache(
  db: WeatherDb,
  apiKey: string,
  stationCode: string,
  opts?: { startDate?: string; endDate?: string; forceHistoric?: boolean }
): Promise<RefreshObservedResult> {
  const { endDate: todayEnd } = getWeatherDateWindow(0);
  const startDate = opts?.startDate || getHistoricStartDate(WEATHER_HISTORIC_KEEP_DAYS);
  const endDate = opts?.endDate || todayEnd;
  const forceHistoric = Boolean(opts?.forceHistoric);

  const ref = db.doc(`weather_cache/${stationCode}`);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : undefined;
  let weatherData = {
    ...((existing?.weatherData || {}) as Record<string, DayWeather>),
  };
  const meta = resolveStationMeta(stationCode);
  const now = new Date().toISOString();
  let historicBackfilledAt = readStringField(existing, 'historicBackfilledAt');

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
    {
      mergeFields: [
        'stationCode',
        'stationName',
        'lastUpdated',
        'startDate',
        'endDate',
        'weatherData',
        ...(historicBackfilledAt ? (['historicBackfilledAt'] as const) : []),
      ],
    }
  );

  return {
    stationCode,
    dayCount: nextBounds.dayCount,
    startDate: nextBounds.startDate,
    endDate: nextBounds.endDate,
    lastUpdated: now,
    mode: needsHistoric ? 'historic_backfill' : 'recent_refresh',
  };
}

export type RefreshForecastResult = {
  stationCode: string;
  mode: 'cached' | 'refreshed';
  forecastUpdatedAt?: string;
  forecastDays?: number;
};

export async function refreshForecastCache(
  db: WeatherDb,
  stationCode: string,
  lat: number,
  lng: number,
  opts?: { force?: boolean }
): Promise<RefreshForecastResult> {
  const ref = db.doc(`weather_cache/${stationCode}`);
  const snap = await ref.get();
  const existingUpdatedAt = readStringField(snap.exists ? snap.data() : undefined, 'forecastUpdatedAt');

  if (!opts?.force && !isForecastStale(existingUpdatedAt)) {
    return { stationCode, mode: 'cached', forecastUpdatedAt: existingUpdatedAt };
  }

  const today = getWeatherDateWindow(0).endDate;
  const { forecastData, fetchedAt } = await fetchMetnoDailyForecast({
    lat,
    lng,
    userAgent: 'PUF-AM-BYO-weather/1.0 (github.com/paraquatsundae/PUF-AM)',
  });
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
    { mergeFields: ['stationCode', 'stationName', 'forecastData', 'forecastUpdatedAt'] }
  );

  return {
    stationCode,
    mode: 'refreshed',
    forecastDays: Object.keys(future).length,
    forecastUpdatedAt: fetchedAt,
  };
}
