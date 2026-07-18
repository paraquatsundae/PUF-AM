import { describe, expect, it } from 'vitest';
import {
  calculateChillData,
  getSouthernHemisphereChillWindow,
  isInSouthernHemisphereChillSeason,
  perthLocalToUtcDate,
  resolveCultivarTarget,
} from '../shared/weather/chillPortions';

describe('resolveCultivarTarget', () => {
  it('matches UCANR-backed cultivar names case-insensitively', () => {
    expect(resolveCultivarTarget('Chandler').requiredCP).toBe(45);
    expect(resolveCultivarTarget('Chandler').sourceKind).toBe('ucanr');
    expect(resolveCultivarTarget('hartley').requiredCP).toBe(54);
    expect(resolveCultivarTarget('Payne').requiredCP).toBe(38);
  });

  it('uses Luedeling estimate for Franquette', () => {
    const f = resolveCultivarTarget('Franquette');
    expect(f.requiredCP).toBe(70);
    expect(f.sourceKind).toBe('luedeling');
  });

  it('falls back unknown cultivars to Chandler threshold', () => {
    const t = resolveCultivarTarget('Mystery');
    expect(t.name).toBe('Mystery');
    expect(t.requiredCP).toBe(45);
  });
});

describe('getSouthernHemisphereChillWindow', () => {
  it('uses current Mar–Sep season during winter', () => {
    // 16 Jul 2026 02:00 UTC = 10:00 Perth
    const w = getSouthernHemisphereChillWindow(new Date('2026-07-16T02:00:00.000Z'));
    expect(w.seasonYear).toBe(2026);
    expect(w.isCompleteSeason).toBe(false);
    expect(w.start.toISOString()).toBe(perthLocalToUtcDate(2026, 3, 1).toISOString());
  });

  it('reports completed season in October', () => {
    const w = getSouthernHemisphereChillWindow(new Date('2026-10-15T02:00:00.000Z'));
    expect(w.seasonYear).toBe(2026);
    expect(w.isCompleteSeason).toBe(true);
    expect(w.end.toISOString()).toBe(perthLocalToUtcDate(2026, 9, 30, 23).toISOString());
  });

  it('reports previous season in January', () => {
    const w = getSouthernHemisphereChillWindow(new Date('2027-01-10T02:00:00.000Z'));
    expect(w.seasonYear).toBe(2026);
    expect(w.isCompleteSeason).toBe(true);
  });
});

describe('isInSouthernHemisphereChillSeason', () => {
  it('includes Mar–Sep Perth months only', () => {
    expect(isInSouthernHemisphereChillSeason(perthLocalToUtcDate(2026, 3, 1, 12))).toBe(true);
    expect(isInSouthernHemisphereChillSeason(perthLocalToUtcDate(2026, 7, 1, 12))).toBe(true);
    expect(isInSouthernHemisphereChillSeason(perthLocalToUtcDate(2026, 9, 30, 12))).toBe(true);
    expect(isInSouthernHemisphereChillSeason(perthLocalToUtcDate(2026, 2, 28, 12))).toBe(false);
    expect(isInSouthernHemisphereChillSeason(perthLocalToUtcDate(2026, 10, 1, 12))).toBe(false);
  });
});

describe('calculateChillData', () => {
  it('ignores hours outside the SH season window', () => {
    // Constant mild chill-friendly 6°C for 48h in Feb (outside) + 48h in Jun (inside)
    const temps: number[] = [];
    const times: string[] = [];
    for (let h = 0; h < 48; h++) {
      temps.push(6);
      times.push(perthLocalToUtcDate(2026, 2, 10 + Math.floor(h / 24), h % 24).toISOString());
    }
    for (let h = 0; h < 48; h++) {
      temps.push(6);
      times.push(perthLocalToUtcDate(2026, 6, 10 + Math.floor(h / 24), h % 24).toISOString());
    }

    const withWindow = calculateChillData(temps, times, { enforceSeasonWindow: true });
    const withoutWindow = calculateChillData(temps, times, { enforceSeasonWindow: false });

    expect(withWindow.hoursProcessed).toBe(48);
    expect(withoutWindow.hoursProcessed).toBe(96);
    expect(withWindow.totalPortions).toBeLessThanOrEqual(withoutWindow.totalPortions);
  });

  it('accumulates portions under sustained cool temperatures', () => {
    const temps: number[] = [];
    const times: string[] = [];
    // 14 days of 5°C in June Perth — should produce a clear positive CP total
    for (let h = 0; h < 14 * 24; h++) {
      const day = 1 + Math.floor(h / 24);
      const hour = h % 24;
      temps.push(5);
      times.push(perthLocalToUtcDate(2026, 6, day, hour).toISOString());
    }
    const result = calculateChillData(temps, times);
    expect(result.hoursProcessed).toBe(14 * 24);
    // ~0.7 CP/day at constant 5°C is typical Dynamic Model behaviour
    expect(result.totalPortions).toBeGreaterThanOrEqual(8);
    expect(result.chartData.find((m) => m.month === 'Jun')?.portions ?? 0).toBeGreaterThan(0);
  });

  it('skips null temperatures without counting them as processed', () => {
    const temps = [5, null, 5, undefined, 5];
    const times = [0, 1, 2, 3, 4].map((h) => perthLocalToUtcDate(2026, 6, 1, h).toISOString());
    const result = calculateChillData(temps as number[], times);
    expect(result.hoursProcessed).toBe(3);
    expect(result.hoursSkipped).toBe(2);
  });
});
