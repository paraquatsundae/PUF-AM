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
  wetnessHours: number;
  fTemp: number;
  fWetness: number;
  /** f(T) × f(WD). */
  infectionRate: number;
  /**
   * Daily relative infection risk (notebook-compatible when `doseMode: 'cumulativeY'`).
   * Paper-faithful daily severity uses `doseMode: 'deltaY'` (default).
   */
  dailyInfectionRisk: number;
};

export type JiRunOptions = {
  orchard?: JiOrchardParams;
  /**
   * `deltaY` — paper: dose = change in Y on rain days (default).
   * `cumulativeY` — Mathematica notebook: dose = Y_i every day (golden fixture).
   */
  doseMode?: 'deltaY' | 'cumulativeY';
};

/** Beta temperature response — Analytis form as in Ji supplementary / notebook. */
export function jiTempFactor(T: number, p = JI_PUBLISHED): number {
  if (T < p.TminInf || T > p.TmaxInf) return 0;
  const teq = (T - p.TminInf) / (p.TmaxInf - p.TminInf);
  if (teq <= 0 || teq >= 1) return 0;
  return p.bBeta * teq ** p.cBeta * (1 - teq) ** p.dBeta;
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
 * Run Ji infection risk over a daily weather series.
 * Series should start at (or after) budbreak for cumulative rain / primary inoculum.
 */
export function runJiBlightModel(
  weather: JiDailyWeather[],
  options: JiRunOptions = {}
): JiDailyResult[] {
  const p = JI_PUBLISHED;
  const k = options.orchard?.k ?? 1;
  const doseMode = options.doseMode ?? 'deltaY';
  const densityMult = jiDensityFactor(options.orchard ?? {});

  let cumulativeRain = 0;
  let prevY = 0;
  const out: JiDailyResult[] = [];

  for (const day of weather) {
    const R = Math.max(0, day.R);
    const RH = day.RH ?? 60;
    const WD =
      typeof day.WD === 'number' && Number.isFinite(day.WD)
        ? Math.max(0, Math.min(24, day.WD))
        : estimateWetnessHoursProxy(R, RH);

    cumulativeRain += R;
    const Y = k * (1 - p.aMobil ** cumulativeRain);
    const deltaY = Math.max(0, Y - prevY);
    prevY = Y;

    const fTemp = jiTempFactor(day.T, p);
    const fWetness = jiWetnessFactor(WD, p);
    const infectionRate = fTemp * fWetness;
    const dose = doseMode === 'cumulativeY' ? Y : deltaY;
    const dailyInfectionRisk = infectionRate * dose * densityMult;

    out.push({
      date: day.date,
      cumulativeRain,
      primaryInoculumY: Y,
      primaryDoseDelta: deltaY,
      wetnessHours: WD,
      fTemp,
      fWetness,
      infectionRate,
      dailyInfectionRisk,
    });
  }

  return out;
}
