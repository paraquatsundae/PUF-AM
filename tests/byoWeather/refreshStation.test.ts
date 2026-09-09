import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshForecastCache, refreshObservedCache } from '../../functions-byo-weather/src/refreshStation';
import { memoryWeatherDb } from './memoryDb';

function dailyPage(days: Array<{ y: number; m: number; d: number }>) {
  return {
    collection: [
      {
        summaries: days.map((day) => ({
          period: { year: day.y, month: day.m, day: day.d },
          airTemperature: { avg: 14 },
          relativeHumidity: { avg: 70 },
          rainfall: 0,
          wind: [{ avg: { speed: 8 } }],
          evapotranspiration: { shortCrop: 2 },
        })),
      },
    ],
  };
}

describe('refreshObservedCache', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('writes weather_cache for the requested station', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dailyPage([{ y: 2026, m: 9, d: 1 }])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { db, store } = memoryWeatherDb();
    const result = await refreshObservedCache(db, 'key', 'MA002', {
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      forceHistoric: true,
    });

    expect(result.mode).toBe('historic_backfill');
    expect(result.stationCode).toBe('MA002');
    expect(result.dayCount).toBe(1);
    const written = store.get('weather_cache/MA002') as { weatherData?: Record<string, unknown> };
    expect(written.weatherData?.['2026-09-01']).toMatchObject({ T: 14, RH: 70, R: 0 });
    expect(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain(
      'stations/summaries/daily'
    );
  });

  it('replaces forecastData so stale day keys do not survive merge', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            timeseries: [
              {
                time: '2026-09-10T00:00:00Z',
                data: {
                  instant: { details: { air_temperature: 16, relative_humidity: 60 } },
                  next_6_hours: { details: { precipitation_amount: 0 } },
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { db, store } = memoryWeatherDb();
    store.set('weather_cache/MA002', {
      stationCode: 'MA002',
      forecastData: {
        '2020-01-01': { T: 1, RH: 1, R: 1, WD: 0, maxHourlyRain: 0 },
      },
      forecastUpdatedAt: '2000-01-01T00:00:00.000Z',
    });

    const result = await refreshForecastCache(db, 'MA002', -34.24, 116.14, { force: true });
    expect(result.mode).toBe('refreshed');
    const written = store.get('weather_cache/MA002') as {
      forecastData?: Record<string, unknown>;
    };
    expect(written.forecastData?.['2020-01-01']).toBeUndefined();
    expect(Object.keys(written.forecastData ?? {}).every((key) => key >= '2026-09-01')).toBe(true);
  });
});
