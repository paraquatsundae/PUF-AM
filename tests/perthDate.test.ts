import { describe, expect, it } from 'vitest';
import {
  blightSeasonStart,
  getPerthYmd,
  perthCivilDate,
  toPerthISOString,
} from '../functions/src/perthDate';

/** Instant that is 05:00 Australia/Perth on the given civil date (UTC previous evening). */
function atPerthFiveAm(isoDate: string): Date {
  return new Date(`${isoDate}T05:00:00+08:00`);
}

describe('Perth civil dates for blight aggregates', () => {
  it('keeps 05:00 Perth on the Perth calendar day, not UTC yesterday', () => {
    const now = atPerthFiveAm('2026-10-01');
    expect(now.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(toPerthISOString(now)).toBe('2026-10-01');
    expect(getPerthYmd(now)).toEqual({ year: 2026, month: 10, day: 1 });
  });

  it('opens the 2026/27 season on 1 June Perth, even at 05:00 that morning', () => {
    const now = atPerthFiveAm('2026-06-01');
    // UTC is still 31 May — the old getMonth() >= 5 check would pick 2025-06-01.
    expect(now.toISOString()).toBe('2026-05-31T21:00:00.000Z');
    const start = blightSeasonStart(now);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
  });

  it('uses last June for a Perth morning in May', () => {
    const start = blightSeasonStart(atPerthFiveAm('2026-05-15'));
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
  });

  it('feeds the series walker a Date whose local Y-M-D is the Perth day', () => {
    const civil = perthCivilDate(atPerthFiveAm('2026-10-01'));
    expect(civil.getFullYear()).toBe(2026);
    expect(civil.getMonth()).toBe(9);
    expect(civil.getDate()).toBe(1);
  });
});

describe('Cloud Function series at 05:00 Perth', () => {
  it('includes the Perth calendar day and treats 1 Oct as budbreak', async () => {
    const { runJiBlightSeries } = await import('../functions/src/jiBlightModel');
    const now = atPerthFiveAm('2026-10-01');
    const weather = {
      '2026-10-01': { T: 15.65, RH: 95, R: 12, WD: 12 },
    };
    const series = runJiBlightSeries(blightSeasonStart(now), perthCivilDate(now), weather, {
      orchard: { k: 1 },
    });
    const today = series.find((r) => r.fullDate === '2026-10-01');
    expect(today).toBeTruthy();
    expect(today!.threat).toBeGreaterThan(0);
    expect(series.some((r) => r.fullDate === '2026-09-30' && r.threat > 0)).toBe(false);
  });
});
