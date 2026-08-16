/**
 * Dynamic Model chill portions (Fishman et al. 1987 / Erez) for Southern Hemisphere orchards.
 *
 * Cultivar targets and model constants live in `plugins/chill_portions/engine.json`.
 * Daily Tmax/Tmin synthesis is `chillCalculator.ts` (standalone calculator port).
 */

import {
  chillCultivars,
  chillModelConstants,
  type ChillCultivarTarget,
  type CultivarSourceKind,
} from '../farm/chillPortionsPackage';

export type { CultivarSourceKind };
export type CultivarChillTarget = ChillCultivarTarget;

/** Cited cultivar chill-portion targets (Dynamic Model) — from the chill pack. */
export const CULTIVARS: readonly CultivarChillTarget[] = chillCultivars;

export type CultivarId = string;

export function resolveCultivarTarget(
  cultivarName?: string
): CultivarChillTarget {
  if (!cultivarName?.trim()) return CULTIVARS[0]!;
  const key = cultivarName.trim().toLowerCase();
  const match = CULTIVARS.find((c) => c.id === key || c.name.toLowerCase() === key);
  if (match) return match;
  return {
    id: key,
    name: cultivarName.trim(),
    requiredCP: CULTIVARS[0]!.requiredCP,
    sourceKind: 'estimate',
    source: 'Unknown cultivar — using UCANR Chandler threshold (45 CP)',
  };
}

/** WA does not use DST; Perth is UTC+8 year-round. */
export const PERTH_UTC_OFFSET_HOURS = 8;

export type PerthYmd = { year: number; month: number; day: number; hour: number };

export function getPerthParts(date: Date = new Date()): PerthYmd {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour'),
  };
}

export function perthLocalToUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - PERTH_UTC_OFFSET_HOURS, minute, 0));
}

export type ChillSeasonWindow = {
  /** Calendar year of the Mar–Sep season (e.g. 2026 for Mar–Sep 2026). */
  seasonYear: number;
  /** Inclusive season start (1 Mar Perth). */
  start: Date;
  /** Inclusive end of accumulation (min(now, 30 Sep) in Perth terms). */
  end: Date;
  /** True when showing a completed prior season (Oct–Feb). */
  isCompleteSeason: boolean;
  label: string;
};

/**
 * Southern Hemisphere walnut chill window: 1 Mar – 30 Sep (Australia/Perth).
 * During the window → accumulate through "now". After 30 Sep until next 1 Mar →
 * report the completed Mar–Sep season.
 */
export function getSouthernHemisphereChillWindow(now: Date = new Date()): ChillSeasonWindow {
  const perth = getPerthParts(now);
  let seasonYear: number;
  let isCompleteSeason: boolean;

  if (perth.month >= 3 && perth.month <= 9) {
    seasonYear = perth.year;
    isCompleteSeason = false;
  } else if (perth.month >= 10) {
    seasonYear = perth.year;
    isCompleteSeason = true;
  } else {
    // Jan–Feb → previous calendar year's Mar–Sep season
    seasonYear = perth.year - 1;
    isCompleteSeason = true;
  }

  const start = perthLocalToUtcDate(seasonYear, 3, 1, 0, 0);
  const seasonEndCap = perthLocalToUtcDate(seasonYear, 9, 30, 23, 0);
  const end = isCompleteSeason ? seasonEndCap : now < seasonEndCap ? now : seasonEndCap;

  return {
    seasonYear,
    start,
    end,
    isCompleteSeason,
    label: isCompleteSeason
      ? `1 Mar – 30 Sep ${seasonYear} (complete)`
      : `1 Mar ${seasonYear} – now`,
  };
}

export function isInSouthernHemisphereChillSeason(date: Date): boolean {
  const { month } = getPerthParts(date);
  return month >= 3 && month <= 9;
}

export type ChillChartPoint = { month: string; portions: number };

export type ChillCalculation = {
  totalPortions: number;
  /** Portions accumulated in the 24h ending at `asOf` (path-dependent delta). */
  portionsLast24h: number;
  chartData: ChillChartPoint[];
  hoursProcessed: number;
  hoursSkipped: number;
};

/**
 * Dynamic Model (Fishman/Erez). Expects hourly °C temperatures.
 * Only hours inside the Southern Hemisphere Mar–Sep window (Perth) accumulate.
 * Null/undefined hours are skipped without advancing the intermediate product.
 *
 * `portionsLast24h` is the increase in cumulative CP over hours after
 * `asOf - 24h` (default asOf = now). The model still runs over the full series
 * so intermediate state stays correct.
 */
export function calculateChillData(
  hourlyTemps: Array<number | null | undefined>,
  timeArray: Array<string | Date>,
  options?: { enforceSeasonWindow?: boolean; asOf?: Date }
): ChillCalculation {
  const enforceSeason = options?.enforceSeasonWindow !== false;
  const asOf = options?.asOf ?? new Date();
  const cutoffMs = asOf.getTime() - 24 * 60 * 60 * 1000;
  const { e0, e1, a0, a1, slp, tetmlt, kelvinOffset } = chillModelConstants;
  const aa = a0 / a1;
  const ee = e1 - e0;

  let x = 0.0;
  let portions = 0.0;
  let portionsAtCutoff = 0.0;
  let hoursProcessed = 0;
  let hoursSkipped = 0;

  const monthlyData: Record<string, number> = {
    Mar: 0,
    Apr: 0,
    May: 0,
    Jun: 0,
    Jul: 0,
    Aug: 0,
    Sep: 0,
  };

  const monthFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Perth',
    month: 'short',
  });

  for (let i = 0; i < hourlyTemps.length; i++) {
    const t = hourlyTemps[i];
    const rawTime = timeArray[i];
    if (t === null || t === undefined || Number.isNaN(Number(t)) || rawTime == null) {
      hoursSkipped += 1;
      continue;
    }

    const date = rawTime instanceof Date ? rawTime : new Date(rawTime);
    if (Number.isNaN(date.getTime())) {
      hoursSkipped += 1;
      continue;
    }

    if (enforceSeason && !isInSouthernHemisphereChillSeason(date)) {
      hoursSkipped += 1;
      continue;
    }

    hoursProcessed += 1;
    const month = monthFmt.format(date);

    const tk = Number(t) + kelvinOffset;
    const ftmprt = (slp * tetmlt * (tk - tetmlt)) / tk;
    const sr = Math.exp(ftmprt);
    const xi = sr / (1.0 + sr);
    const xs = aa * Math.exp(ee / tk);
    const ak1 = a1 * Math.exp(-e1 / tk);
    const interE = Math.exp(-ak1);

    x = xs - (xs - x) * interE;

    if (x >= 1.0) {
      x = x * (1.0 - xi);
      portions += xi;
      if (monthlyData[month] !== undefined) {
        monthlyData[month] += xi;
      }
    }

    if (date.getTime() <= cutoffMs) {
      portionsAtCutoff = portions;
    }
  }

  const chartData = Object.keys(monthlyData).map((month) => ({
    month,
    portions: Math.round(monthlyData[month]! * 10) / 10,
  }));

  const portionsLast24h = Math.max(0, Math.round(portions - portionsAtCutoff));

  return {
    totalPortions: Math.round(portions),
    portionsLast24h,
    chartData,
    hoursProcessed,
    hoursSkipped,
  };
}
