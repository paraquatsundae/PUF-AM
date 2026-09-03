import { describe, it, expect } from 'vitest';

import {
  aggregateMetnoToDaily as sharedAggregate,
  isForecastStale as sharedIsStale,
  buildMetnoUserAgent as sharedUserAgent,
  PERTH_UTC_OFFSET_HOURS,
  type MetnoTimeseriesEntry,
} from '../shared/weather/metnoForecast';
import { estimateWetnessHoursProxy } from '../shared/weather/wetnessProxy';

import {
  aggregateMetnoToDaily as fnAggregate,
  isForecastStale as fnIsStale,
  buildMetnoUserAgent as fnUserAgent,
} from '../functions/src/metnoForecast';

/** Hand-crafted MET Norway sample with a Perth-local day boundary at 16:00Z. */
const sample: MetnoTimeseriesEntry[] = [
  // Perth-local 2026-07-20 (UTC 02:00 → 10:00 local, UTC 03:00 → 11:00 local)
  {
    time: '2026-07-20T02:00:00Z',
    data: {
      instant: { details: { air_temperature: 10, relative_humidity: 80 } },
      next_1_hours: { details: { precipitation_amount: 0 } },
    },
  },
  {
    time: '2026-07-20T03:00:00Z',
    data: {
      instant: { details: { air_temperature: 20, relative_humidity: 60 } },
      next_1_hours: { details: { precipitation_amount: 2 } },
    },
  },
  // Perth-local 2026-07-21 (UTC 16:00 → 00:00 next day; 6-hourly blocks, no next_1h)
  {
    time: '2026-07-20T16:00:00Z',
    data: {
      instant: { details: { air_temperature: 12, relative_humidity: 90 } },
      next_6_hours: { details: { precipitation_amount: 6 } },
    },
  },
  {
    time: '2026-07-20T22:00:00Z',
    data: {
      instant: { details: { air_temperature: 14, relative_humidity: 70 } },
      next_6_hours: { details: { precipitation_amount: 0 } },
    },
  },
];

describe('aggregateMetnoToDaily', () => {
  const daily = sharedAggregate(sample, PERTH_UTC_OFFSET_HOURS);

  it('buckets steps into Perth-local calendar days', () => {
    expect(Object.keys(daily).sort()).toEqual(['2026-07-20', '2026-07-21']);
  });

  it('averages temperature and humidity per day', () => {
    expect(daily['2026-07-20'].T).toBe(15); // (10+20)/2
    expect(daily['2026-07-20'].RH).toBe(70); // (80+60)/2
    expect(daily['2026-07-21'].T).toBe(13); // (12+14)/2
    expect(daily['2026-07-21'].RH).toBe(80); // (90+70)/2
  });

  it('sums precipitation, preferring next_1_hours then next_6_hours', () => {
    expect(daily['2026-07-20'].R).toBe(2); // next_1h: 0 + 2
    expect(daily['2026-07-20'].maxHourlyRain).toBe(2); // peak hour from next_1h
    expect(daily['2026-07-21'].R).toBe(6); // next_6h: 6 + 0
    // No hourly buckets → approximate peak intensity as 20% of the daily total.
    expect(daily['2026-07-21'].maxHourlyRain).toBeCloseTo(1.2, 5);
  });

  it('derives WD from the shared wetness proxy', () => {
    expect(daily['2026-07-20'].WD).toBe(Number(estimateWetnessHoursProxy(2, 70).toFixed(1)));
    expect(daily['2026-07-21'].WD).toBe(Number(estimateWetnessHoursProxy(6, 80).toFixed(1)));
  });

  it('skips days without a temperature reading', () => {
    const rainOnly = sharedAggregate([
      {
        time: '2026-07-20T02:00:00Z',
        data: { next_1_hours: { details: { precipitation_amount: 5 } } },
      },
    ]);
    expect(Object.keys(rainOnly)).toHaveLength(0);
  });
});

describe('isForecastStale', () => {
  it('treats missing / invalid timestamps as stale', () => {
    expect(sharedIsStale(undefined)).toBe(true);
    expect(sharedIsStale('not-a-date')).toBe(true);
  });

  it('respects the max-age window', () => {
    const fresh = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    const old = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12h ago
    expect(sharedIsStale(fresh, 6)).toBe(false);
    expect(sharedIsStale(old, 6)).toBe(true);
  });
});

/**
 * Parity guard: functions/src/metnoForecast.ts is a hand-maintained mirror of
 * shared/weather/metnoForecast.ts (deploy boundary — functions can't import
 * shared). Divergence would make the Cloud Function forecast disagree with the
 * dev route / client expectations.
 */
describe('functions metno module ↔ shared metno module parity', () => {
  it('aggregation matches on the sample', () => {
    expect(fnAggregate(sample, PERTH_UTC_OFFSET_HOURS)).toEqual(
      sharedAggregate(sample, PERTH_UTC_OFFSET_HOURS)
    );
  });

  it('helpers match', () => {
    expect(fnUserAgent()).toBe(sharedUserAgent());
    const ts = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(fnIsStale(ts, 6)).toBe(sharedIsStale(ts, 6));
    expect(fnIsStale(undefined)).toBe(sharedIsStale(undefined));
  });
});
