import { describe, it, expect } from 'vitest';
import fixture from './fixtures/blightJiOctSample.json';

import {
  runJiBlightModel as sharedRunJiBlightModel,
  jiTempFactor as sharedTempFactor,
  jiWetnessFactor as sharedWetnessFactor,
  kFromInoculumLevel as sharedKFromLevel,
  JI_INOCULUM_K as SHARED_INOCULUM_K,
  JI_PUBLISHED as SHARED_PUBLISHED,
  DEFAULT_SH_BUDBREAK as SHARED_DEFAULT_BUDBREAK,
  resolveBudbreak as sharedResolveBudbreak,
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
  DEFAULT_SH_BUDBREAK as FN_DEFAULT_BUDBREAK,
  resolveBudbreak as fnResolveBudbreak,
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

  it('runJiBlightModel matches on the golden fixture', () => {
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

  /**
   * The site cascade is the newest and most intricate part of both modules, so the
   * parity guard has to reach past the headline number into every state variable.
   */
  it('the S1–S4 cascade matches state for state over a long wet run', () => {
    const ideal = { R: 8, T: 15.65, RH: 95, WD: 12 };
    const dry = { R: 0, T: 13, RH: 55, WD: 0 };
    const weather = Array.from({ length: 150 }, (_, i) => (i % 3 === 0 ? ideal : dry));

    for (const k of [0.5, 1, 2]) {
      const shared = sharedRunJiBlightModel(weather, { orchard: { k } });
      const fn = fnRunJiBlightModel(weather, { orchard: { k } });
      expect(fn).toHaveLength(shared.length);
      for (let i = 0; i < shared.length; i++) {
        const where = `k=${k} day ${i}`;
        expect(fn[i].healthySites, where).toBeCloseTo(shared[i].healthySites, 12);
        expect(fn[i].latentSites, where).toBeCloseTo(shared[i].latentSites, 12);
        expect(fn[i].diseasedSites, where).toBeCloseTo(shared[i].diseasedSites, 12);
        expect(fn[i].eruptingSites, where).toBeCloseTo(shared[i].eruptingSites, 12);
        expect(fn[i].diseaseSeverity, where).toBeCloseTo(shared[i].diseaseSeverity, 12);
        expect(fn[i].secondaryDose, where).toBeCloseTo(shared[i].secondaryDose, 12);
        expect(fn[i].dispersalRate, where).toBeCloseTo(shared[i].dispersalRate, 12);
      }
    }
  });

  it('the 4-week SR window matches', () => {
    const weather = Array.from({ length: 60 }, () => ({ R: 5, T: 15, RH: 90, WD: 10 }));
    const shared = sharedRunJiBlightModel(weather, { orchard: { k: 1 } });
    const fn = fnRunJiBlightModel(weather, { orchard: { k: 1 } });
    for (let i = 0; i < shared.length; i++) {
      expect(fn[i].cumulativeRain, `day ${i}`).toBeCloseTo(shared[i].cumulativeRain, 12);
      expect(fn[i].primaryInoculumY, `day ${i}`).toBeCloseTo(shared[i].primaryInoculumY, 12);
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
    const opts = { orchard: { k: 1 } };

    const shared = sharedRunSeries(start, end, weather, opts);
    const fn = fnRunSeries(start, end, weather, opts);

    expect(fn).toHaveLength(shared.length);
    const fnByDate = new Map(fn.map((r) => [r.fullDate, r]));
    for (const row of shared) {
      const match = fnByDate.get(row.fullDate);
      expect(match, `missing ${row.fullDate}`).toBeTruthy();
      expect(match!.threat).toBeCloseTo(row.threat, 9);
      expect(match!.diseaseSeverity, row.fullDate).toBeCloseTo(row.diseaseSeverity ?? 0, 9);
    }
  });

  it('budbreak default and coercion match', () => {
    expect(FN_DEFAULT_BUDBREAK).toEqual(SHARED_DEFAULT_BUDBREAK);
    const cases: [unknown, unknown][] = [
      [9, 1],
      [10, 15],
      [0, 31],
      [undefined, undefined],
      [-1, 5],
      [12, 5],
      [5, 0],
      [5, 32],
      [1, 30], // 30 February → default
      [3.5, 5],
      ['9', '1'],
      [null, null],
    ];
    for (const [m, d] of cases) {
      expect(fnResolveBudbreak(m, d), `${String(m)}/${String(d)}`).toEqual(
        sharedResolveBudbreak(m, d)
      );
    }
  });

  it('a moved budbreak shifts the window identically in both modules', () => {
    const weather: Record<string, SeriesWeatherDay & { maxHourlyRain: number }> = {};
    const budbreak = { month: 10, day: 1 };
    for (const d of [4, 5, 6]) {
      weather[`2025-11-0${d}`] = { T: 15.65, RH: 95, R: 12, WD: 12, maxHourlyRain: 2.4 };
    }
    const start = new Date(2025, 5, 1);
    const end = new Date(2025, 11, 20);
    const opts = { orchard: { k: 1 }, budbreak };

    const shared = sharedRunSeries(start, end, weather, opts);
    const fn = fnRunSeries(start, end, weather, opts);

    expect(shared.some((r) => r.threat > 0)).toBe(true);
    const fnByDate = new Map(fn.map((r) => [r.fullDate, r]));
    for (const row of shared) {
      expect(fnByDate.get(row.fullDate)!.threat, row.fullDate).toBeCloseTo(row.threat, 9);
    }
  });
});
