import { describe, it, expect } from 'vitest';
import fixture from './fixtures/blightJiOctSample.json';

import {
  runJiBlightModel as sharedRunJiBlightModel,
  jiTempFactor as sharedTempFactor,
  jiWetnessFactor as sharedWetnessFactor,
  kFromInoculumLevel as sharedKFromLevel,
  JI_INOCULUM_K as SHARED_INOCULUM_K,
  JI_PUBLISHED as SHARED_PUBLISHED,
} from '../shared/weather/jiBlightModel';
import { estimateWetnessHoursProxy as sharedWetnessProxy } from '../shared/weather/wetnessProxy';
import { runJiBlightSeries as sharedRunSeries } from '../plugins/walnut_blight/src/runJiBlightSeries';
import { JI_WATCH_THRESHOLD, JI_ACTION_THRESHOLD } from '../plugins/walnut_blight/src/jiBlightBands';

import {
  runJiBlightModel as fnRunJiBlightModel,
  runJiBlightSeries as fnRunSeries,
  jiTempFactor as fnTempFactor,
  jiWetnessFactor as fnWetnessFactor,
  estimateWetnessHoursProxy as fnWetnessProxy,
  kFromInoculumLevel as fnKFromLevel,
  JI_INOCULUM_K as FN_INOCULUM_K,
  JI_PUBLISHED as FN_PUBLISHED,
  JI_WATCH_THRESHOLD as FN_WATCH,
  JI_ACTION_THRESHOLD as FN_ACTION,
  type SeriesWeatherDay,
} from '../functions/src/jiBlightModel';

/**
 * Parity guard: the Cloud Functions Ji module is a hand-maintained mirror of the
 * shared client module (functions can't import across the deploy boundary — see
 * firebase.json). If these drift, the Dashboard aggregate and the BlightRisk page
 * would disagree again (BV-09). This test fails loudly on any divergence.
 */
describe('functions Ji module ↔ shared Ji module parity', () => {
  it('frozen params and thresholds match', () => {
    expect(FN_PUBLISHED).toEqual(SHARED_PUBLISHED);
    expect(FN_WATCH).toBe(JI_WATCH_THRESHOLD);
    expect(FN_ACTION).toBe(JI_ACTION_THRESHOLD);
  });

  it('inoculum-level → k mapping matches', () => {
    expect(FN_INOCULUM_K).toEqual(SHARED_INOCULUM_K);
    for (const level of ['low', 'medium', 'high'] as const) {
      expect(fnKFromLevel(level)).toBe(sharedKFromLevel(level));
    }
    // Unknown / undefined both fall back to medium (k=1).
    expect(fnKFromLevel(undefined)).toBe(sharedKFromLevel(undefined));
    expect(sharedKFromLevel(undefined)).toBe(1);
  });

  it('pure factors match across a temperature/wetness sweep', () => {
    for (let T = 5; T <= 30; T += 0.5) {
      expect(fnTempFactor(T)).toBeCloseTo(sharedTempFactor(T), 12);
    }
    for (let WD = 0; WD <= 24; WD += 0.5) {
      expect(fnWetnessFactor(WD)).toBeCloseTo(sharedWetnessFactor(WD), 12);
    }
    for (let R = 0; R <= 20; R += 0.7) {
      for (const RH of [40, 62, 82, 83, 99]) {
        expect(fnWetnessProxy(R, RH)).toBe(sharedWetnessProxy(R, RH));
      }
    }
  });

  it('runJiBlightModel matches on the notebook golden fixture', () => {
    const weather = fixture.days.map((d) => ({ R: d.R, T: d.T, RH: d.RH }));
    for (const doseMode of ['cumulativeY', 'deltaY'] as const) {
      const shared = sharedRunJiBlightModel(weather, { orchard: fixture.orchard, doseMode });
      const fn = fnRunJiBlightModel(weather, { orchard: fixture.orchard, doseMode });
      expect(fn).toHaveLength(shared.length);
      for (let i = 0; i < shared.length; i++) {
        expect(fn[i].dailyInfectionRisk).toBeCloseTo(shared[i].dailyInfectionRisk, 12);
        expect(fn[i].wetnessHours).toBeCloseTo(shared[i].wetnessHours, 12);
      }
    }
  });

  it('runJiBlightSeries matches threat/day across a two-season run', () => {
    const weather: Record<string, SeriesWeatherDay & { maxHourlyRain: number }> = {};
    const add = (iso: string, R: number, T: number, RH: number) => {
      weather[iso] = { T, RH, R, WD: R > 0.2 ? 12 : RH > 82 ? 5 : 0, maxHourlyRain: R * 0.2 };
    };
    for (let d = 1; d <= 30; d++) add(`2024-09-${String(d).padStart(2, '0')}`, 15, 18, 90);
    add('2025-10-05', 12, 18, 95);
    add('2025-10-12', 3.2, 16, 88);

    const start = new Date(2024, 5, 1);
    const end = new Date(2025, 10, 1);
    const opts = { orchard: { k: 1 }, doseMode: 'cumulativeY' as const };

    const shared = sharedRunSeries(start, end, weather, opts);
    const fn = fnRunSeries(start, end, weather, opts);

    expect(fn).toHaveLength(shared.length);
    const fnByDate = new Map(fn.map((r) => [r.fullDate, r]));
    for (const row of shared) {
      const match = fnByDate.get(row.fullDate);
      expect(match, `missing ${row.fullDate}`).toBeTruthy();
      expect(match!.threat).toBeCloseTo(row.threat, 9);
    }
  });
});
