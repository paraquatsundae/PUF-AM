/**
 * Ji et al. 2025 — mechanistic walnut blight infection risk
 * (Plant Disease 109:1130–1141; DOI 10.1094/PDIS-09-24-1850-RE).
 *
 * Production Forecast/Historical should call this module.
 * Published coefficients are frozen; only orchard `k` (and optional density) are farm-tunable.
 *
 * @see Plans/BLIGHT_VALIDATION.md
 */
import { estimateWetnessHoursProxy } from './wetnessProxy';

/** Frozen parameters from Ji et al. 2025 (Adaskaveg 1998 fits). */
export const JI_PUBLISHED = {
  aMobil: 0.916,
  TminInf: 10,
  TmaxInf: 24,
  bBeta: 3.075,
  cBeta: 0.676,
  dBeta: 8.205,
  eGomp: 1.02,
  fGomp: 2.093,
  gGomp: 0.896,
} as const;

/**
 * Grower-facing orchard inoculum level → Ji `k` (primary inoculum modulator).
 * Ji ties `k` to prior-season blight / bud CFU (Buchner et al. 2014 distribution).
 * These are workshop defaults centred on `k=1` (the calibration point for the
 * Watch/Action bands and the golden fixture); tune once bud CFU / scouting exists.
 */
export type OrchardInoculumLevel = 'low' | 'medium' | 'high';

export const JI_INOCULUM_K: Record<OrchardInoculumLevel, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.0,
};

/** Map an inoculum level to Ji `k`. Unknown/undefined → medium (k=1, unchanged). */
export function kFromInoculumLevel(level?: OrchardInoculumLevel | null): number {
  return level && level in JI_INOCULUM_K ? JI_INOCULUM_K[level] : JI_INOCULUM_K.medium;
}

export type JiOrchardParams = {
  /** Orchard inoculum modulator k (Buchner-derived). Default 1.0. */
  k?: number;
  /**
   * Optional WA extension (not in Ji paper body): trees/ha density amplification.
   * When set with densityRef + alphaDensity, multiplies infection by densityFactor^densityExponent.
   */
  treeDensityPerHa?: number;
  densityRefPerHa?: number;
  alphaDensity?: number;
  densityExponent?: number;
};

export type JiDailyWeather = {
  /** Calendar date YYYY-MM-DD (optional; for series output). */
  date?: string;
  /** Rainfall mm. */
  R: number;
  /**
   * Temperature °C for f(T).
   * Prefer mean temperature during the wet period (T_WD) when available;
   * daily mean or max is an approximation (notebook used max).
   */
  T: number;
  /** Relative humidity % — used only by the interim wetness proxy when WD omitted. */
  RH?: number;
  /**
   * Leaf wetness duration hours. When omitted, estimated via `estimateWetnessHoursProxy`.
   */
  WD?: number;
};

export type JiDailyResult = {
  date?: string;
  /** Cumulative rain from series start (budbreak proxy). */
  cumulativeRain: number;
  /** Accumulated primary inoculum Y_i = k (1 - a^SR). */
  primaryInoculumY: number;
  /**
   * Inoculum mobilised on this day (ΔY). Zero on dry days.
   * Paper uses this as the splash dose for the rain event.
   */
  primaryDoseDelta: number;
  /** Secondary inoculum oozing from symptomatic (S4) sites, splashed on rain days. */
  secondaryDose: number;
  /** DISPR — fraction of healthy sites contaminated today (0–1). */
  dispersalRate: number;
  wetnessHours: number;
  fTemp: number;
  fWetness: number;
  /** INFR = f(T) × f(WD). */
  infectionRate: number;
  /**
   * Sites newly infected today, i.e. the S2→S3 flow.
   * This is the paper's "infection severity" — the grey bars in Figs. 5–8.
   */
  dailyInfectionRisk: number;
  /** S1 — fraction of host tissue still healthy and susceptible. */
  healthySites: number;
  /** S3 — fraction carrying latent infection, not yet symptomatic. */
  latentSites: number;
  /** S4 — fraction symptomatic and producing inoculum. */
  diseasedSites: number;
  /** Fraction whose symptoms became visible today (S3→S4 flow). */
  eruptingSites: number;
  /**
   * S4 — the disease progress curve, i.e. the line in Figs. 5–8. Directly
   * comparable to the observed disease severity/incidence the paper validated
   * against (0–1; multiply by 100 for the paper's 0–100 scale).
   */
  diseaseSeverity: number;
};

export type JiRunOptions = {
  orchard?: JiOrchardParams;
  /**
   * `deltaY` — paper: dose = change in Y on rain days (default).
   * `cumulativeY` — Mathematica notebook: dose = Y_i every day (golden fixture).
   */
  doseMode?: 'deltaY' | 'cumulativeY';
  /**
   * Ji Table 1 defines SR as "cumulative precipitation that accumulated within
   * 4 weeks after budbreak". Rain past that window does not mobilise more primary
   * inoculum — the overwintering bud reservoir is finite and spent.
   *
   * Index 0 of `weather` is taken as budbreak. Pass `null` to accumulate over the
   * whole series (pre-2026-09 behaviour; only useful for testing the raw equations).
   */
  inoculumWindowDays?: number | null;
  /**
   * Secondary inoculum coefficient. Ji has no data on how weather drives secondary
   * inoculum production, and assumes only that it is proportional to S4; this is
   * that constant of proportionality. 1 means each symptomatic site contributes one
   * site-equivalent of inoculum per rain day. Set 0 to run primary inoculum only.
   */
  secondaryInoculumCoeff?: number;
  /** Incubation window (Ji: symptoms appear 15–21 days after infection). */
  incubationMinDays?: number;
  incubationMaxDays?: number;
};

/** Ji Table 1: SR accumulates over the 4 weeks following budbreak. */
export const JI_INOCULUM_WINDOW_DAYS = 28;

/** A budbreak date that recurs every season. `month` is 0-indexed. */
export type BudbreakDay = { month: number; day: number };

/**
 * Default Southern-Hemisphere budbreak: 1 October.
 *
 * Ji set budbreak to 1 April for the Californian validation epidemics, and the
 * SH equivalent of 1 April is 1 October. It also fits Chandler, a mid-late leafing
 * cultivar sitting between Payne (mid-March NH) and Franquette (late April NH).
 *
 * This was 1 September until 2026-09. The date barely mattered while SR accumulated
 * all year, but now that SR is capped to the 4 weeks after budbreak it decides the
 * entire primary-inoculum window — and September in Manjimup averages 11.9 °C, where
 * f(T) is 0.047. A September budbreak spends the orchard's whole bud reservoir during
 * the one month the temperature curve says infection cannot happen.
 */
export const DEFAULT_SH_BUDBREAK: BudbreakDay = { month: 9, day: 1 };

/**
 * Coerce a stored month/day pair into a usable budbreak, falling back to the
 * default for anything missing or out of range. Persisted settings are the input
 * here, so this must never throw.
 */
export function resolveBudbreak(month?: unknown, day?: unknown): BudbreakDay {
  const m = typeof month === 'number' && Number.isInteger(month) ? month : NaN;
  const d = typeof day === 'number' && Number.isInteger(day) ? day : NaN;
  if (Number.isNaN(m) || Number.isNaN(d)) return DEFAULT_SH_BUDBREAK;
  if (m < 0 || m > 11 || d < 1 || d > 31) return DEFAULT_SH_BUDBREAK;
  // Reject 31 Feb and friends rather than letting Date roll it into next month.
  if (d > new Date(2001, m + 1, 0).getDate()) return DEFAULT_SH_BUDBREAK;
  return { month: m, day: d };
}

/** Ji: infected sites become symptomatic 15–21 days later (delay distribution, Fig. 3). */
export const JI_INCUBATION_MIN_DAYS = 15;
export const JI_INCUBATION_MAX_DAYS = 21;

/**
 * Ji assumes secondary inoculum is proportional to S4 but gives no coefficient
 * (no data existed). 1.0 is the neutral choice: one symptomatic site yields one
 * site-equivalent of splash inoculum per rain day.
 */
export const JI_SECONDARY_INOCULUM_COEFF = 1;

/**
 * Beta temperature response — Analytis form, Ji eq. 3:
 *   f(T) = (b · Teq^c · (1 − Teq))^d
 *
 * `d` raises the whole product, not just the (1 − Teq) factor. Applying it to
 * (1 − Teq) alone moves the peak from 15.65 °C to 11.07 °C and caps the output
 * at 0.282, which cannot be right: Ji Table 1 defines INFR over 0 to 1.
 */
export function jiTempFactor(T: number, p = JI_PUBLISHED): number {
  if (T < p.TminInf || T > p.TmaxInf) return 0;
  const teq = (T - p.TminInf) / (p.TmaxInf - p.TminInf);
  if (teq <= 0 || teq >= 1) return 0;
  return (p.bBeta * teq ** p.cBeta * (1 - teq)) ** p.dBeta;
}

/** Gompertz wetness response (Ji eq. 4). */
export function jiWetnessFactor(WD: number, p = JI_PUBLISHED): number {
  return p.eGomp * Math.exp(-Math.exp(-p.fGomp * (WD - p.gGomp)));
}

export function jiDensityFactor(orchard: JiOrchardParams = {}): number {
  const dens = orchard.treeDensityPerHa;
  if (dens == null || dens <= 0) return 1;
  const ref = orchard.densityRefPerHa ?? 150;
  const alpha = orchard.alphaDensity ?? 0.28;
  const exp = orchard.densityExponent ?? 1.3;
  const factor = 1 + alpha * (dens / ref - 1);
  return Math.max(0, factor) ** exp;
}

/**
 * Run the Ji walnut blight model over a daily weather series.
 * Series index 0 is taken as budbreak (drives SR and the site cascade).
 *
 * Implements the HLIR site cascade of Ji Fig. 1 / Table 1:
 *
 *   S1 (healthy) --DISPR--> S2 (infested) --INFR--> S3 (latent) --INCR--> S4 (diseased)
 *
 * S4 sites ooze secondary inoculum on rain days, which feeds back into DISPR — that
 * loop is the epidemic engine, and without it the model is bounded by the primary
 * inoculum budget k and effectively silent after the 4-week SR window.
 *
 * Two assumptions are ours, because Ji leaves them unspecified:
 *  - S2 is transient. Sites contaminated today either become infected during today's
 *    wet period or shed their epiphytic bacteria, so only infected sites leave S1.
 *    Ji defines S2 = S1 × DISPR per day without saying what happens to the remainder.
 *  - The secondary inoculum coefficient is 1 (see JI_SECONDARY_INOCULUM_COEFF); the
 *    paper states only that production is proportional to S4.
 */
export function runJiBlightModel(
  weather: JiDailyWeather[],
  options: JiRunOptions = {}
): JiDailyResult[] {
  const p = JI_PUBLISHED;
  const k = options.orchard?.k ?? 1;
  const doseMode = options.doseMode ?? 'deltaY';
  const windowDays =
    options.inoculumWindowDays === undefined
      ? JI_INOCULUM_WINDOW_DAYS
      : options.inoculumWindowDays;
  const secondaryCoeff = options.secondaryInoculumCoeff ?? JI_SECONDARY_INOCULUM_COEFF;
  const minLag = options.incubationMinDays ?? JI_INCUBATION_MIN_DAYS;
  const maxLag = options.incubationMaxDays ?? JI_INCUBATION_MAX_DAYS;
  const densityMult = jiDensityFactor(options.orchard ?? {});

  let cumulativeRain = 0;
  let prevY = 0;

  // Site pool as a fraction of host tissue: S1 + S3 + S4 = 1 at all times.
  // Ji writes S1–S4 as "0 to k", but scaling both the pool and the inoculum by k
  // cancels k out of the result entirely and leaves the orchard inoculum setting
  // inert. Keeping the pool at 1 and letting k scale inoculum only is what makes
  // k modulate damage, which is its stated purpose.
  let S1 = 1;
  let S3 = 0;
  let S4 = 0;

  // Ji Fig. 3 delay distribution, applied as a uniform spread over 15–21 days.
  const lagSpan = maxLag - minLag + 1;
  const eruption = new Array<number>(weather.length + maxLag + 1).fill(0);

  const out: JiDailyResult[] = [];

  for (let i = 0; i < weather.length; i++) {
    const day = weather[i];
    const R = Math.max(0, day.R);
    const RH = day.RH ?? 60;
    const WD =
      typeof day.WD === 'number' && Number.isFinite(day.WD)
        ? Math.max(0, Math.min(24, day.WD))
        : estimateWetnessHoursProxy(R, RH);

    // Symptoms surfacing today: S3 → S4. These sites start producing inoculum.
    const erupting = Math.min(S3, eruption[i]);
    S3 -= erupting;
    S4 += erupting;

    // Past the window the bud reservoir is spent: SR freezes, so Y and deltaY do too.
    if (windowDays == null || i < windowDays) cumulativeRain += R;
    const Y = k * (1 - p.aMobil ** cumulativeRain);
    const deltaY = Math.max(0, Y - prevY);
    prevY = Y;

    // Both inoculum sources need rain to splash them onto healthy tissue.
    const isRainDay = R > 0;
    const primaryDose = doseMode === 'cumulativeY' ? Y : deltaY;
    const secondaryDose = isRainDay ? secondaryCoeff * S4 : 0;
    const dispersalRate = Math.min(1, densityMult * (primaryDose + secondaryDose));

    const fTemp = jiTempFactor(day.T, p);
    const fWetness = jiWetnessFactor(WD, p);
    const infectionRate = fTemp * fWetness;

    // S1 → S2 → S3, collapsed because S2 is transient.
    const newlyInfected = Math.min(S1, S1 * dispersalRate * infectionRate);
    S1 -= newlyInfected;
    S3 += newlyInfected;

    for (let lag = minLag; lag <= maxLag; lag++) {
      eruption[i + lag] += newlyInfected / lagSpan;
    }

    out.push({
      date: day.date,
      cumulativeRain,
      primaryInoculumY: Y,
      primaryDoseDelta: deltaY,
      secondaryDose,
      dispersalRate,
      wetnessHours: WD,
      fTemp,
      fWetness,
      infectionRate,
      dailyInfectionRisk: newlyInfected,
      healthySites: S1,
      latentSites: S3,
      diseasedSites: S4,
      eruptingSites: erupting,
      diseaseSeverity: S4,
    });
  }

  return out;
}
