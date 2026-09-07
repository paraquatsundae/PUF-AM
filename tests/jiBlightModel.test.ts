import { describe, it, expect } from 'vitest';
import fixture from './fixtures/blightJiOctSample.json';
import { estimateWetnessHoursProxy } from '../shared/weather/wetnessProxy';
import {
  jiTempFactor,
  jiWetnessFactor,
  runJiBlightModel,
  JI_PUBLISHED,
  JI_INOCULUM_WINDOW_DAYS,
  JI_INCUBATION_MIN_DAYS,
  JI_INCUBATION_MAX_DAYS,
  DEFAULT_SH_BUDBREAK,
} from '../shared/weather/jiBlightModel';
import { runJiBlightSeries } from '../plugins/walnut_blight/src/runJiBlightSeries';

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

  /**
   * Ji eq. 3 raises the whole product to d. Applying d to (1 - Teq) alone — the
   * error these assertions exist to catch — drags the peak down to 11.07 °C and
   * caps f(T) at 0.282, so the curve shape is pinned rather than a few points.
   */
  describe('Beta curve shape (Ji eq. 3)', () => {
    const { cBeta, TminInf, TmaxInf } = JI_PUBLISHED;
    // Analytic optimum of b·Teq^c·(1−Teq): Teq* = c/(c+1).
    const peakT = TminInf + (cBeta / (cBeta + 1)) * (TmaxInf - TminInf);

    it('peaks at 15.65 °C, not 11.07 °C', () => {
      expect(peakT).toBeCloseTo(15.65, 2);
      expect(jiTempFactor(peakT)).toBeCloseTo(0.945, 3);
      // The mis-parenthesised form peaked here; it must now be well off-peak.
      expect(jiTempFactor(11.07)).toBeLessThan(0.01);
    });

    it('is a rate over 0 to 1, as Ji Table 1 defines INFR', () => {
      for (let T = 9; T <= 25; T += 0.1) {
        const f = jiTempFactor(T);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    });

    it('rises to the peak then falls, with no interior kink', () => {
      let prev = jiTempFactor(TminInf);
      for (let T = TminInf + 0.1; T < peakT; T += 0.1) {
        const f = jiTempFactor(T);
        expect(f, `rising at ${T.toFixed(1)}`).toBeGreaterThan(prev);
        prev = f;
      }
      prev = jiTempFactor(peakT);
      for (let T = peakT + 0.1; T <= TmaxInf; T += 0.1) {
        const f = jiTempFactor(T);
        expect(f, `falling at ${T.toFixed(1)}`).toBeLessThan(prev);
        prev = f;
      }
    });

    it('keeps the infection window inside spring temperatures', () => {
      // Winter mean temps must be near-silent; spring must dominate.
      expect(jiTempFactor(11)).toBeLessThan(0.01);
      expect(jiTempFactor(14)).toBeGreaterThan(0.5);
      expect(jiTempFactor(16.6)).toBeGreaterThan(0.8);
      expect(jiTempFactor(21)).toBeLessThan(0.02);
    });
  });
});

describe('runJiBlightModel — golden fixture (equation layer)', () => {
  // 32-day Oct–Nov window, not a budbreak-anchored season, so the 4-week SR window
  // is disabled: the fixture verifies eq. 1–4, and the cascade is tested separately.
  const weather = fixture.days.map((d) => ({ R: d.R, T: d.T, RH: d.RH }));
  const results = runJiBlightModel(weather, {
    orchard: { k: 1 },
    inoculumWindowDays: null,
  });

  // Expectations are computed independently at full precision (see the fixture's
  // expectedSource), so only floating-point noise is allowed.
  const tolerant = (actual: number, expected: number, label: string) => {
    expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(expected * 1e-8 + 1e-15);
  };

  it('reproduces primary inoculum Y (eq. 1)', () => {
    expect(results).toHaveLength(32);
    for (let i = 0; i < 32; i++) {
      tolerant(results[i].primaryInoculumY, fixture.expectedPrimaryInoculumY[i], `day ${i + 1}`);
    }
  });

  it('reproduces INFR = f(T) × f(WD) (eq. 2–4)', () => {
    for (let i = 0; i < 32; i++) {
      tolerant(results[i].infectionRate, fixture.expectedInfectionRate[i], `day ${i + 1}`);
    }
    expect(results[27].infectionRate).toBe(0); // 29.4 °C → f(T)=0
  });

  it('deltaY mode only doses on rain increases', () => {
    // Dry days after inoculum already high should have deltaY ≈ 0
    expect(results[1].primaryDoseDelta).toBe(0);
    expect(results[2].primaryDoseDelta).toBe(0);
    expect(results[3].primaryDoseDelta).toBeGreaterThan(0.5);
  });
});

/**
 * Ji Fig. 1 / Table 1: S1 --DISPR--> S2 --INFR--> S3 --INCR--> S4, with S4 oozing
 * secondary inoculum on rain days. Deterministic weather so the arithmetic is checkable.
 */
describe('runJiBlightModel — S1–S4 site cascade', () => {
  const ideal = { R: 8, T: 15.65, RH: 95, WD: 12 };
  const dry = { R: 0, T: 15.65, RH: 50, WD: 0 };
  const run = (days: typeof ideal[], opts = {}) =>
    runJiBlightModel(days, { orchard: { k: 1 }, ...opts });

  it('conserves the site pool: S1 + S3 + S4 = 1', () => {
    const res = run(Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? ideal : dry)));
    for (const r of res) {
      expect(r.healthySites + r.latentSites + r.diseasedSites).toBeCloseTo(1, 10);
      expect(r.healthySites).toBeGreaterThanOrEqual(0);
      expect(r.diseaseSeverity).toBeLessThanOrEqual(1);
    }
  });

  it('holds infections latent for 15 days, then erupts over 15–21', () => {
    const days = [ideal, ...Array.from({ length: 40 }, () => dry)];
    const res = run(days);
    expect(res[0].dailyInfectionRisk).toBeGreaterThan(0);
    expect(res[0].diseasedSites).toBe(0);
    // Nothing symptomatic before the window opens.
    for (let i = 0; i < JI_INCUBATION_MIN_DAYS; i++) {
      expect(res[i].diseasedSites, `day ${i}`).toBe(0);
    }
    expect(res[JI_INCUBATION_MIN_DAYS].eruptingSites).toBeGreaterThan(0);
    // Fully erupted one day past the end of the window; nothing left latent.
    const done = res[JI_INCUBATION_MAX_DAYS + 1];
    expect(done.latentSites).toBeCloseTo(0, 10);
    expect(done.diseasedSites).toBeCloseTo(res[0].dailyInfectionRisk, 10);
  });

  it('needs secondary inoculum to sustain an epidemic past the SR window', () => {
    const days = Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? ideal : dry));
    const withSecondary = run(days);
    const withoutSecondary = run(days, { secondaryInoculumCoeff: 0 });

    // Primary inoculum alone can still infect a lot — k=1 means enough inoculum to
    // damage the whole orchard — but it is spent when the window closes.
    for (let i = JI_INOCULUM_WINDOW_DAYS; i < 120; i++) {
      expect(withoutSecondary[i].dailyInfectionRisk, `day ${i}`).toBe(0);
    }
    expect(
      withSecondary.slice(JI_INOCULUM_WINDOW_DAYS).some((r) => r.dailyInfectionRisk > 0)
    ).toBe(true);
    expect(withSecondary[119].diseaseSeverity).toBeGreaterThan(
      withoutSecondary[119].diseaseSeverity
    );
  });

  it('produces a monotone, saturating disease progress curve', () => {
    const res = run(Array.from({ length: 120 }, (_, i) => (i % 3 === 0 ? ideal : dry)));
    for (let i = 1; i < res.length; i++) {
      expect(res[i].diseaseSeverity, `day ${i}`).toBeGreaterThanOrEqual(
        res[i - 1].diseaseSeverity - 1e-12
      );
    }
  });

  it('scales damage with orchard inoculum k', () => {
    const days = Array.from({ length: 60 }, (_, i) => (i % 4 === 0 ? ideal : dry));
    const low = runJiBlightModel(days, { orchard: { k: 0.5 } })[59].diseaseSeverity;
    const high = runJiBlightModel(days, { orchard: { k: 2 } })[59].diseaseSeverity;
    // k must not cancel out of the result — that was the bug in the first cut.
    expect(high).toBeGreaterThan(low);
  });
});

/**
 * Ji Table 1: SR is "cumulative precipitation that accumulated within 4 weeks
 * after budbreak". Rain after that mobilises no further primary inoculum.
 */
describe('runJiBlightModel — 4-week primary inoculum window', () => {
  const wetDay = { R: 8, T: 15.65, RH: 95, WD: 12 };
  const season = (n: number) => Array.from({ length: n }, () => ({ ...wetDay }));

  it('freezes SR and Y once the window closes', () => {
    const results = runJiBlightModel(season(40), { orchard: { k: 1 } });
    const last = results[JI_INOCULUM_WINDOW_DAYS - 1];
    expect(last.cumulativeRain).toBe(8 * JI_INOCULUM_WINDOW_DAYS);
    for (let i = JI_INOCULUM_WINDOW_DAYS; i < 40; i++) {
      expect(results[i].cumulativeRain, `day ${i + 1}`).toBe(last.cumulativeRain);
      expect(results[i].primaryInoculumY).toBe(last.primaryInoculumY);
      expect(results[i].primaryDoseDelta, `day ${i + 1}`).toBe(0);
    }
  });

  it('stops primary infection after the window, however wet it gets', () => {
    // Secondary inoculum off, so anything non-zero late is primary inoculum
    // leaking past the window rather than the epidemic feeding itself.
    const results = runJiBlightModel(season(40), {
      orchard: { k: 1 },
      secondaryInoculumCoeff: 0,
    });
    expect(results[10].dailyInfectionRisk).toBeGreaterThan(0);
    expect(results[JI_INOCULUM_WINDOW_DAYS].dailyInfectionRisk).toBe(0);
    expect(results[39].dailyInfectionRisk).toBe(0);
  });

  it('accumulates over the whole series when the window is disabled', () => {
    const results = runJiBlightModel(season(40), {
      orchard: { k: 1 },
      inoculumWindowDays: null,
    });
    expect(results[39].cumulativeRain).toBe(8 * 40);
  });
});

describe('runJiBlightSeries — seasonal inoculum reset', () => {
  type Day = { T: number; RH: number; R: number; WD: number; maxHourlyRain: number };
  const build = (fill: (add: (iso: string, R: number, T: number, RH: number) => void) => void) => {
    const weather: Record<string, Day> = {};
    fill((iso, R, T, RH) => {
      weather[iso] = { T, RH, R, WD: R > 0.2 ? 12 : RH > 82 ? 5 : 0, maxHourlyRain: R * 0.2 };
    });
    return weather;
  };
  /**
   * ISO date `offset` days after budbreak in `year`. Anchoring on the budbreak rather
   * than a fixed month keeps "inside the window" true if the default budbreak moves.
   */
  const fromBudbreak = (year: number, offset: number, budbreak = DEFAULT_SH_BUDBREAK) => {
    const d = new Date(year, budbreak.month, budbreak.day + offset);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('does not flatten a later spring after a wet prior year', () => {
    const weather = build((add) => {
      // 2024 budbreak season — saturate inoculum.
      for (let d = 0; d < 30; d++) add(fromBudbreak(2024, d), 15, 18, 90);
      // 2025 budbreak season — rain inside the 4-week window must re-mobilise.
      for (const d of [3, 10, 17]) add(fromBudbreak(2025, d), 12, 15.5, 95);
    });

    const series = runJiBlightSeries(new Date(2024, 5, 1), new Date(2025, 11, 1), weather, {
      orchard: { k: 1 },
    });

    const day = series.find((r) => r.fullDate === fromBudbreak(2025, 3));
    expect(day).toBeTruthy();
    // Pre-fix, multi-year deltaY saturation drove this to ~0.
    expect(day!.threat).toBeGreaterThan(0.001);
  });

  it('moves the infection window when budbreak moves', () => {
    // Rain sits 4 days after a 1 November budbreak — i.e. inside that window but
    // more than a month after the 1 October default.
    const budbreak = { month: 10, day: 1 };
    const weather = build((add) => {
      for (const d of [4, 5, 6]) add(fromBudbreak(2025, d, budbreak), 12, 15.65, 95);
    });
    const run = (opts?: { budbreak: typeof budbreak }) =>
      runJiBlightSeries(new Date(2025, 5, 1), new Date(2025, 11, 20), weather, {
        orchard: { k: 1 },
        ...opts,
      });

    expect(run().every((r) => r.threat === 0)).toBe(true);
    expect(run({ budbreak }).some((r) => r.threat > 0)).toBe(true);
  });

  /**
   * Consequence of Ji's 4-week SR window with no secondary inoculum stage: rain
   * that arrives after the window mobilises nothing, so the season stays silent.
   * Real Manjimup springs are wet inside the window, but this pins the behaviour
   * so it is a deliberate limitation rather than a surprise.
   */
  it('is silent for the season when no rain falls inside the window', () => {
    const weather = build((add) => {
      // Dry through the window, then ideal infection weather well after it.
      add(fromBudbreak(2025, JI_INOCULUM_WINDOW_DAYS + 4), 12, 15.65, 95);
      add(fromBudbreak(2025, JI_INOCULUM_WINDOW_DAYS + 5), 12, 15.65, 95);
    });

    const series = runJiBlightSeries(new Date(2025, 5, 1), new Date(2025, 11, 20), weather, {
      orchard: { k: 1 },
    });

    expect(series.every((r) => r.threat === 0)).toBe(true);
  });
});

