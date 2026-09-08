import { afterEach, describe, expect, it, vi } from 'vitest';

import { refreshObservedCache } from '../../functions-byo-weather/src/refreshStation';
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
});
