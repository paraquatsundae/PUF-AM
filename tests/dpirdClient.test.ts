import { describe, expect, it } from 'vitest';
import {
  cacheCoversRange,
  mergeWeatherData,
  pruneWeatherData,
  weatherDataBounds,
  type DayWeather,
} from '../shared/weather/dpirdClient';

const day = (n: number): DayWeather => ({
  T: n,
  RH: 50,
  R: 0,
  WD: 0,
  maxHourlyRain: 0,
});

describe('dpirdClient cache helpers', () => {
  it('merges weather maps without dropping historic days', () => {
    const base = { '2026-01-01': day(1), '2026-01-02': day(2) };
    const patch = { '2026-01-02': day(20), '2026-01-03': day(3) };
    const merged = mergeWeatherData(base, patch);
    expect(merged['2026-01-01'].T).toBe(1);
    expect(merged['2026-01-02'].T).toBe(20);
    expect(merged['2026-01-03'].T).toBe(3);
  });

  it('reports bounds and coverage', () => {
    const data = {
      '2026-07-01': day(1),
      '2026-07-02': day(2),
      '2026-07-03': day(3),
    };
    expect(weatherDataBounds(data)).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      dayCount: 3,
    });
    expect(cacheCoversRange(data, '2026-07-01', '2026-07-03')).toBe(true);
    expect(cacheCoversRange(data, '2026-07-01', '2026-07-10')).toBe(false);
  });

  it('prunes days older than keep window', () => {
    // The cutoff is relative to *today*, so the kept day must be too — a
    // hardcoded date here quietly starts failing once it ages past the window.
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const data = {
      '2020-01-01': day(1),
      [recent]: day(2),
    };
    const pruned = pruneWeatherData(data, 30);
    expect(pruned['2020-01-01']).toBeUndefined();
    expect(pruned[recent]).toBeDefined();
  });
});
