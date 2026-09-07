/**
 * Ji et al. 2025 — mechanistic walnut blight infection risk (Cloud Functions mirror).
 *
 * This is a byte-for-byte behavioural mirror of `shared/weather/jiBlightModel.ts`
 * plus the seasonal bridge from `src/lib/runJiBlightSeries.ts`. Firebase deploys
 * only the `functions/` folder (see firebase.json) and this tsconfig is scoped to
 * `src`, so we cannot import the shared module directly. The parity test
 * `tests/functionsJiParity.test.ts` runs both implementations over the golden
 * fixture and fails if they diverge — keep them in sync.
 *
 * Published coefficients are frozen; only orchard `k` is farm-tunable.
 * @see Plans/BLIGHT_VALIDATION.md (BV-09 client ↔ Cloud Function parity)
 */

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

/** Below this: Quiet. At/above: Watch. (mirror of jiBlightBands.ts) */
export const JI_WATCH_THRESHOLD = 0.01;
/** At/above: Action. */
export const JI_ACTION_THRESHOLD = 0.05;

export type RiskBand = "quiet" | "watch" | "action";

export function bandFromRisk(risk: number): RiskBand {
  if (risk >= JI_ACTION_THRESHOLD) return "action";
  if (risk >= JI_WATCH_THRESHOLD) return "watch";
  return "quiet";
}

/**
 * Grower-facing orchard inoculum level → Ji `k`. Mirror of the shared module.
 * Workshop defaults centred on k=1 (the band/fixture calibration point).
 */
export type OrchardInoculumLevel = "low" | "medium" | "high";

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
  treeDensityPerHa?: number;
  densityRefPerHa?: number;
  alphaDensity?: number;
  densityExponent?: number;
};

export type JiDailyWeather = {
  date?: string;
  R: number;
  T: number;
  RH?: number;
  WD?: number;
};

export type JiRunOptions = {
  orchard?: JiOrchardParams;
  /**
   * `deltaY` — paper: dose = change in Y on rain days (default).
   * `cumulativeY` — Mathematica notebook: dose = Y_i every day (golden fixture).
   */
  doseMode?: "deltaY" | "cumulativeY";
  /**
   * Ji Table 1: SR is "cumulative precipitation that accumulated within 4 weeks
   * after budbreak". Index 0 of `weather` is taken as budbreak. `null` accumulates
   * over the whole series (pre-2026-09 behaviour; for testing the raw equations).
   */
  inoculumWindowDays?: number | null;
  /**
   * Secondary inoculum coefficient — Ji states only that production is proportional
   * to S4 and gives no constant. Set 0 to run primary inoculum only.
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
 * Default SH budbreak: 1 October — the SH equivalent of the 1 April default Ji used
 * for the Californian epidemics. See the shared module for why this is load-bearing.
 */
export const DEFAULT_SH_BUDBREAK: BudbreakDay = { month: 9, day: 1 };

/** Coerce stored month/day into a usable budbreak; never throws. */
export function resolveBudbreak(month?: unknown, day?: unknown): BudbreakDay {
  const m = typeof month === "number" && Number.isInteger(month) ? month : NaN;
  const d = typeof day === "number" && Number.isInteger(day) ? day : NaN;
  if (Number.isNaN(m) || Number.isNaN(d)) return DEFAULT_SH_BUDBREAK;
  if (m < 0 || m > 11 || d < 1 || d > 31) return DEFAULT_SH_BUDBREAK;
  if (d > new Date(2001, m + 1, 0).getDate()) return DEFAULT_SH_BUDBREAK;
  return { month: m, day: d };
}

/** Ji: infected sites become symptomatic 15–21 days later (delay distribution, Fig. 3). */
export const JI_INCUBATION_MIN_DAYS = 15;
export const JI_INCUBATION_MAX_DAYS = 21;

/** Neutral choice for the coefficient Ji leaves unspecified (see shared module). */
export const JI_SECONDARY_INOCULUM_COEFF = 1;

/** Interim LWD when no sensor: rain intensity + high RH (local Mathematica notebook). */
export function estimateWetnessHoursProxy(R: number, RH: number): number {
  const fromRain = R > 0.2 ? 5 + 0.8 * R : 0;
  const fromHumidity = RH > 82 ? 5 : 0;
  return Math.min(18, fromRain + fromHumidity);
}

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

export type JiDailyResult = {
  date?: string;
  cumulativeRain: number;
  primaryInoculumY: number;
  primaryDoseDelta: number;
  /** Secondary inoculum oozing from symptomatic (S4) sites, splashed on rain days. */
  secondaryDose: number;
  /** DISPR — fraction of healthy sites contaminated today (0–1). */
  dispersalRate: number;
  wetnessHours: number;
  fTemp: number;
  fWetness: number;
  infectionRate: number;
  /** S2→S3 flow: Ji's "infection severity", the grey bars in Figs. 5–8. */
  dailyInfectionRisk: number;
  /** S1 — fraction of host tissue still healthy and susceptible. */
  healthySites: number;
  /** S3 — fraction carrying latent infection. */
  latentSites: number;
  /** S4 — fraction symptomatic and producing inoculum. */
  diseasedSites: number;
  /** Fraction whose symptoms became visible today (S3→S4 flow). */
  eruptingSites: number;
  /** S4 — the disease progress curve (0–1), the line in Figs. 5–8. */
  diseaseSeverity: number;
};

/**
 * Run the Ji walnut blight model over a daily weather series (one budbreak season).
 * Mirror of shared/weather/jiBlightModel.ts — see that file for the full commentary
 * on the HLIR site cascade and the two assumptions Ji leaves unspecified.
 */
export function runJiBlightModel(
  weather: JiDailyWeather[],
  options: JiRunOptions = {}
): JiDailyResult[] {
  const p = JI_PUBLISHED;
  const k = options.orchard?.k ?? 1;
  const doseMode = options.doseMode ?? "deltaY";
  const windowDays =
    options.inoculumWindowDays === undefined
      ? JI_INOCULUM_WINDOW_DAYS
      : options.inoculumWindowDays;
  const secondaryCoeff =
    options.secondaryInoculumCoeff ?? JI_SECONDARY_INOCULUM_COEFF;
  const minLag = options.incubationMinDays ?? JI_INCUBATION_MIN_DAYS;
  const maxLag = options.incubationMaxDays ?? JI_INCUBATION_MAX_DAYS;
  const densityMult = jiDensityFactor(options.orchard ?? {});

  let cumulativeRain = 0;
  let prevY = 0;

  let S1 = 1;
  let S3 = 0;
  let S4 = 0;

  const lagSpan = maxLag - minLag + 1;
  const eruption = new Array<number>(weather.length + maxLag + 1).fill(0);

  const out: JiDailyResult[] = [];

  for (let i = 0; i < weather.length; i++) {
    const day = weather[i];
    const R = Math.max(0, day.R);
    const RH = day.RH ?? 60;
    const WD =
      typeof day.WD === "number" && Number.isFinite(day.WD)
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
    const primaryDose = doseMode === "cumulativeY" ? Y : deltaY;
    const secondaryDose = isRainDay ? secondaryCoeff * S4 : 0;
    const dispersalRate = Math.min(
      1,
      densityMult * (primaryDose + secondaryDose)
    );

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

export type SeriesWeatherDay = { T: number; RH: number; R: number; WD: number };

export type JiSeriesRow = {
  fullDate: string;
  threat: number;
  band: RiskBand;
  /** Ji disease progress curve (S4, 0–1). */
  diseaseSeverity: number;
  T: number;
  RH: number;
  R: number;
  WD: number;
};

function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isShBudbreakDay(
  date: Date,
  budbreak: BudbreakDay = DEFAULT_SH_BUDBREAK
): boolean {
  return date.getMonth() === budbreak.month && date.getDate() === budbreak.day;
}

/** First budbreak on or after rangeStart (local calendar). */
function defaultShBudbreakDate(
  rangeStart: Date,
  budbreak: BudbreakDay = DEFAULT_SH_BUDBREAK
): Date {
  const y = rangeStart.getFullYear();
  const thisYear = new Date(y, budbreak.month, budbreak.day);
  if (toLocalISOString(rangeStart) <= toLocalISOString(thisYear)) return thisYear;
  return new Date(y + 1, budbreak.month, budbreak.day);
}

/**
 * Seasonal Ji infection risk, mirroring `plugins/walnut_blight/src/runJiBlightSeries.ts`.
 * Rain / primary inoculum accumulate from each budbreak, resetting yearly.
 */
export function runJiBlightSeries(
  startDate: Date,
  endDate: Date,
  weatherData: Record<string, SeriesWeatherDay>,
  options: {
    orchard?: JiOrchardParams;
    doseMode?: JiRunOptions["doseMode"];
    budbreak?: BudbreakDay;
  } = {}
): JiSeriesRow[] {
  const budbreak = options.budbreak ?? DEFAULT_SH_BUDBREAK;
  const firstBudbreak = defaultShBudbreakDate(startDate, budbreak);
  const firstBudbreakKey = toLocalISOString(firstBudbreak);
  const doseMode = options.doseMode ?? "deltaY";

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
  const out: JiSeriesRow[] = [];

  let lastT = 15;
  let lastRH = 60;
  let lastR = 0;
  let lastWD: number | undefined;

  let segmentWeather: { date: string; R: number; T: number; RH: number; WD?: number }[] = [];
  let segmentMeta: { date: Date; key: string; beforeFirstBudbreak: boolean }[] = [];

  const flushSegment = () => {
    if (segmentWeather.length === 0) return;
    const ji = runJiBlightModel(segmentWeather, {
      orchard: options.orchard,
      doseMode,
    });
    for (let i = 0; i < segmentMeta.length; i++) {
      const m = segmentMeta[i];
      const row = ji[i];
      const risk = m.beforeFirstBudbreak ? 0 : row.dailyInfectionRisk;
      const raw = weatherData[m.key];
      const T = raw?.T ?? segmentWeather[i].T;
      const RH = raw?.RH ?? segmentWeather[i].RH;
      const R = raw?.R ?? 0;
      const threat = Number(risk.toFixed(6));
      out.push({
        fullDate: m.key,
        threat,
        band: bandFromRisk(threat),
        diseaseSeverity: m.beforeFirstBudbreak
          ? 0
          : Number(row.diseaseSeverity.toFixed(6)),
        T: Number(T.toFixed(1)),
        RH: Number(RH.toFixed(1)),
        R: Number(R.toFixed(1)),
        WD: Number(row.wetnessHours.toFixed(1)),
      });
    }
    segmentWeather = [];
    segmentMeta = [];
  };

  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const key = toLocalISOString(d);
    const w = weatherData[key];
    if (w) {
      lastT = w.T;
      lastRH = w.RH;
      lastR = w.R;
      lastWD = w.WD;
    }

    const seasonReset = isShBudbreakDay(d, budbreak) && segmentWeather.length > 0;
    if (seasonReset) {
      flushSegment();
      lastR = 0;
      lastWD = undefined;
    }

    const beforeFirstBudbreak = key < firstBudbreakKey;
    const R = beforeFirstBudbreak ? 0 : w ? w.R : lastR;
    const T = w ? w.T : lastT;
    const RH = w ? w.RH : lastRH;
    const WD = w ? w.WD : lastWD;

    segmentMeta.push({ date: d, key, beforeFirstBudbreak });
    segmentWeather.push({ date: key, R, T, RH, WD });
  }
  flushSegment();

  return out;
}
