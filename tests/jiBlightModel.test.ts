import { describe, it, expect } from 'vitest';
import fixture from './fixtures/blightJiOctSample.json';
import { estimateWetnessHoursProxy } from '../shared/weather/wetnessProxy';
import {
  jiTempFactor,
  jiWetnessFactor,
  runJiBlightModel,
  JI_PUBLISHED,
} from '../shared/weather/jiBlightModel';
import { runJiBlightSeries } from '../src/lib/runJiBlightSeries';

describe('estimateWetnessHoursProxy', () => {
  it('matches notebook: heavy rain + high RH caps at 18', () => {
    expect(estimateWetnessHoursProxy(15.8, 99)).toBe(18);
  });

  it('matches notebook: rain only', () => {
    expect(estimateWetnessHoursProxy(5.6, 72)).toBeCloseTo(5 + 0.8 * 5.6, 5);
  });

  it('matches notebook: dew-like RH only', () => {
    expect(estimateWetnessHoursProxy(0, 85)).toBe(5);
  });

  it('ignores drizzle at exactly 0.2 mm', () => {
    expect(estimateWetnessHoursProxy(0.2, 62)).toBe(0);
  });
});

describe('jiTempFactor / jiWetnessFactor', () => {
  it('is zero outside 10–24 °C', () => {
    expect(jiTempFactor(9.9)).toBe(0);
    expect(jiTempFactor(24.1)).toBe(0);
    expect(jiTempFactor(29.4)).toBe(0);
  });

  it('Gompertz approaches e at long wetness', () => {
    expect(jiWetnessFactor(18)).toBeCloseTo(JI_PUBLISHED.eGomp, 5);
  });
});

describe('runJiBlightModel — notebook golden fixture', () => {
  it('reproduces Mathematica daily infection risk (cumulativeY + 400 trees/ha)', () => {
    const weather = fixture.days.map((d) => ({
      R: d.R,
      T: d.T,
      RH: d.RH,
    }));

    const results = runJiBlightModel(weather, {
      orchard: fixture.orchard,
      doseMode: 'cumulativeY',
    });

    expect(results).toHaveLength(32);
    expect(results[4].dailyInfectionRisk).toBeCloseTo(0.0274408253, 5);
    expect(results[27].dailyInfectionRisk).toBe(0); // 29.4 °C → f(T)=0

    for (let i = 0; i < 32; i++) {
      const expected = fixture.expectedDailyInfectionRisk[i];
      const actual = results[i].dailyInfectionRisk;
      const tol = expected < 1e-5 ? 1e-7 : expected * 0.002 + 1e-7;
      expect(Math.abs(actual - expected), `day ${i + 1}`).toBeLessThanOrEqual(tol);
    }
  });

  it('deltaY mode only doses on rain increases', () => {
    const weather = fixture.days.map((d) => ({ R: d.R, T: d.T, RH: d.RH }));
    const results = runJiBlightModel(weather, {
      orchard: { k: 1 },
      doseMode: 'deltaY',
    });
    // Dry days after inoculum already high should have deltaY ≈ 0
    expect(results[1].primaryDoseDelta).toBe(0);
    expect(results[2].primaryDoseDelta).toBe(0);
    expect(results[3].primaryDoseDelta).toBeGreaterThan(0.5);
  });
});

describe('runJiBlightSeries — seasonal inoculum reset', () => {
  it('does not flatten a later spring after a wet prior year', () => {
    // Two seasons: heavy rain in 2024 spring, then a clear infection-friendly day in 2025 spring
    const weather: Record<string, { T: number; RH: number; R: number; WD: number; maxHourlyRain: number }> = {};
    const add = (iso: string, R: number, T: number, RH: number) => {
      weather[iso] = { T, RH, R, WD: R > 0.2 ? 12 : RH > 82 ? 5 : 0, maxHourlyRain: R * 0.2 };
    };
    // 2024 budbreak season — saturate inoculum
    for (let d = 1; d <= 30; d++) {
      add(`2024-09-${String(d).padStart(2, '0')}`, 15, 18, 90);
    }
    // 2025 spring — one wet warm day that must still register
    add('2025-10-05', 12, 18, 95);

    const series = runJiBlightSeries(
      new Date(2024, 5, 1),
      new Date(2025, 10, 1),
      weather,
      { orchard: { k: 1 }, doseMode: 'cumulativeY' }
    );

    const oct2025 = series.find((r) => r.fullDate === '2025-10-05');
    expect(oct2025).toBeTruthy();
    // Must be clearly non-zero (pre-fix: multi-year deltaY saturation → ~0)
    expect(oct2025!.threat).toBeGreaterThan(0.001);
  });
});

